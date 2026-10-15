<?php

declare(strict_types=1);

namespace App\Models;

use App\Helpers\CodeGenerator;
use App\Services\CreditLedgerService;
use App\Services\StockLedgerService;
use PDO;
use RuntimeException;

/**
 * Sales returns, with or without the original invoice (section 4.9, rule 4:
 * a returned/cancelled invoice's effects are reversed atomically, the row
 * itself is never deleted). An untraceable return (no invoice_id) needs
 * admin approval before it touches stock or the credit ledger, unless the
 * creator already holds returns.approve_untraceable_return.
 */
class SalesReturnModel
{
    public function __construct(private PDO $pdo)
    {
    }

    public function all(int $branchId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT sr.*, c.ledger_name AS customer_name, i.invoice_no
             FROM sales_returns sr
             LEFT JOIN customers c ON c.id = sr.customer_id
             LEFT JOIN invoices i ON i.id = sr.invoice_id
             WHERE sr.branch_id = :branch_id ORDER BY sr.id DESC"
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

        $where = "WHERE sr.branch_id = :branch_id";
        $params = ['branch_id' => $branchId];

        if ($search !== null && trim($search) !== '') {
            $where .= " AND (sr.return_no LIKE :s1 OR c.ledger_name LIKE :s2 OR i.invoice_no LIKE :s3)";
            $term = '%' . trim($search) . '%';
            $params['s1'] = $term;
            $params['s2'] = $term;
            $params['s3'] = $term;
        }

        $countStmt = $this->pdo->prepare(
            "SELECT COUNT(*)
             FROM sales_returns sr
             LEFT JOIN customers c ON c.id = sr.customer_id
             LEFT JOIN invoices i ON i.id = sr.invoice_id
             {$where}"
        );
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $stmt = $this->pdo->prepare(
            "SELECT sr.*, c.ledger_name AS customer_name, i.invoice_no
             FROM sales_returns sr
             LEFT JOIN customers c ON c.id = sr.customer_id
             LEFT JOIN invoices i ON i.id = sr.invoice_id
             {$where}
             ORDER BY sr.id DESC LIMIT :limit OFFSET :offset"
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
            "SELECT sr.*, c.ledger_name AS customer_name, i.invoice_no
             FROM sales_returns sr
             LEFT JOIN customers c ON c.id = sr.customer_id
             LEFT JOIN invoices i ON i.id = sr.invoice_id
             WHERE sr.id = :id"
        );
        $stmt->execute(['id' => $id]);
        $return = $stmt->fetch();
        if (!$return) {
            return null;
        }

        $stmt = $this->pdo->prepare(
            'SELECT sri.*, it.item_name FROM sales_return_items sri
             JOIN items it ON it.id = sri.item_id WHERE sri.sales_return_id = :id'
        );
        $stmt->execute(['id' => $id]);
        $return['items'] = $stmt->fetchAll();

        return $return;
    }

    /**
     * @param array $lines Each: item_id, qty, rate, and optionally invoice_item_id
     *                      (the original invoice_items.id this line was returned
     *                      against — omitted for untraceable/no-invoice returns).
     * @param float|null $refundAmount Defaults to the computed line total (full
     *                      refund) when not given; may be less for a partial refund,
     *                      never more — the customer can't be refunded beyond what
     *                      they're actually returning.
     */
    public function create(array $header, array $lines, bool $autoApprove, ?float $refundAmount = null): int
    {
        $this->pdo->beginTransaction();
        try {
            if (!empty($header['invoice_id'])) {
                $this->assertWithinReturnableQty((int) $header['invoice_id'], $lines);
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

            $isUntraceable = empty($header['invoice_id']);
            $status = ($isUntraceable && !$autoApprove) ? 'pending_approval' : 'approved';

            $stmt = $this->pdo->prepare(
                'INSERT INTO sales_returns
                    (invoice_id, customer_id, branch_id, reason, refund_action, return_total, refund_amount,
                     requires_admin_approval, status, approved_by, created_by)
                 VALUES
                    (:invoice_id, :customer_id, :branch_id, :reason, :refund_action, :return_total, :refund_amount,
                     :requires_approval, :status, :approved_by, :created_by)'
            );
            $stmt->execute([
                'invoice_id' => $header['invoice_id'] ?? null,
                'customer_id' => $header['customer_id'] ?? null,
                'branch_id' => $header['branch_id'],
                'reason' => $header['reason'] ?? null,
                'refund_action' => $header['refund_action'] ?? 'credit_note',
                'return_total' => $returnTotal,
                'refund_amount' => round($refundAmount, 2),
                'requires_approval' => $isUntraceable ? 1 : 0,
                'status' => $status,
                'approved_by' => $status === 'approved' ? $header['created_by'] : null,
                'created_by' => $header['created_by'],
            ]);
            $id = (int) $this->pdo->lastInsertId();

            $this->pdo->prepare('UPDATE sales_returns SET return_no = :code WHERE id = :id')
                ->execute(['code' => CodeGenerator::fromId('SRT', $id), 'id' => $id]);

            $lineStmt = $this->pdo->prepare(
                'INSERT INTO sales_return_items (sales_return_id, item_id, invoice_item_id, qty, rate, line_total)
                 VALUES (:sales_return_id, :item_id, :invoice_item_id, :qty, :rate, :line_total)'
            );
            foreach ($lines as $line) {
                $lineTotal = round((float) $line['qty'] * (float) $line['rate'], 2);
                $lineStmt->execute([
                    'sales_return_id' => $id,
                    'item_id' => (int) $line['item_id'],
                    'invoice_item_id' => !empty($line['invoice_item_id']) ? (int) $line['invoice_item_id'] : null,
                    'qty' => (float) $line['qty'],
                    'rate' => (float) $line['rate'],
                    'line_total' => $lineTotal,
                ]);
            }

            if ($status === 'approved') {
                $this->applyEffects($id, $header['created_by']);
            }

            $this->pdo->commit();
            return $id;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /** Rejects the whole return up front if any line asks for more than what's left returnable on its original invoice line. */
    private function assertWithinReturnableQty(int $invoiceId, array $lines): void
    {
        $stmt = $this->pdo->prepare(
            "SELECT ii.id, ii.qty AS original_qty,
                    GREATEST(ii.qty - COALESCE(ret.returned_qty, 0), 0) AS remaining_qty
             FROM invoice_items ii
             LEFT JOIN (
                 SELECT sri.invoice_item_id, SUM(sri.qty) AS returned_qty
                 FROM sales_return_items sri
                 JOIN sales_returns sr ON sr.id = sri.sales_return_id
                 WHERE sr.status <> 'rejected'
                 GROUP BY sri.invoice_item_id
             ) ret ON ret.invoice_item_id = ii.id
             WHERE ii.invoice_id = :invoice_id"
        );
        $stmt->execute(['invoice_id' => $invoiceId]);
        $remainingByLine = array_column($stmt->fetchAll(), 'remaining_qty', 'id');

        foreach ($lines as $line) {
            if (empty($line['invoice_item_id'])) {
                continue;
            }
            $lineId = (int) $line['invoice_item_id'];
            $remaining = (float) ($remainingByLine[$lineId] ?? 0);
            $requested = (float) $line['qty'];
            if ($requested > $remaining + 0.009) {
                throw new RuntimeException(sprintf(
                    'Cannot return %s units — only %s remain returnable on this invoice line.',
                    $requested,
                    $remaining
                ));
            }
        }
    }

    public function approve(int $id, int $approvedBy): void
    {
        $this->pdo->beginTransaction();
        try {
            $return = $this->find($id);
            if (!$return || $return['status'] !== 'pending_approval') {
                throw new \RuntimeException('Return not found or not pending approval');
            }

            $this->pdo->prepare("UPDATE sales_returns SET status = 'approved', approved_by = :by WHERE id = :id")
                ->execute(['by' => $approvedBy, 'id' => $id]);

            $this->applyEffects($id, $approvedBy);

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function reject(int $id): void
    {
        $this->pdo->prepare("UPDATE sales_returns SET status = 'rejected' WHERE id = :id AND status = 'pending_approval'")
            ->execute(['id' => $id]);
    }

    /** Adds stock back and, for a credit-note refund on a customer sale, reduces their outstanding. */
    private function applyEffects(int $id, int $actorId): void
    {
        $return = $this->find($id);
        $stock = new StockLedgerService($this->pdo);

        foreach ($return['items'] as $line) {
            $stock->applyMovement(
                (int) $line['item_id'],
                'branch',
                (int) $return['branch_id'],
                (float) $line['qty'],
                'sale_return',
                'sales_returns',
                $id,
                null,
                null,
                $actorId
            );
        }

        $refundAmount = (float) $return['refund_amount'];

        if ($return['refund_action'] === 'credit_note' && $return['customer_id'] !== null) {
            if ($refundAmount > 0) {
                (new CreditLedgerService($this->pdo))->record(
                    (int) $return['customer_id'],
                    'credit_reversal',
                    $refundAmount,
                    $return['invoice_id'],
                    "Sales return {$return['return_no']}",
                    $actorId
                );
            }
        } elseif ($return['refund_action'] === 'cash_refund' && $refundAmount > 0) {
            $this->postCashRefundExpense((int) $return['branch_id'], $refundAmount, $return['return_no'], $actorId);
        }
    }

    /** A cash refund is money actually leaving the till — record it the same way any other cash outflow is, so Cash Handover/Reports see it. */
    private function postCashRefundExpense(int $branchId, float $amount, string $returnNo, int $actorId): void
    {
        $categoryId = (int) $this->pdo
            ->query("SELECT id FROM expense_categories WHERE name = 'Sales Return Refund' LIMIT 1")
            ->fetchColumn();

        $stmt = $this->pdo->prepare(
            'INSERT INTO expenses (branch_id, category_id, amount, payment_mode, description, expense_date, created_by)
             VALUES (:branch_id, :category_id, :amount, :payment_mode, :description, CURDATE(), :created_by)'
        );
        $stmt->execute([
            'branch_id' => $branchId,
            'category_id' => $categoryId ?: null,
            'amount' => round($amount, 2),
            'payment_mode' => 'cash',
            'description' => "Cash refund for sales return {$returnNo}",
            'created_by' => $actorId,
        ]);
        $expenseId = (int) $this->pdo->lastInsertId();
        $this->pdo->prepare('UPDATE expenses SET expense_no = :code WHERE id = :id')
            ->execute(['code' => CodeGenerator::fromId('EXP', $expenseId), 'id' => $expenseId]);
    }
}
