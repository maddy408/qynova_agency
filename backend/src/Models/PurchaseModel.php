<?php

declare(strict_types=1);

namespace App\Models;

use App\Helpers\CodeGenerator;
use App\Services\StockLedgerService;
use App\Services\SupplierLedgerService;
use PDO;

/**
 * GRN (goods-received-note) lifecycle. Creating one is the one place in
 * Phase 4 that increases stock — atomically with the supplier ledger entry
 * for whatever isn't paid up front (section 4.13). Deleting a GRN must
 * reverse both, never just delete the row (section 4.13 register note).
 *
 * Simplification: this MVP has no separate central-warehouse entity, so
 * "warehouse" stock and a branch's own floor stock are the same pool —
 * GRN receipts and POS sales both move owner_type='branch' for that branch.
 * See README assumptions.
 */
class PurchaseModel
{
    public function __construct(private PDO $pdo)
    {
    }

    public function all(int $branchId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT p.*, s.name AS supplier_name, s.phone AS supplier_phone, s.address AS supplier_address,
                    s.gstin AS supplier_gstin, b.branch_name, u.name AS created_by_name
             FROM purchases p
             JOIN suppliers s ON s.id = p.supplier_id
             LEFT JOIN branches b ON b.id = p.branch_id
             LEFT JOIN users u ON u.id = p.created_by
             WHERE p.branch_id = :branch_id
             ORDER BY p.id DESC LIMIT 200'
        );
        $stmt->execute(['branch_id' => $branchId]);
        return $stmt->fetchAll();
    }

    public function paginate(
        int $branchId,
        int $page = 1,
        int $limit = 10,
        ?string $search = null
    ): array {
        $page = max(1, $page);
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        $where = "WHERE p.branch_id = :branch_id";
        $params = ['branch_id' => $branchId];

        if ($search !== null && trim($search) !== '') {
            $where .= " AND (p.grn_no LIKE :s1 OR p.supplier_invoice_no LIKE :s2 OR s.name LIKE :s3 OR s.phone LIKE :s4)";
            $term = '%' . trim($search) . '%';
            $params['s1'] = $term;
            $params['s2'] = $term;
            $params['s3'] = $term;
            $params['s4'] = $term;
        }

        $countStmt = $this->pdo->prepare(
            "SELECT COUNT(*)
             FROM purchases p
             JOIN suppliers s ON s.id = p.supplier_id
             {$where}"
        );
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $stmt = $this->pdo->prepare(
            "SELECT p.*, s.name AS supplier_name, s.phone AS supplier_phone, s.address AS supplier_address,
                    s.gstin AS supplier_gstin, b.branch_name, u.name AS created_by_name
             FROM purchases p
             JOIN suppliers s ON s.id = p.supplier_id
             LEFT JOIN branches b ON b.id = p.branch_id
             LEFT JOIN users u ON u.id = p.created_by
             {$where}
             ORDER BY p.id DESC LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();

        return [
            'data' => $rows,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'total_pages' => (int) ceil($total / $limit),
        ];
    }


    public function find(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT p.*, s.name AS supplier_name, s.phone AS supplier_phone, s.address AS supplier_address,
                    s.gstin AS supplier_gstin, b.branch_name, u.name AS created_by_name
             FROM purchases p
             JOIN suppliers s ON s.id = p.supplier_id
             LEFT JOIN branches b ON b.id = p.branch_id
             LEFT JOIN users u ON u.id = p.created_by
             WHERE p.id = :id'
        );
        $stmt->execute(['id' => $id]);
        $purchase = $stmt->fetch();
        if (!$purchase) {
            return null;
        }

        $purchase['items'] = $this->lineItemsFor($id);

        return $purchase;
    }

    /**
     * Full item-line detail for one GRN — gross_amount/net_amount are
     * derived the exact same way PurchaseModel::priceLine() and
     * aggregateTotals() already compute them (gross = qty*rate before
     * discount; net = taxable line_total + tax_amount), never a separate
     * export-only calculation. Shared by find() (single-GRN view/print) and
     * PurchaseController's multi-GRN Excel/PDF export, so both always agree.
     */
    public function lineItemsFor(int $purchaseId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT pi.*, i.item_name, i.item_code, i.hsn_code, su.short_code AS unit_code,
                    (pi.qty + pi.free_qty) AS total_qty,
                    ROUND(pi.qty * pi.rate, 2) AS gross_amount,
                    pi.line_total AS taxable_amount,
                    ROUND(pi.line_total + pi.tax_amount, 2) AS net_amount
             FROM purchase_items pi
             JOIN items i ON i.id = pi.item_id
             LEFT JOIN stock_units su ON su.id = pi.unit_id
             WHERE pi.purchase_id = :id
             ORDER BY pi.id'
        );
        $stmt->execute(['id' => $purchaseId]);
        return $stmt->fetchAll();
    }

    /** Feeds Purchase Return's "select GRN -> pick lines" flow — see InvoiceModel::returnableItems() for the same pattern on the sales side. */
    public function returnableItems(int $purchaseId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT pi.id AS purchase_item_id, pi.item_id, i.item_name, i.item_code,
                    pi.qty AS original_qty, pi.free_qty, pi.rate, pi.mrp, pi.discount_percent, pi.discount_amount,
                    pi.tax_percent, pi.tax_amount, pi.line_total, su.short_code AS unit_code,
                    COALESCE(ret.returned_qty, 0) AS already_returned_qty,
                    GREATEST(pi.qty - COALESCE(ret.returned_qty, 0), 0) AS remaining_qty
             FROM purchase_items pi
             JOIN items i ON i.id = pi.item_id
             LEFT JOIN stock_units su ON su.id = pi.unit_id
             LEFT JOIN (
                 SELECT pri.purchase_item_id, SUM(pri.qty) AS returned_qty
                 FROM purchase_return_items pri
                 GROUP BY pri.purchase_item_id
             ) ret ON ret.purchase_item_id = pi.id
             WHERE pi.purchase_id = :purchase_id
             ORDER BY pi.id"
        );
        $stmt->execute(['purchase_id' => $purchaseId]);
        return $stmt->fetchAll();
    }

    /**
     * Prices one purchase line: gross is paid qty only (free_qty never
     * enters the money math), discount reduces the taxable base before
     * GST, MRP is stored as its own field and never derived from rate.
     * Mirrors InvoiceModel::priceLine()'s convention.
     */
    public function priceLine(array $item, array $input): array
    {
        $qty = (float) ($input['qty'] ?? 0);
        $freeQty = (float) ($input['free_qty'] ?? 0);
        $unitId = (int) ($input['unit_id'] ?? $item['base_unit_id']);
        // NET_PURRATE is the item's net purchase rate — independent of MRP
        // and of NET_SRATE (section 21); the secondary-unit rate applies
        // only when actually purchasing in that unit (section 17).
        $unitPricing = ItemModel::resolveUnitPricing($item, $unitId);
        $rate = isset($input['rate']) && $input['rate'] !== '' ? (float) $input['rate'] : $unitPricing['net_purrate'];
        $mrp = isset($input['mrp']) && $input['mrp'] !== '' ? (float) $input['mrp'] : $unitPricing['mrp'];

        $gross = round($qty * $rate, 2);
        $discountPercent = (float) ($input['discount_percent'] ?? 0);
        $discountAmount = isset($input['discount_amount']) && $input['discount_amount'] !== ''
            ? (float) $input['discount_amount']
            : round($gross * $discountPercent / 100, 2);

        $taxable = round($gross - $discountAmount, 2);
        $taxPercent = (float) ($input['tax_percent'] ?? 0);
        $taxAmount = round($taxable * $taxPercent / 100, 2);

        return [
            'item_id' => (int) $item['id'],
            'unit_id' => $unitId,
            'qty' => $qty,
            'free_qty' => $freeQty,
            'rate' => $rate,
            'mrp' => $mrp,
            'discount_percent' => $discountPercent,
            'discount_amount' => $discountAmount,
            'tax_percent' => $taxPercent,
            'tax_amount' => $taxAmount,
            'line_total' => $taxable,
            'gross' => $gross,
        ];
    }

    /** Every unpaid (or partially paid) GRN for a supplier, oldest first — feeds FIFO allocation. */
    public function unpaidForSupplier(int $supplierId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT * FROM purchases
             WHERE supplier_id = :supplier_id AND status = 'active' AND pending_balance > 0.009
             ORDER BY purchase_date, id"
        );
        $stmt->execute(['supplier_id' => $supplierId]);
        return $stmt->fetchAll();
    }

    /** Sums a set of already-priced lines (from priceLine()) into header totals. */
    private function aggregateTotals(array $lines): array
    {
        $subtotal = 0.0;
        $taxTotal = 0.0;
        foreach ($lines as $line) {
            $subtotal += $line['line_total'];
            $taxTotal += $line['tax_amount'];
        }
        return ['subtotal' => round($subtotal, 2), 'tax_total' => round($taxTotal, 2), 'grand_total' => round($subtotal + $taxTotal, 2)];
    }

    /**
     * @param array $lines Already-priced lines from priceLine() — the
     * caller (controller) resolves each item_id and calls priceLine() so
     * validation errors surface before any DB write starts, same pattern
     * as InvoiceController::prepareInvoice().
     */
    public function create(array $header, array $lines, int $createdBy): int
    {
        if (empty($lines)) {
            throw new \RuntimeException('At least one item is required');
        }

        $this->pdo->beginTransaction();
        try {
            $totals = $this->aggregateTotals($lines);
            $grandTotal = $totals['grand_total'];
            $paidAmount = min((float) ($header['paid_amount'] ?? 0), $grandTotal);

            $stmt = $this->pdo->prepare(
                'INSERT INTO purchases
                    (purchase_request_id, supplier_id, branch_id, supplier_invoice_no, purchase_date,
                     payment_mode, subtotal, tax_total, grand_total, paid_amount, created_by)
                 VALUES
                    (:purchase_request_id, :supplier_id, :branch_id, :supplier_invoice_no, CURDATE(),
                     :payment_mode, :subtotal, :tax_total, :grand_total, :paid_amount, :created_by)'
            );
            $stmt->execute([
                'purchase_request_id' => $header['purchase_request_id'] ?? null,
                'supplier_id' => $header['supplier_id'],
                'branch_id' => $header['branch_id'],
                'supplier_invoice_no' => $header['supplier_invoice_no'] ?? null,
                'payment_mode' => $header['payment_mode'] ?? 'credit',
                'subtotal' => $totals['subtotal'],
                'tax_total' => $totals['tax_total'],
                'grand_total' => $grandTotal,
                'paid_amount' => $paidAmount,
                'created_by' => $createdBy,
            ]);
            $purchaseId = (int) $this->pdo->lastInsertId();

            $this->pdo->prepare('UPDATE purchases SET grn_no = :code WHERE id = :id')
                ->execute(['code' => CodeGenerator::fromId('GRN', $purchaseId), 'id' => $purchaseId]);

            $this->insertLines($purchaseId, $lines);

            $stockService = new StockLedgerService($this->pdo);
            foreach ($lines as $line) {
                $stockService->applyMovement(
                    $line['item_id'],
                    'branch',
                    (int) $header['branch_id'],
                    $line['qty'] + $line['free_qty'],
                    'purchase',
                    'purchases',
                    $purchaseId,
                    null,
                    null,
                    $createdBy
                );
            }

            $pendingBalance = round($grandTotal - $paidAmount, 2);
            if ($pendingBalance > 0.009) {
                (new SupplierLedgerService($this->pdo))->record(
                    (int) $header['supplier_id'],
                    'purchase_credit',
                    $pendingBalance,
                    $purchaseId,
                    null,
                    "GRN " . CodeGenerator::fromId('GRN', $purchaseId),
                    $createdBy
                );
            }

            if (!empty($header['purchase_request_id'])) {
                $this->pdo->prepare("UPDATE purchase_requests SET status = 'converted_to_grn' WHERE id = :id")
                    ->execute(['id' => $header['purchase_request_id']]);
            }

            $this->pdo->commit();
            return $purchaseId;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /** Deletes a GRN, reversing its stock movement and any ledger entry it created — never a bare row delete. */
    public function delete(int $id, int $deletedBy): void
    {
        $this->pdo->beginTransaction();
        try {
            $purchase = $this->find($id);
            if (!$purchase || $purchase['status'] !== 'active') {
                throw new \RuntimeException('GRN not found or already cancelled');
            }

            $stockService = new StockLedgerService($this->pdo);
            foreach ($purchase['items'] as $line) {
                $stockService->applyMovement(
                    (int) $line['item_id'],
                    'branch',
                    (int) $purchase['branch_id'],
                    -((float) $line['qty'] + (float) $line['free_qty']),
                    'purchase_return',
                    'purchases',
                    $id,
                    'GRN deleted',
                    null,
                    $deletedBy
                );
            }

            $originalCredit = round((float) $purchase['grand_total'] - (float) $purchase['paid_amount'], 2);
            if ($originalCredit > 0.009) {
                (new SupplierLedgerService($this->pdo))->record(
                    (int) $purchase['supplier_id'],
                    'debit_note_adjustment',
                    $originalCredit,
                    $id,
                    null,
                    "GRN {$purchase['grn_no']} deleted",
                    $deletedBy
                );
            }

            $this->pdo->prepare("UPDATE purchases SET status = 'cancelled' WHERE id = :id")->execute(['id' => $id]);

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Edits an existing (active) GRN: reverses the old stock effect,
     * replaces the line items, applies the new stock effect, and adjusts
     * the supplier ledger by only the delta between old and new pending
     * balance — paid_amount (real money already paid) is never rewritten.
     * Mirrors InvoiceModel::editCompleted().
     */
    public function editPurchase(int $id, array $header, array $lines, int $actorId): array
    {
        if (empty($lines)) {
            throw new \RuntimeException('At least one item is required');
        }

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('SELECT * FROM purchases WHERE id = :id FOR UPDATE');
            $stmt->execute(['id' => $id]);
            $purchase = $stmt->fetch();

            if (!$purchase) {
                throw new \RuntimeException('GRN not found');
            }
            if ($purchase['status'] !== 'active') {
                throw new \RuntimeException('Only an active GRN can be edited');
            }

            $stmt = $this->pdo->prepare('SELECT * FROM purchase_items WHERE purchase_id = :id');
            $stmt->execute(['id' => $id]);
            $oldItems = $stmt->fetchAll();

            $stockService = new StockLedgerService($this->pdo);
            foreach ($oldItems as $item) {
                $stockService->applyMovement(
                    (int) $item['item_id'], 'branch', (int) $purchase['branch_id'],
                    -((float) $item['qty'] + (float) $item['free_qty']),
                    'purchase_return', 'purchases', $id, 'grn_edited', null, $actorId
                );
            }

            $this->pdo->prepare('DELETE FROM purchase_items WHERE purchase_id = :id')->execute(['id' => $id]);

            $totals = $this->aggregateTotals($lines);
            $this->insertLines($id, $lines);

            foreach ($lines as $line) {
                $stockService->applyMovement(
                    $line['item_id'], 'branch', (int) $purchase['branch_id'],
                    $line['qty'] + $line['free_qty'],
                    'purchase', 'purchases', $id, null, null, $actorId
                );
            }

            $paidAmount = (float) $purchase['paid_amount'];
            $oldPending = round((float) $purchase['grand_total'] - $paidAmount, 2);
            $newPending = round($totals['grand_total'] - $paidAmount, 2);
            $delta = round($newPending - $oldPending, 2);

            if (abs($delta) > 0.009) {
                (new SupplierLedgerService($this->pdo))->record(
                    (int) $purchase['supplier_id'],
                    $delta > 0 ? 'purchase_credit' : 'debit_note_adjustment',
                    abs($delta),
                    $id,
                    null,
                    "GRN {$purchase['grn_no']} edited",
                    $actorId
                );
            }

            $stmt = $this->pdo->prepare(
                'UPDATE purchases SET
                    supplier_invoice_no = :supplier_invoice_no,
                    subtotal = :subtotal, tax_total = :tax_total, grand_total = :grand_total
                 WHERE id = :id'
            );
            $stmt->execute([
                'id' => $id,
                'supplier_invoice_no' => $header['supplier_invoice_no'] ?? $purchase['supplier_invoice_no'],
                'subtotal' => $totals['subtotal'],
                'tax_total' => $totals['tax_total'],
                'grand_total' => $totals['grand_total'],
            ]);

            $this->pdo->commit();
            return $this->find($id);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    private function insertLines(int $purchaseId, array $lines): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO purchase_items
                (purchase_id, item_id, unit_id, qty, free_qty, rate, mrp, discount_percent, discount_amount, tax_percent, tax_amount, line_total)
             VALUES
                (:purchase_id, :item_id, :unit_id, :qty, :free_qty, :rate, :mrp, :discount_percent, :discount_amount, :tax_percent, :tax_amount, :line_total)'
        );
        foreach ($lines as $line) {
            $stmt->execute([
                'purchase_id' => $purchaseId,
                'item_id' => $line['item_id'],
                'unit_id' => $line['unit_id'],
                'qty' => $line['qty'],
                'free_qty' => $line['free_qty'],
                'rate' => $line['rate'],
                'mrp' => $line['mrp'],
                'discount_percent' => $line['discount_percent'],
                'discount_amount' => $line['discount_amount'],
                'tax_percent' => $line['tax_percent'],
                'tax_amount' => $line['tax_amount'],
                'line_total' => $line['line_total'],
            ]);
        }
    }
}
