<?php

declare(strict_types=1);

namespace App\Models;

use App\Helpers\CodeGenerator;
use App\Services\SupplierLedgerService;
use PDO;

/**
 * Records a supplier payment and allocates it across one or more unpaid
 * GRNs — FIFO (oldest first) by default, or an explicit manual split
 * (section 4.14). Commits payment + allocations + each GRN's paid_amount +
 * the ledger entry in one transaction.
 */
class SupplierPaymentModel
{
    public function __construct(private PDO $pdo)
    {
    }

    public function all(int $branchId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT sp.*, s.name AS supplier_name, u.name AS paid_by_name
             FROM supplier_payments sp
             JOIN suppliers s ON s.id = sp.supplier_id
             LEFT JOIN users u ON u.id = sp.paid_by
             WHERE sp.branch_id = :branch_id ORDER BY sp.id DESC'
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

        $where = "WHERE sp.branch_id = :branch_id";
        $params = ['branch_id' => $branchId];

        if ($search !== null && trim($search) !== '') {
            $where .= " AND (sp.payment_code LIKE :s1 OR s.name LIKE :s2 OR sp.reference_no LIKE :s3)";
            $term = '%' . trim($search) . '%';
            $params['s1'] = $term;
            $params['s2'] = $term;
            $params['s3'] = $term;
        }

        $countStmt = $this->pdo->prepare(
            "SELECT COUNT(*)
             FROM supplier_payments sp
             JOIN suppliers s ON s.id = sp.supplier_id
             {$where}"
        );
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $stmt = $this->pdo->prepare(
            "SELECT sp.*, s.name AS supplier_name, u.name AS paid_by_name
             FROM supplier_payments sp
             JOIN suppliers s ON s.id = sp.supplier_id
             LEFT JOIN users u ON u.id = sp.paid_by
             {$where}
             ORDER BY sp.id DESC LIMIT :limit OFFSET :offset"
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


    /**
     * @param array|null $manualAllocations [{purchase_id, allocated_amount}] — omit/null for FIFO auto-allocation.
     */
    public function record(
        int $supplierId,
        int $branchId,
        float $amount,
        string $paymentMode,
        ?string $referenceNo,
        ?string $notes,
        int $paidBy,
        ?array $manualAllocations = null
    ): array {
        $this->pdo->beginTransaction();
        try {
            $purchases = new PurchaseModel($this->pdo);
            $unpaid = $purchases->unpaidForSupplier($supplierId);
            $byId = array_column($unpaid, null, 'id');
            $ledger = new SupplierLedgerService($this->pdo);

            // The ledger's running balance is the true total payable — it
            // also includes an opening balance or any adjustment that isn't
            // tied to a specific GRN, which summing unpaid GRNs alone would
            // miss entirely.
            $totalOutstanding = $ledger->currentPayable($supplierId);
            if ($amount > $totalOutstanding + 0.009) {
                throw new \RuntimeException(sprintf(
                    'Payment amount (%.2f) exceeds this supplier\'s total pending balance of %.2f',
                    $amount,
                    $totalOutstanding
                ));
            }

            $allocations = [];
            if ($manualAllocations !== null) {
                foreach ($manualAllocations as $a) {
                    $purchaseId = (int) $a['purchase_id'];
                    if (!isset($byId[$purchaseId])) {
                        continue;
                    }
                    $cap = (float) $byId[$purchaseId]['pending_balance'];
                    $allocations[$purchaseId] = min((float) $a['allocated_amount'], $cap);
                }
            } else {
                $remaining = $amount;
                foreach ($unpaid as $grn) {
                    if ($remaining <= 0.009) {
                        break;
                    }
                    $take = min($remaining, (float) $grn['pending_balance']);
                    $allocations[(int) $grn['id']] = $take;
                    $remaining -= $take;
                }
            }

            // $allocatedTotal only covers the part of this payment tied to a
            // specific GRN — the rest (e.g. paying down an opening balance,
            // which has no purchase row to attach to) still counts as real
            // money paid, so the payment/ledger amount is $amount itself,
            // never just what happened to land on a GRN.
            $allocatedTotal = round(array_sum($allocations), 2);
            if ($amount <= 0.009) {
                throw new \RuntimeException('Nothing to allocate — supplier has no outstanding balance matching this payment');
            }

            $stmt = $this->pdo->prepare(
                'INSERT INTO supplier_payments (supplier_id, branch_id, amount, payment_mode, reference_no, notes, paid_by)
                 VALUES (:supplier_id, :branch_id, :amount, :payment_mode, :reference_no, :notes, :paid_by)'
            );
            $stmt->execute([
                'supplier_id' => $supplierId,
                'branch_id' => $branchId,
                'amount' => $amount,
                'payment_mode' => $paymentMode,
                'reference_no' => $referenceNo,
                'notes' => $notes,
                'paid_by' => $paidBy,
            ]);
            $paymentId = (int) $this->pdo->lastInsertId();

            $this->pdo->prepare('UPDATE supplier_payments SET payment_code = :code WHERE id = :id')
                ->execute(['code' => CodeGenerator::fromId('PAY', $paymentId), 'id' => $paymentId]);

            $allocStmt = $this->pdo->prepare(
                'INSERT INTO supplier_payment_allocations (supplier_payment_id, purchase_id, allocated_amount)
                 VALUES (:payment_id, :purchase_id, :allocated_amount)'
            );
            $updateStmt = $this->pdo->prepare(
                'UPDATE purchases SET paid_amount = paid_amount + :amount WHERE id = :id'
            );
            foreach ($allocations as $purchaseId => $allocated) {
                if ($allocated <= 0) {
                    continue;
                }
                $allocStmt->execute(['payment_id' => $paymentId, 'purchase_id' => $purchaseId, 'allocated_amount' => $allocated]);
                $updateStmt->execute(['amount' => $allocated, 'id' => $purchaseId]);
            }

            $ledger->record(
                $supplierId,
                'payment_made',
                $amount,
                null,
                $paymentId,
                "Payment " . CodeGenerator::fromId('PAY', $paymentId),
                $paidBy
            );

            $this->pdo->commit();
            return ['payment_id' => $paymentId, 'allocated_total' => $amount, 'allocations' => $allocations];
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }
}
