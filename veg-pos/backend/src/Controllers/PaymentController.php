<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\CodeGenerator;
use App\Helpers\Response;
use App\Middleware\AuthMiddleware;
use App\Services\AuditLogger;
use App\Services\LedgerService;
use PDO;

class PaymentController
{
    public function __construct(private PDO $pdo)
    {
    }

    public function index(): void
    {
        AuthMiddleware::authenticate();
        $where = 'WHERE 1=1';
        $params = [];
        if (!empty($_GET['party_id'])) {
            $where .= ' AND pay.party_id = :party_id';
            $params['party_id'] = $_GET['party_id'];
        }
        if (!empty($_GET['direction'])) {
            $where .= ' AND pay.direction = :direction';
            $params['direction'] = $_GET['direction'];
        }
        if (!empty($_GET['from'])) {
            $where .= ' AND pay.payment_date >= :from';
            $params['from'] = $_GET['from'];
        }
        if (!empty($_GET['to'])) {
            $where .= ' AND pay.payment_date <= :to';
            $params['to'] = $_GET['to'];
        }

        $page = isset($_GET['page']) ? max(1, (int) $_GET['page']) : null;
        $limit = isset($_GET['limit']) ? max(1, (int) $_GET['limit']) : 10;

        if ($page !== null) {
            $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM payments pay {$where}");
            $countStmt->execute($params);
            $total = (int) $countStmt->fetchColumn();

            $offset = ($page - 1) * $limit;
            $sql = "SELECT pay.*, p.name AS party_name, pm.name_ta AS payment_method_name
                    FROM payments pay
                    LEFT JOIN parties p ON p.id = pay.party_id
                    LEFT JOIN payment_methods pm ON pm.id = pay.payment_method_id
                    {$where}
                    ORDER BY pay.payment_date DESC, pay.id DESC LIMIT {$limit} OFFSET {$offset}";
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll();

            Response::json([
                'data' => $rows,
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'total_pages' => (int) ceil($total / $limit),
            ]);
        }

        $sql = "SELECT pay.*, p.name AS party_name, pm.name_ta AS payment_method_name
                FROM payments pay
                LEFT JOIN parties p ON p.id = pay.party_id
                LEFT JOIN payment_methods pm ON pm.id = pay.payment_method_id
                {$where}
                ORDER BY pay.payment_date DESC, pay.id DESC LIMIT 500";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        Response::json($stmt->fetchAll());
    }

    public function show(string $id): void
    {
        AuthMiddleware::authenticate();
        $stmt = $this->pdo->prepare('SELECT * FROM payments WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $payment = $stmt->fetch();
        if (!$payment) {
            Response::error('Payment not found', 404);
        }
        $alloc = $this->pdo->prepare(
            "SELECT pa.*, b.bill_no AS doc_no, pu.purchase_no AS purchase_doc_no
             FROM payment_allocations pa
             LEFT JOIN bills b ON b.id = pa.bill_id
             LEFT JOIN purchases pu ON pu.id = pa.purchase_id
             WHERE pa.payment_id = :id"
        );
        $alloc->execute(['id' => $id]);
        $payment['allocations'] = $alloc->fetchAll();
        Response::json($payment);
    }

    public function store(): void
    {
        $claims = AuthMiddleware::authenticate();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $partyId = (int) ($body['party_id'] ?? 0);
        $amount = round((float) ($body['amount'] ?? 0), 2);
        $direction = $body['direction'] ?? 'in';

        if ($partyId <= 0 || $amount <= 0) {
            Response::error('party_id and a positive amount are required', 422);
        }

        $this->pdo->beginTransaction();
        try {
            $receiptNo = CodeGenerator::nextSimpleCode($this->pdo, 'payments', 'receipt_no', $direction === 'in' ? 'REC' : 'PAY');
            $allocationMode = $body['allocation_mode'] ?? 'on_account';
            $paymentDate = $body['payment_date'] ?? date('Y-m-d');

            $stmt = $this->pdo->prepare(
                'INSERT INTO payments (receipt_no, direction, party_id, payment_date, amount, payment_method_id, allocation_mode, notes, created_by)
                 VALUES (:receipt_no, :direction, :party_id, :payment_date, :amount, :payment_method_id, :allocation_mode, :notes, :created_by)'
            );
            $stmt->execute([
                'receipt_no' => $receiptNo,
                'direction' => $direction,
                'party_id' => $partyId,
                'payment_date' => $paymentDate,
                'amount' => $amount,
                'payment_method_id' => $body['payment_method_id'] ?? null,
                'allocation_mode' => $allocationMode,
                'notes' => $body['notes'] ?? null,
                'created_by' => $claims['uid'],
            ]);
            $paymentId = (int) $this->pdo->lastInsertId();

            if ($allocationMode === 'manual') {
                $this->allocateManual($paymentId, $body['allocations'] ?? []);
            } elseif ($allocationMode === 'auto') {
                $this->allocateAuto($paymentId, $partyId, $direction, $amount);
            }

            $ledgerAmount = $direction === 'in' ? -$amount : $amount;
            LedgerService::post($this->pdo, $partyId, $paymentDate, 'payment', $paymentId, $ledgerAmount, "Receipt {$receiptNo}");

            AuditLogger::log($this->pdo, $claims, 'create', 'payment', $paymentId, ['receipt_no' => $receiptNo, 'amount' => $amount]);

            $this->pdo->commit();
            Response::json(['id' => $paymentId, 'receipt_no' => $receiptNo], 201);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Failed to save payment: ' . $e->getMessage(), 500);
        }
    }

    public function destroy(string $id): void
    {
        $claims = AuthMiddleware::authenticate();
        AuthMiddleware::requireRole($claims, ['admin', 'manager']);

        $stmt = $this->pdo->prepare("SELECT * FROM payments WHERE id = :id AND status = 'active'");
        $stmt->execute(['id' => $id]);
        $payment = $stmt->fetch();
        if (!$payment) {
            Response::error('Payment not found', 404);
        }

        $this->pdo->beginTransaction();
        try {
            $alloc = $this->pdo->prepare('SELECT * FROM payment_allocations WHERE payment_id = :id');
            $alloc->execute(['id' => $id]);
            foreach ($alloc->fetchAll() as $a) {
                if ($a['bill_id']) {
                    $this->pdo->prepare('UPDATE bills SET paid_amount = paid_amount - :amt1, balance_due = balance_due + :amt2 WHERE id = :id')
                        ->execute(['amt1' => $a['amount'], 'amt2' => $a['amount'], 'id' => $a['bill_id']]);
                }
                if ($a['purchase_id']) {
                    $this->pdo->prepare('UPDATE purchases SET paid_amount = paid_amount - :amt1, balance_due = balance_due + :amt2 WHERE id = :id')
                        ->execute(['amt1' => $a['amount'], 'amt2' => $a['amount'], 'id' => $a['purchase_id']]);
                }
            }

            LedgerService::reverse($this->pdo, 'payment', (int) $id);
            $this->pdo->prepare("UPDATE payments SET status = 'cancelled' WHERE id = :id")->execute(['id' => $id]);
            AuditLogger::log($this->pdo, $claims, 'delete', 'payment', (int) $id, ['receipt_no' => $payment['receipt_no']]);
            $this->pdo->commit();
            Response::json(['ok' => true]);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Failed to delete payment: ' . $e->getMessage(), 500);
        }
    }

    /**
     * @param array<int, array<string, mixed>> $allocations
     */
    private function allocateManual(int $paymentId, array $allocations): void
    {
        foreach ($allocations as $a) {
            $amt = round((float) ($a['amount'] ?? 0), 2);
            if ($amt <= 0) {
                continue;
            }
            $billId = $a['bill_id'] ?? null;
            $purchaseId = $a['purchase_id'] ?? null;

            $this->pdo->prepare(
                'INSERT INTO payment_allocations (payment_id, bill_id, purchase_id, amount) VALUES (:pid, :bid, :puid, :amt)'
            )->execute(['pid' => $paymentId, 'bid' => $billId, 'puid' => $purchaseId, 'amt' => $amt]);

            if ($billId) {
                $this->pdo->prepare('UPDATE bills SET paid_amount = paid_amount + :amt1, balance_due = balance_due - :amt2 WHERE id = :id')
                    ->execute(['amt1' => $amt, 'amt2' => $amt, 'id' => $billId]);
            }
            if ($purchaseId) {
                $this->pdo->prepare('UPDATE purchases SET paid_amount = paid_amount + :amt1, balance_due = balance_due - :amt2 WHERE id = :id')
                    ->execute(['amt1' => $amt, 'amt2' => $amt, 'id' => $purchaseId]);
            }
        }
    }

    private function allocateAuto(int $paymentId, int $partyId, string $direction, float $amount): void
    {
        $remaining = $amount;

        if ($direction === 'in') {
            $docs = $this->pdo->prepare(
                "SELECT id, 'bill' AS doc_type, balance_due FROM bills
                 WHERE party_id = :pid AND status = 'active' AND bill_type IN ('normal','quick') AND balance_due > 0.009
                 ORDER BY bill_date ASC, id ASC"
            );
            $docs->execute(['pid' => $partyId]);
            $rows = $docs->fetchAll();
        } else {
            $bills = $this->pdo->prepare(
                "SELECT id, 'bill' AS doc_type, balance_due, bill_date AS doc_date FROM bills
                 WHERE party_id = :pid AND status = 'active' AND bill_type = 'commission' AND balance_due > 0.009"
            );
            $bills->execute(['pid' => $partyId]);
            $purchases = $this->pdo->prepare(
                "SELECT id, 'purchase' AS doc_type, balance_due, purchase_date AS doc_date FROM purchases
                 WHERE party_id = :pid AND status = 'active' AND balance_due > 0.009"
            );
            $purchases->execute(['pid' => $partyId]);
            $rows = array_merge($bills->fetchAll(), $purchases->fetchAll());
            usort($rows, fn ($a, $b) => strcmp($a['doc_date'], $b['doc_date']));
        }

        foreach ($rows as $row) {
            if ($remaining <= 0.009) {
                break;
            }
            $pay = min($remaining, (float) $row['balance_due']);
            $pay = round($pay, 2);
            $remaining = round($remaining - $pay, 2);

            $isBill = $row['doc_type'] === 'bill';
            $this->pdo->prepare(
                'INSERT INTO payment_allocations (payment_id, bill_id, purchase_id, amount) VALUES (:pid, :bid, :puid, :amt)'
            )->execute([
                'pid' => $paymentId,
                'bid' => $isBill ? $row['id'] : null,
                'puid' => $isBill ? null : $row['id'],
                'amt' => $pay,
            ]);

            $table = $isBill ? 'bills' : 'purchases';
            $this->pdo->prepare("UPDATE {$table} SET paid_amount = paid_amount + :amt1, balance_due = balance_due - :amt2 WHERE id = :id")
                ->execute(['amt1' => $pay, 'amt2' => $pay, 'id' => $row['id']]);
        }
    }
}
