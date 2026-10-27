<?php

declare(strict_types=1);

namespace App\Models;

use App\Helpers\CodeGenerator;
use PDO;

/** Purchase requests / indents — a quote to a supplier, no stock effect until converted to a GRN. */
class PurchaseRequestModel
{
    public function __construct(private PDO $pdo)
    {
    }

    /** Requests can only ever move forward — never back to an earlier stage. */
    private const VALID_TRANSITIONS = [
        'open' => ['approved', 'cancelled'],
        'approved' => ['converted_to_grn', 'cancelled'],
        'partially_received' => ['converted_to_grn', 'cancelled'],
        'converted_to_grn' => [],
        'cancelled' => [],
    ];

    public function all(int $branchId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT pr.*, s.name AS supplier_name, s.phone AS supplier_phone, r.name AS route_name,
                    u.name AS created_by_name, au.name AS approved_by_name,
                    (SELECT COUNT(*) FROM purchase_request_items pri WHERE pri.purchase_request_id = pr.id) AS item_count,
                    (SELECT COALESCE(SUM(pri.qty * pri.rate), 0) FROM purchase_request_items pri WHERE pri.purchase_request_id = pr.id) AS estimated_total
             FROM purchase_requests pr
             JOIN suppliers s ON s.id = pr.supplier_id
             LEFT JOIN routes r ON r.id = pr.route_id
             JOIN users u ON u.id = pr.created_by
             LEFT JOIN users au ON au.id = pr.approved_by
             WHERE pr.branch_id = :branch_id ORDER BY pr.id DESC'
        );
        $stmt->execute(['branch_id' => $branchId]);
        return $stmt->fetchAll();
    }

    public function find(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT pr.*, s.name AS supplier_name, s.phone AS supplier_phone, r.name AS route_name,
                    u.name AS created_by_name, au.name AS approved_by_name
             FROM purchase_requests pr
             JOIN suppliers s ON s.id = pr.supplier_id
             LEFT JOIN routes r ON r.id = pr.route_id
             JOIN users u ON u.id = pr.created_by
             LEFT JOIN users au ON au.id = pr.approved_by
             WHERE pr.id = :id'
        );
        $stmt->execute(['id' => $id]);
        $request = $stmt->fetch();
        if (!$request) {
            return null;
        }

        $stmt = $this->pdo->prepare(
            'SELECT pri.*, i.item_name, i.item_code FROM purchase_request_items pri
             JOIN items i ON i.id = pri.item_id WHERE pri.purchase_request_id = :id'
        );
        $stmt->execute(['id' => $id]);
        $request['items'] = $stmt->fetchAll();

        return $request;
    }

    public function create(array $header, array $lines): int
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare(
                'INSERT INTO purchase_requests (supplier_id, branch_id, route_id, notes, created_by)
                 VALUES (:supplier_id, :branch_id, :route_id, :notes, :created_by)'
            );
            $stmt->execute([
                'supplier_id' => $header['supplier_id'],
                'branch_id' => $header['branch_id'],
                'route_id' => $header['route_id'] ?? null,
                'notes' => $header['notes'] ?? null,
                'created_by' => $header['created_by'],
            ]);
            $id = (int) $this->pdo->lastInsertId();

            $this->pdo->prepare('UPDATE purchase_requests SET request_no = :code WHERE id = :id')
                ->execute(['code' => CodeGenerator::fromId('PR', $id), 'id' => $id]);

            $this->insertLines($id, $lines);

            $this->pdo->commit();
            return $id;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /** @throws \RuntimeException if the transition isn't allowed from the request's current status */
    private function requireTransition(array $request, string $to): void
    {
        if (!in_array($to, self::VALID_TRANSITIONS[$request['status']] ?? [], true)) {
            throw new \RuntimeException("Cannot move a '{$request['status']}' request to '{$to}'");
        }
    }

    public function approve(int $id, int $approverId): array
    {
        $request = $this->find($id);
        if (!$request) {
            throw new \RuntimeException('Request not found');
        }
        $this->requireTransition($request, 'approved');

        $this->pdo->prepare(
            "UPDATE purchase_requests SET status = 'approved', approved_by = :by, approved_at = NOW() WHERE id = :id"
        )->execute(['by' => $approverId, 'id' => $id]);

        return $this->find($id);
    }

    public function cancel(int $id): void
    {
        $request = $this->find($id);
        if (!$request) {
            throw new \RuntimeException('Request not found');
        }
        $this->requireTransition($request, 'cancelled');

        $this->pdo->prepare("UPDATE purchase_requests SET status = 'cancelled' WHERE id = :id")
            ->execute(['id' => $id]);
    }

    /**
     * Orders eligible for the Van Stock "Supplier Order" dropdown: only
     * 'approved' requests (an admin has agreed to buy; 'open' hasn't been
     * approved yet, and nothing after 'approved' has item edits, so
     * issued_qty is never at risk of drifting from a concurrent edit),
     * with at least one line still short of its ordered qty.
     */
    public function eligibleForVanStock(int $branchId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT pr.id, pr.request_no, pr.status, pr.created_at, s.id AS supplier_id, s.name AS supplier_name, s.phone AS supplier_phone
             FROM purchase_requests pr
             JOIN suppliers s ON s.id = pr.supplier_id
             WHERE pr.branch_id = :branch_id AND pr.status = 'approved'
               AND EXISTS (SELECT 1 FROM purchase_request_items pri WHERE pri.purchase_request_id = pr.id AND pri.qty > pri.issued_qty)
             ORDER BY pr.id DESC"
        );
        $stmt->execute(['branch_id' => $branchId]);
        $orders = $stmt->fetchAll();

        $itemStmt = $this->pdo->prepare(
            "SELECT pri.item_id, i.item_name, i.item_code, pri.qty, pri.issued_qty, (pri.qty - pri.issued_qty) AS remaining_qty
             FROM purchase_request_items pri
             JOIN items i ON i.id = pri.item_id
             WHERE pri.purchase_request_id = :id"
        );
        foreach ($orders as &$order) {
            $itemStmt->execute(['id' => $order['id']]);
            $order['items'] = $itemStmt->fetchAll();
        }
        return $orders;
    }

    private function insertLines(int $requestId, array $lines): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO purchase_request_items (purchase_request_id, item_id, qty, rate)
             VALUES (:purchase_request_id, :item_id, :qty, :rate)'
        );
        foreach ($lines as $line) {
            $stmt->execute([
                'purchase_request_id' => $requestId,
                'item_id' => (int) $line['item_id'],
                'qty' => (float) $line['qty'],
                'rate' => (float) ($line['rate'] ?? 0),
            ]);
        }
    }
}
