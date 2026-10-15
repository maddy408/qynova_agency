<?php

declare(strict_types=1);

namespace App\Models;

use App\Helpers\Response;
use App\Services\CreditLedgerService;
use App\Services\InvoiceNumberService;
use App\Services\StockLedgerService;
use PDO;

/**
 * Orchestrates the invoice lifecycle: hold -> edit -> complete/discard
 * (amendment 4.8a). A 'held' row never touches stock, credit, or reports.
 * completion is one atomic transaction: invoice + items + payments + stock
 * movement + credit ledger entry, all-or-nothing (rule 3 / section 4.8).
 */
class InvoiceModel
{
    public function __construct(private PDO $pdo)
    {
    }

    // -----------------------------------------------------------------
    // Reads
    // -----------------------------------------------------------------

    public function all(int $branchId, ?string $status = null): array
    {
        $sql = "SELECT i.*, c.ledger_name AS customer_name, u.name AS employee_name
                FROM invoices i
                LEFT JOIN customers c ON c.id = i.customer_id
                JOIN users u ON u.id = i.employee_id
                WHERE i.branch_id = :branch_id";
        $params = ['branch_id' => $branchId];

        if ($status !== null) {
            $sql .= ' AND i.status = :status';
            $params['status'] = $status;
        } else {
            // Default history view never shows held/discardable scratch
            // bills, nor soft-deleted ones — a deleted invoice is only
            // visible by explicitly filtering ?status=deleted.
            $sql .= " AND i.status NOT IN ('held', 'deleted')";
        }

        $sql .= ' ORDER BY i.id DESC LIMIT 200';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function paginate(
        int $branchId,
        ?string $status = null,
        int $page = 1,
        int $limit = 10,
        ?string $search = null
    ): array {
        $page = max(1, $page);
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        $where = "WHERE i.branch_id = :branch_id";
        $params = ['branch_id' => $branchId];

        if ($status !== null && $status !== 'all' && $status !== '') {
            $where .= ' AND i.status = :status';
            $params['status'] = $status;
        } else {
            $where .= " AND i.status NOT IN ('held', 'deleted')";
        }

        if ($search !== null && trim($search) !== '') {
            $where .= " AND (i.invoice_no LIKE :s1 OR c.ledger_name LIKE :s2 OR c.phone LIKE :s3 OR i.vehicle_no LIKE :s4)";
            $term = '%' . trim($search) . '%';
            $params['s1'] = $term;
            $params['s2'] = $term;
            $params['s3'] = $term;
            $params['s4'] = $term;
        }

        $countStmt = $this->pdo->prepare(
            "SELECT COUNT(*)
             FROM invoices i
             LEFT JOIN customers c ON c.id = i.customer_id
             JOIN users u ON u.id = i.employee_id
             {$where}"
        );
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $stmt = $this->pdo->prepare(
            "SELECT i.*, c.ledger_name AS customer_name, u.name AS employee_name
             FROM invoices i
             LEFT JOIN customers c ON c.id = i.customer_id
             JOIN users u ON u.id = i.employee_id
             {$where}
             ORDER BY i.id DESC LIMIT :limit OFFSET :offset"
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
            'SELECT i.*, c.ledger_name AS customer_name, c.phone AS customer_phone, u.name AS employee_name,
                    cu.name AS cancelled_by_name, du.name AS deleted_by_name
             FROM invoices i
             LEFT JOIN customers c ON c.id = i.customer_id
             JOIN users u ON u.id = i.employee_id
             LEFT JOIN users cu ON cu.id = i.cancelled_by
             LEFT JOIN users du ON du.id = i.deleted_by
             WHERE i.id = :id'
        );
        $stmt->execute(['id' => $id]);
        $invoice = $stmt->fetch();
        if (!$invoice) {
            return null;
        }

        $stmt = $this->pdo->prepare(
            // net_amount = the GST-inclusive line total (line_total is
            // taxable value only, i.e. post-discount but pre-tax) — the one
            // place this is computed, so every consumer (web/mobile print,
            // invoice detail, invoice management) reads the same number
            // instead of five different places re-deriving it.
            'SELECT ii.*, su.short_code AS unit_code,
                    ROUND(ii.line_total + ii.tax_amount + ii.cess_amount, 2) AS net_amount
             FROM invoice_items ii
             JOIN stock_units su ON su.id = ii.unit_id
             WHERE ii.invoice_id = :id'
        );
        $stmt->execute(['id' => $id]);
        $invoice['items'] = $stmt->fetchAll();

        $stmt = $this->pdo->prepare('SELECT * FROM invoice_payments WHERE invoice_id = :id');
        $stmt->execute(['id' => $id]);
        $invoice['payments'] = $stmt->fetchAll();

        return $invoice;
    }

    /**
     * Feeds Sale Return's "select invoice -> pick lines" flow: every line
     * plus how much of it has already been returned (summed from
     * sales_return_items rather than a maintained counter, so it can never
     * drift) and what's left returnable. A rejected return never reserved
     * any quantity, so it's excluded from the already-returned sum.
     */
    public function returnableItems(int $invoiceId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT ii.id AS invoice_item_id, ii.item_id, ii.item_name_snapshot AS item_name, ii.hsn_snapshot,
                    ii.qty AS original_qty, ii.rate, ii.mrp, ii.discount_percent, ii.discount_amount,
                    ii.tax_percent, ii.tax_amount, ii.line_total, su.short_code AS unit_code,
                    COALESCE(ret.returned_qty, 0) AS already_returned_qty,
                    GREATEST(ii.qty - COALESCE(ret.returned_qty, 0), 0) AS remaining_qty
             FROM invoice_items ii
             JOIN stock_units su ON su.id = ii.unit_id
             LEFT JOIN (
                 SELECT sri.invoice_item_id, SUM(sri.qty) AS returned_qty
                 FROM sales_return_items sri
                 JOIN sales_returns sr ON sr.id = sri.sales_return_id
                 WHERE sr.status <> 'rejected'
                 GROUP BY sri.invoice_item_id
             ) ret ON ret.invoice_item_id = ii.id
             WHERE ii.invoice_id = :invoice_id
             ORDER BY ii.id"
        );
        $stmt->execute(['invoice_id' => $invoiceId]);
        return $stmt->fetchAll();
    }

    // -----------------------------------------------------------------
    // Hold / edit / discard — no stock, credit, or numbering effects.
    // -----------------------------------------------------------------

    public function createHeld(array $header, array $cartLines): int
    {
        $this->pdo->beginTransaction();
        try {
            $totals = $this->computeTotals($cartLines);

            $stmt = $this->pdo->prepare(
                'INSERT INTO invoices
                    (branch_id, customer_id, employee_id, bill_type, price_type, invoice_format, invoice_date,
                     subtotal, discount_amount, taxable_value, cgst_amount, sgst_amount, igst_amount,
                     cess_amount, round_off, grand_total, vehicle_no, status)
                 VALUES
                    (:branch_id, :customer_id, :employee_id, :bill_type, :price_type, :invoice_format, CURDATE(),
                     :subtotal, :discount_amount, :taxable_value, :cgst_amount, :sgst_amount, :igst_amount,
                     :cess_amount, :round_off, :grand_total, :vehicle_no, \'held\')'
            );
            $stmt->execute([
                'branch_id' => $header['branch_id'],
                'customer_id' => $header['customer_id'],
                'employee_id' => $header['employee_id'],
                'bill_type' => $header['bill_type'],
                'price_type' => $header['price_type'] ?? 'normal',
                'invoice_format' => $header['invoice_format'],
                'vehicle_no' => $header['vehicle_no'] ?? null,
                ...$totals,
            ]);
            $invoiceId = (int) $this->pdo->lastInsertId();

            $this->insertLineItems($invoiceId, $cartLines);

            $this->pdo->commit();
            return $invoiceId;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function updateHeld(int $id, array $header, array $cartLines): void
    {
        $this->pdo->beginTransaction();
        try {
            $totals = $this->computeTotals($cartLines);

            $stmt = $this->pdo->prepare(
                'UPDATE invoices SET
                    customer_id = :customer_id, bill_type = :bill_type, price_type = :price_type, invoice_format = :invoice_format,
                    vehicle_no = :vehicle_no, subtotal = :subtotal, discount_amount = :discount_amount,
                    taxable_value = :taxable_value, cgst_amount = :cgst_amount, sgst_amount = :sgst_amount,
                    igst_amount = :igst_amount, cess_amount = :cess_amount, round_off = :round_off,
                    grand_total = :grand_total
                 WHERE id = :id AND status = \'held\''
            );
            $stmt->execute([
                'id' => $id,
                'customer_id' => $header['customer_id'],
                'bill_type' => $header['bill_type'],
                'price_type' => $header['price_type'] ?? 'normal',
                'invoice_format' => $header['invoice_format'],
                'vehicle_no' => $header['vehicle_no'] ?? null,
                ...$totals,
            ]);

            $this->pdo->prepare('DELETE FROM invoice_items WHERE invoice_id = :id')->execute(['id' => $id]);
            $this->insertLineItems($id, $cartLines);

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function discardHeld(int $id): void
    {
        // Nothing else references a held row yet, so a hard delete is safe.
        $this->pdo->prepare("DELETE FROM invoices WHERE id = :id AND status = 'held'")->execute(['id' => $id]);
    }

    // -----------------------------------------------------------------
    // Completion — the one atomic transaction (rule 3, section 4.8).
    // -----------------------------------------------------------------

    /**
     * @param array $payments [{payment_method, amount, reference_no}]
     */
    public function complete(int $id, array $payments, int $employeeId): array
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('SELECT * FROM invoices WHERE id = :id FOR UPDATE');
            $stmt->execute(['id' => $id]);
            $invoice = $stmt->fetch();

            if (!$invoice) {
                throw new \RuntimeException('Invoice not found');
            }
            if ($invoice['status'] !== 'held') {
                throw new \RuntimeException('Only a held bill can be completed');
            }

            $stmt = $this->pdo->prepare('SELECT * FROM invoice_items WHERE invoice_id = :id');
            $stmt->execute(['id' => $id]);
            $items = $stmt->fetchAll();
            if (empty($items)) {
                throw new \RuntimeException('Cannot complete an empty bill');
            }

            $grandTotal = (float) $invoice['grand_total'];
            $nonCreditPaid = 0.0;
            $creditPortion = 0.0;
            foreach ($payments as $p) {
                if (($p['payment_method'] ?? '') === 'credit') {
                    $creditPortion += (float) $p['amount'];
                } else {
                    $nonCreditPaid += (float) $p['amount'];
                }
            }
            // Whatever isn't explicitly covered by a payment line is implicitly credit
            // only if a customer is attached; otherwise it must be fully paid.
            $uncovered = round($grandTotal - $nonCreditPaid - $creditPortion, 2);
            if ($uncovered > 0.009) {
                if ($invoice['customer_id'] === null) {
                    throw new \RuntimeException('Walk-in sales cannot be left partially unpaid — attach a customer for credit');
                }
                $creditPortion += $uncovered;
            }

            $paidAmount = min($nonCreditPaid, $grandTotal);
            if ($creditPortion > 0.009 && $invoice['customer_id'] === null) {
                throw new \RuntimeException('Cannot extend credit to a walk-in sale — select a customer first');
            }

            $paymentStatus = 'paid';
            if ($creditPortion > 0.009) {
                $paymentStatus = $paidAmount > 0.009 ? 'partial' : 'credit';
            }

            $series = $invoice['bill_type'] === 'gst' ? 'gst' : 'non_gst';
            $invoiceNo = (new InvoiceNumberService($this->pdo))->next((int) $invoice['branch_id'], $series);

            $stockService = new StockLedgerService($this->pdo);
            foreach ($items as $item) {
                $qtyTotal = (float) $item['qty'] + (float) $item['free_qty'];
                $stockService->applyMovement(
                    (int) $item['item_id'],
                    'branch',
                    (int) $invoice['branch_id'],
                    -$qtyTotal,
                    'sale',
                    'invoices',
                    $id,
                    null,
                    null,
                    $employeeId
                );
            }

            foreach ($payments as $p) {
                if (($p['payment_method'] ?? '') === 'credit') {
                    continue; // credit is tracked via credit_transactions, not a money-received row
                }
                $this->pdo->prepare(
                    'INSERT INTO invoice_payments (invoice_id, payment_method, amount, reference_no)
                     VALUES (:invoice_id, :method, :amount, :reference_no)'
                )->execute([
                    'invoice_id' => $id,
                    'method' => $p['payment_method'],
                    'amount' => $p['amount'],
                    'reference_no' => $p['reference_no'] ?? null,
                ]);
            }

            $customerOutstandingAfter = null;
            if ($creditPortion > 0.009) {
                $credit = new CreditLedgerService($this->pdo);
                $customerOutstandingAfter = $credit->record(
                    (int) $invoice['customer_id'],
                    'sale_credit',
                    $creditPortion,
                    $id,
                    "Invoice {$invoiceNo}",
                    $employeeId
                );
            } elseif ($invoice['customer_id'] !== null) {
                $credit = new CreditLedgerService($this->pdo);
                $customerOutstandingAfter = $credit->currentOutstanding((int) $invoice['customer_id']);
            }

            $this->pdo->prepare(
                'UPDATE invoices SET
                    invoice_no = :invoice_no, status = \'completed\', payment_status = :payment_status,
                    paid_amount = :paid_amount, customer_outstanding_after = :outstanding
                 WHERE id = :id'
            )->execute([
                'invoice_no' => $invoiceNo,
                'payment_status' => $paymentStatus,
                'paid_amount' => $paidAmount,
                'outstanding' => $customerOutstandingAfter,
                'id' => $id,
            ]);

            $this->pdo->commit();
            return $this->find($id);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    // -----------------------------------------------------------------
    // Edit a completed invoice — reverses the old stock effect, applies the
    // new one, and adjusts only the DELTA on the customer's credit ledger.
    // Never touches invoice_payments (real money already received is never
    // rewritten) and never reassigns invoice_no. Blocked once a sales
    // return exists against this invoice, same as cancel, because the
    // return already reversed part of the original lines.
    // -----------------------------------------------------------------

    public function editCompleted(int $id, array $header, array $cartLines, int $actorId): array
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('SELECT * FROM invoices WHERE id = :id FOR UPDATE');
            $stmt->execute(['id' => $id]);
            $invoice = $stmt->fetch();

            if (!$invoice) {
                throw new \RuntimeException('Invoice not found');
            }
            if ($invoice['status'] !== 'completed') {
                throw new \RuntimeException('Only a completed invoice can be edited');
            }

            $stmt = $this->pdo->prepare(
                "SELECT id FROM sales_returns WHERE invoice_id = :id AND status <> 'rejected' LIMIT 1"
            );
            $stmt->execute(['id' => $id]);
            if ($stmt->fetch()) {
                throw new \RuntimeException('Cannot edit — this invoice already has a sales return against it. Use a fresh sales return instead.');
            }

            if (empty($cartLines)) {
                throw new \RuntimeException('Cannot edit to an empty bill — cancel it instead');
            }

            $stmt = $this->pdo->prepare('SELECT * FROM invoice_items WHERE invoice_id = :id');
            $stmt->execute(['id' => $id]);
            $oldItems = $stmt->fetchAll();

            $stockService = new StockLedgerService($this->pdo);

            // Reverse the original stock effect of every original line...
            foreach ($oldItems as $item) {
                $qtyTotal = (float) $item['qty'] + (float) $item['free_qty'];
                $stockService->applyMovement(
                    (int) $item['item_id'], 'branch', (int) $invoice['branch_id'], $qtyTotal,
                    'sale_return', 'invoices', $id, 'invoice_edited', null, $actorId
                );
            }

            $this->pdo->prepare('DELETE FROM invoice_items WHERE invoice_id = :id')->execute(['id' => $id]);

            $totals = $this->computeTotals($cartLines);
            $this->insertLineItems($id, $cartLines);

            // ...then apply the new one. Never netted against the reversal
            // above — two separate audited movements, same as cancel+rebill
            // would produce, just against the same invoice row.
            foreach ($cartLines as $line) {
                $qtyTotal = (float) $line['qty'] + (float) $line['free_qty'];
                $stockService->applyMovement(
                    (int) $line['item_id'], 'branch', (int) $invoice['branch_id'], -$qtyTotal,
                    'sale', 'invoices', $id, null, null, $actorId
                );
            }

            // The customer this invoice belongs to AFTER the edit — never the
            // stale pre-edit value. array_key_exists (not ??) because the
            // caller may deliberately set customer_id to null to convert a
            // credit sale back to walk-in, which must not fall back to the
            // old value.
            $newCustomerId = array_key_exists('customer_id', $header) ? $header['customer_id'] : $invoice['customer_id'];

            $paidAmount = (float) $invoice['paid_amount'];
            $oldUnpaid = max(0.0, round((float) $invoice['grand_total'] - $paidAmount, 2));
            $newUnpaid = max(0.0, round($totals['grand_total'] - $paidAmount, 2));
            $delta = round($newUnpaid - $oldUnpaid, 2);

            if ($newUnpaid > 0.009 && $newCustomerId === null) {
                throw new \RuntimeException('Cannot leave a walk-in invoice partially unpaid — attach a customer, or reduce the total to match what was already paid');
            }

            $oldCustomerId = $invoice['customer_id'] !== null ? (int) $invoice['customer_id'] : null;
            $newCustomerIdInt = $newCustomerId !== null ? (int) $newCustomerId : null;
            $customerOutstandingAfter = $invoice['customer_outstanding_after'];
            $credit = new CreditLedgerService($this->pdo);

            if ($oldCustomerId !== $newCustomerIdInt) {
                // Reassigned to a different customer — a plain delta would
                // apply to the new customer only, leaving the old
                // customer's ledger permanently overstated. Fully reverse
                // the old customer's original share, then fully apply the
                // new unpaid amount to the new customer.
                if ($oldCustomerId !== null && $oldUnpaid > 0.009) {
                    $credit->record(
                        $oldCustomerId, 'credit_reversal', $oldUnpaid, $id,
                        'Invoice ' . $invoice['invoice_no'] . ' edited (reassigned)', $actorId
                    );
                }
                $customerOutstandingAfter = null;
                if ($newCustomerIdInt !== null && $newUnpaid > 0.009) {
                    $customerOutstandingAfter = $credit->record(
                        $newCustomerIdInt, 'sale_credit', $newUnpaid, $id,
                        'Invoice ' . $invoice['invoice_no'] . ' edited (reassigned)', $actorId
                    );
                } elseif ($newCustomerIdInt !== null) {
                    $customerOutstandingAfter = $credit->currentOutstanding($newCustomerIdInt);
                }
            } elseif (abs($delta) > 0.009 && $newCustomerIdInt !== null) {
                $customerOutstandingAfter = $credit->record(
                    $newCustomerIdInt,
                    $delta > 0 ? 'sale_credit' : 'credit_reversal',
                    abs($delta),
                    $id,
                    'Invoice ' . $invoice['invoice_no'] . ' edited',
                    $actorId
                );
            }

            $paymentStatus = 'paid';
            if ($newUnpaid > 0.009) {
                $paymentStatus = $paidAmount > 0.009 ? 'partial' : 'credit';
            }

            $stmt = $this->pdo->prepare(
                'UPDATE invoices SET
                    customer_id = :customer_id, vehicle_no = :vehicle_no,
                    subtotal = :subtotal, discount_amount = :discount_amount, taxable_value = :taxable_value,
                    cgst_amount = :cgst_amount, sgst_amount = :sgst_amount, igst_amount = :igst_amount,
                    cess_amount = :cess_amount, round_off = :round_off, grand_total = :grand_total,
                    payment_status = :payment_status, customer_outstanding_after = :outstanding,
                    edited_at = NOW(), edited_by = :edited_by
                 WHERE id = :id'
            );
            $stmt->execute([
                'id' => $id,
                'customer_id' => $newCustomerId,
                'vehicle_no' => $header['vehicle_no'] ?? $invoice['vehicle_no'],
                'payment_status' => $paymentStatus,
                'outstanding' => $customerOutstandingAfter,
                'edited_by' => $actorId,
                ...$totals,
            ]);

            $this->pdo->commit();
            return $this->find($id);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    // -----------------------------------------------------------------
    // Cancel — reverses stock + credit atomically, never a hard delete.
    // -----------------------------------------------------------------

    public function cancel(int $id, int $actorId, ?string $reason): array
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('SELECT * FROM invoices WHERE id = :id FOR UPDATE');
            $stmt->execute(['id' => $id]);
            $invoice = $stmt->fetch();

            if (!$invoice) {
                throw new \RuntimeException('Invoice not found');
            }
            if ($invoice['status'] !== 'completed') {
                throw new \RuntimeException('Only a completed invoice can be cancelled');
            }

            $stmt = $this->pdo->prepare(
                "SELECT id FROM sales_returns WHERE invoice_id = :id AND status <> 'rejected' LIMIT 1"
            );
            $stmt->execute(['id' => $id]);
            if ($stmt->fetch()) {
                throw new \RuntimeException('Cannot cancel — this invoice already has a sales return against it');
            }

            $stmt = $this->pdo->prepare('SELECT * FROM invoice_items WHERE invoice_id = :id');
            $stmt->execute(['id' => $id]);
            $items = $stmt->fetchAll();

            $stockService = new StockLedgerService($this->pdo);
            foreach ($items as $item) {
                $qtyTotal = (float) $item['qty'] + (float) $item['free_qty'];
                $stockService->applyMovement(
                    (int) $item['item_id'],
                    'branch',
                    (int) $invoice['branch_id'],
                    $qtyTotal,
                    'sale_return',
                    'invoices',
                    $id,
                    'invoice_cancelled',
                    $reason,
                    $actorId
                );
            }

            // Only reverse whatever is still outstanding on this invoice —
            // any part already collected via a customer payment has already
            // reduced the ledger balance through that collection's own entry.
            $outstanding = (float) $invoice['grand_total'] - (float) $invoice['paid_amount'];
            if ($outstanding > 0.009 && $invoice['customer_id'] !== null) {
                (new CreditLedgerService($this->pdo))->record(
                    (int) $invoice['customer_id'],
                    'credit_reversal',
                    $outstanding,
                    $id,
                    'Invoice ' . $invoice['invoice_no'] . ' cancelled' . ($reason ? ": {$reason}" : ''),
                    $actorId
                );
            }

            $this->pdo->prepare(
                "UPDATE invoices SET status = 'cancelled', payment_status = 'cancelled',
                    cancelled_by = :by, cancelled_at = NOW(), cancel_reason = :reason
                 WHERE id = :id"
            )->execute(['by' => $actorId, 'reason' => $reason, 'id' => $id]);

            $this->pdo->commit();
            return $this->find($id);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    // -----------------------------------------------------------------
    // Delete — soft-deletes a completed invoice, distinct from cancel().
    // Reverses the same stock/credit effects as cancel (so inventory and
    // customer balances stay correct), but unlike cancel, clears invoice_no
    // back to NULL (preserving the original in original_invoice_no for
    // audit) so InvoiceNumberService can reissue that number to the next
    // invoice created in the same branch+series+year. A cancelled invoice
    // is never touched by this path — its number is permanently consumed.
    // -----------------------------------------------------------------

    public function deleteInvoice(int $id, int $actorId, ?string $reason): array
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('SELECT * FROM invoices WHERE id = :id FOR UPDATE');
            $stmt->execute(['id' => $id]);
            $invoice = $stmt->fetch();

            if (!$invoice) {
                throw new \RuntimeException('Invoice not found');
            }
            if ($invoice['status'] !== 'completed') {
                throw new \RuntimeException('Only a completed invoice can be deleted');
            }

            $stmt = $this->pdo->prepare(
                "SELECT id FROM sales_returns WHERE invoice_id = :id AND status <> 'rejected' LIMIT 1"
            );
            $stmt->execute(['id' => $id]);
            if ($stmt->fetch()) {
                throw new \RuntimeException('Cannot delete — this invoice already has a sales return against it');
            }

            $stmt = $this->pdo->prepare('SELECT * FROM invoice_items WHERE invoice_id = :id');
            $stmt->execute(['id' => $id]);
            $items = $stmt->fetchAll();

            $stockService = new StockLedgerService($this->pdo);
            foreach ($items as $item) {
                $qtyTotal = (float) $item['qty'] + (float) $item['free_qty'];
                $stockService->applyMovement(
                    (int) $item['item_id'],
                    'branch',
                    (int) $invoice['branch_id'],
                    $qtyTotal,
                    'sale_return',
                    'invoices',
                    $id,
                    'invoice_deleted',
                    $reason,
                    $actorId
                );
            }

            // Same reversal rule as cancel: only whatever's still
            // outstanding, since anything already collected already reduced
            // the ledger via that collection's own entry.
            $outstanding = (float) $invoice['grand_total'] - (float) $invoice['paid_amount'];
            if ($outstanding > 0.009 && $invoice['customer_id'] !== null) {
                (new CreditLedgerService($this->pdo))->record(
                    (int) $invoice['customer_id'],
                    'credit_reversal',
                    $outstanding,
                    $id,
                    'Invoice ' . $invoice['invoice_no'] . ' deleted' . ($reason ? ": {$reason}" : ''),
                    $actorId
                );
            }

            $this->pdo->prepare(
                "UPDATE invoices SET status = 'deleted', original_invoice_no = invoice_no, invoice_no = NULL,
                    deleted_by = :by, deleted_at = NOW(), delete_reason = :reason
                 WHERE id = :id"
            )->execute(['by' => $actorId, 'reason' => $reason, 'id' => $id]);

            $this->pdo->commit();
            return $this->find($id);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    // -----------------------------------------------------------------
    // Shared line-item math
    // -----------------------------------------------------------------

    /**
     * Builds one priced cart line from raw POS input + the item's current
     * catalog data. Called by the controller so validation errors (unknown
     * item, etc.) surface before any DB write starts.
     */
    /**
     * $billType is the invoice-level GST/Non-GST choice, $priceType is the
     * invoice-level Normal/Retail/Wholesale choice (Phase 14) — the two are
     * completely independent: $billType only zeroes tax, $priceType only
     * picks which rate resolveSellingPrice() returns. Neither ever touches
     * the item master's own tax_code or NET_SRATE, and both always win over
     * whatever the frontend sends, so a manipulated request can't sneak GST
     * onto a Non-GST bill or a different rate onto a Retail/Wholesale line.
     */
    public function priceLine(array $item, array $input, string $billType = 'gst', string $priceType = 'normal'): array
    {
        $qty = (float) ($input['qty'] ?? 0);
        $freeQty = (float) ($input['free_qty'] ?? 0);
        $unitId = (int) ($input['unit_id'] ?? $item['base_unit_id']);
        // resolveSellingPrice picks NET_SRATE/Retail/Wholesale for the unit
        // actually being sold — never MRP, never NET_PURRATE (section 17).
        $unitPricing = ItemModel::resolveSellingPrice($item, $unitId, $priceType);
        $rate = isset($input['rate']) && $input['rate'] !== '' ? (float) $input['rate'] : $unitPricing['rate'];

        $gross = round($qty * $rate, 2);
        $discountPercent = (float) ($input['discount_percent'] ?? 0);
        $discountAmount = isset($input['discount_amount']) && $input['discount_amount'] !== ''
            ? (float) $input['discount_amount']
            : round($gross * $discountPercent / 100, 2);

        $taxable = round($gross - $discountAmount, 2);
        if ($billType === 'non_gst') {
            $taxPercent = 0.0;
            $taxAmount = 0.0;
            $cessAmount = 0.0;
        } else {
            $taxPercent = (float) ($item['gst_percent'] ?? 0);
            $taxAmount = round($taxable * $taxPercent / 100, 2);
            $cessPercent = (float) ($item['cess_percent'] ?? 0);
            $cessAmount = $cessPercent > 0 ? round($taxable * $cessPercent / 100, 2) : 0;
        }

        return [
            'item_id' => (int) $item['id'],
            'unit_id' => $unitId,
            'item_name_snapshot' => $item['item_name'],
            'hsn_snapshot' => $item['hsn_code'],
            'qty' => $qty,
            'free_qty' => $freeQty,
            'rate' => $rate,
            'mrp' => isset($input['mrp']) && $input['mrp'] !== '' ? (float) $input['mrp'] : $unitPricing['mrp'],
            'discount_percent' => $discountPercent,
            'discount_amount' => $discountAmount,
            'tax_percent' => $taxPercent,
            'tax_amount' => $taxAmount,
            'cess_amount' => $cessAmount,
            'line_total' => $taxable,
        ];
    }

    private function insertLineItems(int $invoiceId, array $lines): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO invoice_items
                (invoice_id, item_id, unit_id, item_name_snapshot, hsn_snapshot, qty, free_qty, rate, mrp,
                 discount_percent, discount_amount, tax_percent, tax_amount, cess_amount, line_total)
             VALUES
                (:invoice_id, :item_id, :unit_id, :item_name_snapshot, :hsn_snapshot, :qty, :free_qty, :rate, :mrp,
                 :discount_percent, :discount_amount, :tax_percent, :tax_amount, :cess_amount, :line_total)'
        );
        foreach ($lines as $line) {
            $stmt->execute(['invoice_id' => $invoiceId, ...$line]);
        }
    }

    private function computeTotals(array $lines): array
    {
        $subtotal = 0.0;
        $discountAmount = 0.0;
        $taxableValue = 0.0;
        $taxAmount = 0.0;
        $cessAmount = 0.0;

        foreach ($lines as $line) {
            $subtotal += $line['qty'] * $line['rate'];
            $discountAmount += $line['discount_amount'];
            $taxableValue += $line['line_total'];
            $taxAmount += $line['tax_amount'];
            $cessAmount += $line['cess_amount'];
        }

        // Seeded GST slabs are always an even CGST/SGST split; IGST
        // (interstate) branching is an open item in the spec itself —
        // deferred, see README assumptions.
        $cgst = round($taxAmount / 2, 2);
        $sgst = round($taxAmount - $cgst, 2);

        $rawTotal = $taxableValue + $taxAmount + $cessAmount;
        $grandTotal = round($rawTotal);
        $roundOff = round($grandTotal - $rawTotal, 2);

        return [
            'subtotal' => round($subtotal, 2),
            'discount_amount' => round($discountAmount, 2),
            'taxable_value' => round($taxableValue, 2),
            'cgst_amount' => $cgst,
            'sgst_amount' => $sgst,
            'igst_amount' => 0,
            'cess_amount' => round($cessAmount, 2),
            'round_off' => $roundOff,
            'grand_total' => $grandTotal,
        ];
    }
}
