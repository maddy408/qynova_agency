<?php

declare(strict_types=1);

namespace App\Models;

use App\Helpers\CodeGenerator;
use App\Services\StockLedgerService;
use App\Services\SupplierLedgerService;
use PDO;
use RuntimeException;

/** Purchase returns — supplier-side mirror of SalesReturnModel (section 4.9). */
class PurchaseReturnModel
{
    public function __construct(private PDO $pdo)
    {
    }

    public function all(int $branchId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT pr.*, s.name AS supplier_name, p.grn_no
             FROM purchase_returns pr
             JOIN suppliers s ON s.id = pr.supplier_id
             LEFT JOIN purchases p ON p.id = pr.purchase_id
             WHERE pr.branch_id = :branch_id ORDER BY pr.id DESC"
        );
        $stmt->execute(['branch_id' => $branchId]);
        return $stmt->fetchAll();
    }

    public function paginate(int $branchId, int $page = 1, int $limit = 10, ?string $search = null): array
    {
        $whereSql = "WHERE pr.branch_id = :branch_id";
        $params = ['branch_id' => $branchId];

        if ($search !== null && $search !== '') {
            $whereSql .= " AND (pr.return_no LIKE :s1 OR s.name LIKE :s2 OR p.grn_no LIKE :s3)";
            $params['s1'] = "%{$search}%";
            $params['s2'] = "%{$search}%";
            $params['s3'] = "%{$search}%";
        }

        $countStmt = $this->pdo->prepare(
            "SELECT COUNT(*) FROM purchase_returns pr
             JOIN suppliers s ON s.id = pr.supplier_id
             LEFT JOIN purchases p ON p.id = pr.purchase_id
             {$whereSql}"
        );
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $totalPages = $limit > 0 ? (int) ceil($total / $limit) : 1;
        $offset = ($page - 1) * $limit;

        $stmt = $this->pdo->prepare(
            "SELECT pr.*, s.name AS supplier_name, p.grn_no
             FROM purchase_returns pr
             JOIN suppliers s ON s.id = pr.supplier_id
             LEFT JOIN purchases p ON p.id = pr.purchase_id
             {$whereSql}
             ORDER BY pr.id DESC LIMIT {$limit} OFFSET {$offset}"
        );
        $stmt->execute($params);
        $data = $stmt->fetchAll();

        return [
            'data' => $data,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'total_pages' => $totalPages,
        ];
    }

    public function find(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            "SELECT pr.*, s.name AS supplier_name, p.grn_no
             FROM purchase_returns pr
             JOIN suppliers s ON s.id = pr.supplier_id
             LEFT JOIN purchases p ON p.id = pr.purchase_id
             WHERE pr.id = :id"
        );
        $stmt->execute(['id' => $id]);
        $return = $stmt->fetch();
        if (!$return) {
            return null;
        }

        $stmt = $this->pdo->prepare(
            'SELECT pri.*, it.item_name FROM purchase_return_items pri
             JOIN items it ON it.id = pri.item_id WHERE pri.purchase_return_id = :id'
        );
        $stmt->execute(['id' => $id]);
        $return['items'] = $stmt->fetchAll();

        return $return;
    }

    /**
     * @param array $lines Each: item_id, qty, rate, and optionally purchase_item_id
     *                      (the original purchase_items.id this line was returned
     *                      against — omitted for returns not tied to a specific GRN).
     * @param float|null $refundAmount How much the supplier actually refunds/credits
     *                      back — defaults to the full return total; capped at it.
     *                      Independent of the supplier ledger debit-note adjustment
     *                      below, which always reflects the full return value (that's
     *                      what's owed less, regardless of how much cash changes hands).
     */
    public function create(array $header, array $lines, int $createdBy, ?float $refundAmount = null): int
    {
        $this->pdo->beginTransaction();
        try {
            if (!empty($header['purchase_id'])) {
                $this->assertWithinReturnableQty((int) $header['purchase_id'], $lines);
            }

            $returnTotal = round(array_sum(array_map(
                fn ($l) => (float) $l['qty'] * (float) $l['rate'],
                $lines
            )), 2);
            $refundAmount = $refundAmount ?? $returnTotal;
            if ($refundAmount < 0) {
                throw new RuntimeException('Refund amount cannot be negative.');
            }
            if ($refundAmount > $returnTotal + 0.009) {
                throw new RuntimeException(sprintf(
                    'Refund amount (%.2f) cannot exceed the return total (%.2f).',
                    $refundAmount,
                    $returnTotal
                ));
            }

            $stmt = $this->pdo->prepare(
                'INSERT INTO purchase_returns (purchase_id, supplier_id, branch_id, reason, return_total, refund_amount, created_by)
                 VALUES (:purchase_id, :supplier_id, :branch_id, :reason, :return_total, :refund_amount, :created_by)'
            );
            $stmt->execute([
                'purchase_id' => $header['purchase_id'] ?? null,
                'supplier_id' => $header['supplier_id'],
                'branch_id' => $header['branch_id'],
                'reason' => $header['reason'] ?? null,
                'return_total' => $returnTotal,
                'refund_amount' => round($refundAmount, 2),
                'created_by' => $createdBy,
            ]);
            $id = (int) $this->pdo->lastInsertId();

            $this->pdo->prepare('UPDATE purchase_returns SET return_no = :code WHERE id = :id')
                ->execute(['code' => CodeGenerator::fromId('PRT', $id), 'id' => $id]);

            $lineStmt = $this->pdo->prepare(
                'INSERT INTO purchase_return_items (purchase_return_id, item_id, purchase_item_id, qty, rate, line_total)
                 VALUES (:purchase_return_id, :item_id, :purchase_item_id, :qty, :rate, :line_total)'
            );
            $stock = new StockLedgerService($this->pdo);
            foreach ($lines as $line) {
                $qty = (float) $line['qty'];
                $rate = (float) $line['rate'];
                $lineTotal = round($qty * $rate, 2);

                $lineStmt->execute([
                    'purchase_return_id' => $id, 'item_id' => (int) $line['item_id'],
                    'purchase_item_id' => !empty($line['purchase_item_id']) ? (int) $line['purchase_item_id'] : null,
                    'qty' => $qty, 'rate' => $rate, 'line_total' => $lineTotal,
                ]);

                $stock->applyMovement(
                    (int) $line['item_id'],
                    'branch',
                    (int) $header['branch_id'],
                    -$qty,
                    'purchase_return',
                    'purchase_returns',
                    $id,
                    null,
                    null,
                    $createdBy
                );
            }

            if ($returnTotal > 0) {
                (new SupplierLedgerService($this->pdo))->record(
                    (int) $header['supplier_id'],
                    'debit_note_adjustment',
                    $returnTotal,
                    $header['purchase_id'] ?? null,
                    null,
                    "Purchase return " . CodeGenerator::fromId('PRT', $id),
                    $createdBy
                );
            }

            $this->pdo->commit();
            return $id;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /** Rejects the whole return up front if any line asks for more than what's left returnable on its original GRN line. */
    private function assertWithinReturnableQty(int $purchaseId, array $lines): void
    {
        $stmt = $this->pdo->prepare(
            "SELECT pi.id, pi.qty AS original_qty,
                    GREATEST(pi.qty - COALESCE(ret.returned_qty, 0), 0) AS remaining_qty
             FROM purchase_items pi
             LEFT JOIN (
                 SELECT pri.purchase_item_id, SUM(pri.qty) AS returned_qty
                 FROM purchase_return_items pri
                 GROUP BY pri.purchase_item_id
             ) ret ON ret.purchase_item_id = pi.id
             WHERE pi.purchase_id = :purchase_id"
        );
        $stmt->execute(['purchase_id' => $purchaseId]);
        $remainingByLine = array_column($stmt->fetchAll(), 'remaining_qty', 'id');

        foreach ($lines as $line) {
            if (empty($line['purchase_item_id'])) {
                continue;
            }
            $lineId = (int) $line['purchase_item_id'];
            $remaining = (float) ($remainingByLine[$lineId] ?? 0);
            $requested = (float) $line['qty'];
            if ($requested > $remaining + 0.009) {
                throw new RuntimeException(sprintf(
                    'Cannot return %s units — only %s remain returnable on this GRN line.',
                    $requested,
                    $remaining
                ));
            }
        }
    }
}
