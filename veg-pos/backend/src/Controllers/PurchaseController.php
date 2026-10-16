<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\CodeGenerator;
use App\Helpers\Response;
use App\Middleware\AuthMiddleware;
use App\Services\AuditLogger;
use App\Services\LedgerService;
use PDO;

class PurchaseController
{
    public function __construct(private PDO $pdo)
    {
    }

    public function index(): void
    {
        AuthMiddleware::authenticate();
        $where = "WHERE pu.status != 'cancelled'";
        $params = [];
        if (!empty($_GET['party_id'])) {
            $where .= ' AND pu.party_id = :party_id';
            $params['party_id'] = $_GET['party_id'];
        }
        if (!empty($_GET['from'])) {
            $where .= ' AND pu.purchase_date >= :from';
            $params['from'] = $_GET['from'];
        }
        if (!empty($_GET['to'])) {
            $where .= ' AND pu.purchase_date <= :to';
            $params['to'] = $_GET['to'];
        }

        $page = isset($_GET['page']) ? max(1, (int) $_GET['page']) : null;
        $limit = isset($_GET['limit']) ? max(1, (int) $_GET['limit']) : 10;

        if ($page !== null) {
            $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM purchases pu {$where}");
            $countStmt->execute($params);
            $total = (int) $countStmt->fetchColumn();

            $offset = ($page - 1) * $limit;
            $sql = "SELECT pu.*, p.name AS party_name FROM purchases pu
                    LEFT JOIN parties p ON p.id = pu.party_id
                    {$where}
                    ORDER BY pu.purchase_date DESC, pu.id DESC LIMIT {$limit} OFFSET {$offset}";
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

        $sql = "SELECT pu.*, p.name AS party_name FROM purchases pu
                LEFT JOIN parties p ON p.id = pu.party_id
                {$where}
                ORDER BY pu.purchase_date DESC, pu.id DESC LIMIT 500";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        Response::json($stmt->fetchAll());
    }

    public function show(string $id): void
    {
        AuthMiddleware::authenticate();
        $purchase = $this->fetchWithLines((int) $id);
        if (!$purchase) {
            Response::error('Purchase not found', 404);
        }
        Response::json($purchase);
    }

    public function store(): void
    {
        $claims = AuthMiddleware::authenticate();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $partyId = (int) ($body['party_id'] ?? 0);
        if ($partyId <= 0) {
            Response::error('party_id is required', 422);
        }

        $this->pdo->beginTransaction();
        try {
            $purchaseNo = CodeGenerator::nextSimpleCode($this->pdo, 'purchases', 'purchase_no', 'PUR-');
            $purchaseDate = $body['purchase_date'] ?? date('Y-m-d');

            $stmt = $this->pdo->prepare(
                'INSERT INTO purchases (purchase_no, party_id, purchase_date, created_by) VALUES (:no, :pid, :date, :uid)'
            );
            $stmt->execute(['no' => $purchaseNo, 'pid' => $partyId, 'date' => $purchaseDate, 'uid' => $claims['uid']]);
            $purchaseId = (int) $this->pdo->lastInsertId();

            $this->applyLines($purchaseId, $body, $purchaseDate, $partyId, $purchaseNo);

            AuditLogger::log($this->pdo, $claims, 'create', 'purchase', $purchaseId, ['purchase_no' => $purchaseNo]);
            $this->pdo->commit();
            Response::json($this->fetchWithLines($purchaseId), 201);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Failed to save purchase: ' . $e->getMessage(), 500);
        }
    }

    public function update(string $id): void
    {
        $claims = AuthMiddleware::authenticate();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $stmt = $this->pdo->prepare("SELECT * FROM purchases WHERE id = :id AND status != 'cancelled'");
        $stmt->execute(['id' => $id]);
        $existing = $stmt->fetch();
        if (!$existing) {
            Response::error('Purchase not found', 404);
        }

        $this->pdo->beginTransaction();
        try {
            LedgerService::reverse($this->pdo, 'purchase', (int) $id);
            $this->pdo->prepare('DELETE FROM purchase_lines WHERE purchase_id = :id')->execute(['id' => $id]);

            $partyId = (int) ($body['party_id'] ?? $existing['party_id']);
            $purchaseDate = $body['purchase_date'] ?? $existing['purchase_date'];
            $this->pdo->prepare('UPDATE purchases SET party_id = :pid, purchase_date = :date WHERE id = :id')
                ->execute(['pid' => $partyId, 'date' => $purchaseDate, 'id' => $id]);

            $this->applyLines((int) $id, $body, $purchaseDate, $partyId, $existing['purchase_no']);

            AuditLogger::log($this->pdo, $claims, 'update', 'purchase', (int) $id, ['purchase_no' => $existing['purchase_no']]);
            $this->pdo->commit();
            Response::json($this->fetchWithLines((int) $id));
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Failed to update purchase: ' . $e->getMessage(), 500);
        }
    }

    public function destroy(string $id): void
    {
        $claims = AuthMiddleware::authenticate();
        AuthMiddleware::requireRole($claims, ['admin', 'manager']);

        $stmt = $this->pdo->prepare("SELECT * FROM purchases WHERE id = :id AND status != 'cancelled'");
        $stmt->execute(['id' => $id]);
        $purchase = $stmt->fetch();
        if (!$purchase) {
            Response::error('Purchase not found', 404);
        }

        $this->pdo->beginTransaction();
        try {
            LedgerService::reverse($this->pdo, 'purchase', (int) $id);
            $this->pdo->prepare("UPDATE purchases SET status = 'cancelled' WHERE id = :id")->execute(['id' => $id]);
            AuditLogger::log($this->pdo, $claims, 'delete', 'purchase', (int) $id, ['purchase_no' => $purchase['purchase_no']]);
            $this->pdo->commit();
            Response::json(['ok' => true]);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Failed to delete purchase: ' . $e->getMessage(), 500);
        }
    }

    /**
     * @param array<string, mixed> $body
     */
    private function applyLines(int $purchaseId, array $body, string $purchaseDate, int $partyId, string $purchaseNo): void
    {
        $lines = $body['lines'] ?? [];
        $itemsTotal = 0.0;
        $order = 0;
        $insertLine = $this->pdo->prepare(
            'INSERT INTO purchase_lines (purchase_id, item_id, item_name_ta, item_name_en, nos, weight, rate, amount, line_order)
             VALUES (:pid, :item_id, :name_ta, :name_en, :nos, :weight, :rate, :amount, :order)'
        );
        foreach ($lines as $line) {
            $rate = (float) ($line['rate'] ?? 0);
            $weight = (float) ($line['weight'] ?? 0);
            $nos = (float) ($line['nos'] ?? 0);
            $amount = round($rate * $weight, 2);
            $itemsTotal += $amount;

            $insertLine->execute([
                'pid' => $purchaseId,
                'item_id' => !empty($line['item_id']) ? (int) $line['item_id'] : null,
                'name_ta' => $line['item_name_ta'] ?? '',
                'name_en' => $line['item_name_en'] ?? '',
                'nos' => $nos,
                'weight' => $weight,
                'rate' => $rate,
                'amount' => $amount,
                'order' => $order++,
            ]);
        }
        $itemsTotal = round($itemsTotal, 2);
        $discountAmount = round((float) ($body['discount_amount'] ?? 0), 2);
        $total = round($itemsTotal - $discountAmount, 2);
        $paidAmount = round((float) ($body['paid_amount'] ?? 0), 2);
        $balanceDue = round($total - $paidAmount, 2);

        $pmid = !empty($body['payment_method_id']) ? (int) $body['payment_method_id'] : null;

        $this->pdo->prepare(
            'UPDATE purchases SET items_total = :items_total, discount_amount = :discount_amount, total = :total,
                paid_amount = :paid_amount, payment_method_id = :pmid, balance_due = :balance_due
             WHERE id = :id'
        )->execute([
            'id' => $purchaseId,
            'items_total' => $itemsTotal,
            'discount_amount' => $discountAmount,
            'total' => $total,
            'paid_amount' => $paidAmount,
            'pmid' => $pmid,
            'balance_due' => $balanceDue,
        ]);

        LedgerService::post($this->pdo, $partyId, $purchaseDate, 'purchase', $purchaseId, -$balanceDue, "Purchase {$purchaseNo}");
    }

    private function fetchWithLines(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT pu.*, p.name AS party_name, p.phone AS party_phone FROM purchases pu
             LEFT JOIN parties p ON p.id = pu.party_id WHERE pu.id = :id'
        );
        $stmt->execute(['id' => $id]);
        $purchase = $stmt->fetch();
        if (!$purchase) {
            return null;
        }
        $lines = $this->pdo->prepare('SELECT * FROM purchase_lines WHERE purchase_id = :id ORDER BY line_order ASC');
        $lines->execute(['id' => $id]);
        $purchase['lines'] = $lines->fetchAll();

        return $purchase;
    }
}
