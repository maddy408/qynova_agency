<?php

declare(strict_types=1);

namespace App\Models;

use App\Helpers\CodeGenerator;
use App\Services\CreditLedgerService;
use PDO;

/**
 * Customer collections with FIFO oldest-bill auto-deduction (section 4.15).
 * Mirrors SupplierPaymentModel on the receivables side: one collection can
 * spill across several unpaid invoices, oldest first by default, or an
 * explicit manual split.
 */
class CollectionModel
{
    public function __construct(private PDO $pdo)
    {
    }

    public function all(int $branchId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT cc.*, c.ledger_name AS customer_name, u.name AS collected_by_name
             FROM customer_collections cc
             JOIN customers c ON c.id = cc.customer_id
             JOIN users u ON u.id = cc.collected_by
             WHERE cc.branch_id = :branch_id ORDER BY cc.id DESC"
        );
        $stmt->execute(['branch_id' => $branchId]);
        return $stmt->fetchAll();
    }

    /** Unpaid/partial invoices for a customer, oldest first — feeds the FIFO preview. */
    public function unpaidInvoicesForCustomer(int $customerId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT id, invoice_no, invoice_date, grand_total, paid_amount, balance_due
             FROM invoices
             WHERE customer_id = :customer_id AND status = 'completed' AND balance_due > 0.009
             ORDER BY invoice_date, id"
        );
        $stmt->execute(['customer_id' => $customerId]);
        return $stmt->fetchAll();
    }

    /** Every branch customer with a positive outstanding balance — "Route Pending Credit Balances". Includes customers with opening balances. */
    public function pendingBalancesForBranch(int $branchId, ?int $routeId = null): array
    {
        $sql = "SELECT c.id AS customer_id, c.ledger_name, c.phone, c.route_id, c.city_id, c.credit_limit, c.opening_balance,
                       COALESCE(latest_tx.balance_after, c.opening_balance, 0) AS total_due,
                       COALESCE(inv.unpaid_invoice_count, 0) AS unpaid_invoice_count,
                       COALESCE(inv.unpaid_invoice_total, 0) AS unpaid_invoice_total,
                       COALESCE(paid_col.total_collected, 0) AS total_collected
                FROM customers c
                LEFT JOIN (
                    SELECT ct.customer_id, ct.balance_after
                    FROM credit_transactions ct
                    JOIN (
                        SELECT customer_id, MAX(id) AS max_id
                        FROM credit_transactions
                        GROUP BY customer_id
                    ) m ON ct.customer_id = m.customer_id AND ct.id = m.max_id
                ) latest_tx ON latest_tx.customer_id = c.id
                LEFT JOIN (
                    SELECT customer_id,
                           COUNT(id) AS unpaid_invoice_count,
                           SUM(balance_due) AS unpaid_invoice_total
                    FROM invoices
                    WHERE status = 'completed' AND balance_due > 0.009
                    GROUP BY customer_id
                ) inv ON inv.customer_id = c.id
                LEFT JOIN (
                    SELECT customer_id,
                           SUM(amount) AS total_collected
                    FROM customer_collections
                    GROUP BY customer_id
                ) paid_col ON paid_col.customer_id = c.id
                WHERE c.branch_id = :branch_id AND c.status = 'active'";
        $params = ['branch_id' => $branchId];
        if ($routeId !== null) {
            $sql .= ' AND c.route_id = :route_id';
            $params['route_id'] = $routeId;
        }
        $sql .= ' HAVING total_due > 0.009 ORDER BY total_due DESC';

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * @param array|null $manualAllocations [{invoice_id, allocated_amount}] — omit/null for FIFO auto-allocation.
     */
    public function record(
        int $customerId,
        int $branchId,
        float $amount,
        string $paymentMethod,
        ?int $routeId,
        int $collectedBy,
        ?array $manualAllocations = null
    ): array {
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) {
            $this->pdo->beginTransaction();
        }
        try {
            $unpaid = $this->unpaidInvoicesForCustomer($customerId);
            $byId = array_column($unpaid, null, 'id');
            $ledger = new CreditLedgerService($this->pdo);

            // Allow collection of any positive amount ($amount > 0.009).
            // If amount exceeds outstanding invoice balance, the full amount is collected,
            // recorded into revenue/collections/handover, and stored as advance credit on the customer's ledger.

            $allocations = [];
            if ($manualAllocations !== null) {
                foreach ($manualAllocations as $a) {
                    $invoiceId = (int) $a['invoice_id'];
                    if (!isset($byId[$invoiceId])) {
                        continue;
                    }
                    $cap = (float) $byId[$invoiceId]['balance_due'];
                    $allocations[$invoiceId] = min((float) $a['allocated_amount'], $cap);
                }
            } else {
                $remaining = $amount;
                foreach ($unpaid as $inv) {
                    if ($remaining <= 0.009) {
                        break;
                    }
                    $take = min($remaining, (float) $inv['balance_due']);
                    $allocations[(int) $inv['id']] = $take;
                    $remaining -= $take;
                }
            }

            // $allocatedTotal only covers the part tied to a specific
            // invoice — the rest (e.g. paying down an opening balance with
            // no invoice to attach to) is still real money collected, so
            // the collection/ledger amount is $amount itself.
            $allocatedTotal = round(array_sum($allocations), 2);
            if ($amount <= 0.009) {
                throw new \RuntimeException('Nothing to allocate — customer has no outstanding balance matching this collection');
            }

            $stmt = $this->pdo->prepare(
                'INSERT INTO customer_collections (customer_id, branch_id, amount, payment_method, collected_by, route_id)
                 VALUES (:customer_id, :branch_id, :amount, :payment_method, :collected_by, :route_id)'
            );
            $stmt->execute([
                'customer_id' => $customerId, 'branch_id' => $branchId, 'amount' => $amount,
                'payment_method' => $paymentMethod, 'collected_by' => $collectedBy, 'route_id' => $routeId,
            ]);
            $collectionId = (int) $this->pdo->lastInsertId();

            $this->pdo->prepare('UPDATE customer_collections SET receipt_no = :code WHERE id = :id')
                ->execute(['code' => CodeGenerator::fromId('REC', $collectionId), 'id' => $collectionId]);

            $allocStmt = $this->pdo->prepare(
                'INSERT INTO collection_allocations (collection_id, invoice_id, allocated_amount)
                 VALUES (:collection_id, :invoice_id, :allocated_amount)'
            );
            $updateStmt = $this->pdo->prepare(
                "UPDATE invoices SET paid_amount = paid_amount + :amount,
                    payment_status = IF(paid_amount + :amount2 >= grand_total - 0.009, 'paid', 'partial')
                 WHERE id = :id"
            );
            foreach ($allocations as $invoiceId => $allocated) {
                if ($allocated <= 0) {
                    continue;
                }
                $allocStmt->execute(['collection_id' => $collectionId, 'invoice_id' => $invoiceId, 'allocated_amount' => $allocated]);
                $updateStmt->execute(['amount' => $allocated, 'amount2' => $allocated, 'id' => $invoiceId]);
            }

            $ledger->record(
                $customerId,
                'payment_received',
                $amount,
                null,
                "Collection " . CodeGenerator::fromId('REC', $collectionId),
                $collectedBy
            );

            if ($ownsTransaction) {
                $this->pdo->commit();
            }
            return ['collection_id' => $collectionId, 'allocated_total' => $amount, 'allocations' => $allocations];
        } catch (\Throwable $e) {
            if ($ownsTransaction && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }
}
