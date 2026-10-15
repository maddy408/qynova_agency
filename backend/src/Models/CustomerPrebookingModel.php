<?php

declare(strict_types=1);

namespace App\Models;

use App\Helpers\CodeGenerator;
use PDO;

/**
 * Customer pre-booking — a permanent request record, distinct from a POS
 * Hold Bill. Never touches stock, payments, or invoices; only a later,
 * separate POS sale (referencing this booking manually, per current scope)
 * actually bills the customer.
 */
class CustomerPrebookingModel
{
    private const VALID_TRANSITIONS = [
        'pending' => ['confirmed', 'cancelled'],
        'confirmed' => ['processing', 'cancelled'],
        'processing' => ['ready', 'cancelled'],
        'ready' => ['completed', 'cancelled'],
        'completed' => [],
        'cancelled' => [],
    ];

    public function __construct(private PDO $pdo)
    {
    }

    public function all(int $branchId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT cp.*, c.ledger_name AS customer_name, c.phone AS customer_phone,
                    r.name AS route_name, u.name AS created_by_name, e.name AS employee_name,
                    (SELECT COUNT(*) FROM customer_prebooking_items cpi WHERE cpi.prebooking_id = cp.id) AS item_count,
                    (SELECT COALESCE(SUM(cpi.qty * cpi.rate * (1 + cpi.tax_percent / 100)), 0)
                       FROM customer_prebooking_items cpi WHERE cpi.prebooking_id = cp.id) AS estimated_total
             FROM customer_prebookings cp
             JOIN customers c ON c.id = cp.customer_id
             LEFT JOIN routes r ON r.id = cp.route_id
             LEFT JOIN users e ON e.id = cp.employee_id
             JOIN users u ON u.id = cp.created_by
             WHERE cp.branch_id = :branch_id
             ORDER BY cp.id DESC"
        );
        $stmt->execute(['branch_id' => $branchId]);
        return $stmt->fetchAll();
    }

    public function paginate(
        int $branchId,
        int $page = 1,
        int $limit = 10,
        ?string $status = null,
        ?string $search = null
    ): array {
        $page = max(1, $page);
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        $where = "WHERE cp.branch_id = :branch_id";
        $params = ['branch_id' => $branchId];

        if ($status !== null && $status !== 'all' && $status !== '') {
            $where .= " AND cp.status = :status";
            $params['status'] = $status;
        }

        if ($search !== null && trim($search) !== '') {
            $where .= " AND (cp.booking_no LIKE :s1 OR c.ledger_name LIKE :s2 OR c.phone LIKE :s3)";
            $term = '%' . trim($search) . '%';
            $params['s1'] = $term;
            $params['s2'] = $term;
            $params['s3'] = $term;
        }

        $countStmt = $this->pdo->prepare(
            "SELECT COUNT(*)
             FROM customer_prebookings cp
             JOIN customers c ON c.id = cp.customer_id
             {$where}"
        );
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $stmt = $this->pdo->prepare(
            "SELECT cp.*, c.ledger_name AS customer_name, c.phone AS customer_phone,
                    r.name AS route_name, u.name AS created_by_name, e.name AS employee_name,
                    (SELECT COUNT(*) FROM customer_prebooking_items cpi WHERE cpi.prebooking_id = cp.id) AS item_count,
                    (SELECT COALESCE(SUM(cpi.qty * cpi.rate * (1 + cpi.tax_percent / 100)), 0)
                       FROM customer_prebooking_items cpi WHERE cpi.prebooking_id = cp.id) AS estimated_total
             FROM customer_prebookings cp
             JOIN customers c ON c.id = cp.customer_id
             LEFT JOIN routes r ON r.id = cp.route_id
             LEFT JOIN users e ON e.id = cp.employee_id
             JOIN users u ON u.id = cp.created_by
             {$where}
             ORDER BY cp.id DESC LIMIT :limit OFFSET :offset"
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
            "SELECT cp.*, c.ledger_name AS customer_name, c.phone AS customer_phone,
                    r.name AS route_name, u.name AS created_by_name, e.name AS employee_name
             FROM customer_prebookings cp
             JOIN customers c ON c.id = cp.customer_id
             LEFT JOIN routes r ON r.id = cp.route_id
             LEFT JOIN users e ON e.id = cp.employee_id
             JOIN users u ON u.id = cp.created_by
             WHERE cp.id = :id"
        );
        $stmt->execute(['id' => $id]);
        $booking = $stmt->fetch();
        if (!$booking) {
            return null;
        }

        $stmt = $this->pdo->prepare(
            'SELECT cpi.*, i.item_name, i.item_code, i.image
             FROM customer_prebooking_items cpi
             JOIN items i ON i.id = cpi.item_id
             WHERE cpi.prebooking_id = :id'
        );
        $stmt->execute(['id' => $id]);
        $booking['items'] = $stmt->fetchAll();

        return $booking;
    }

    public function create(array $header, array $lines): int
    {
        if (empty($lines)) {
            throw new \RuntimeException('At least one item is required');
        }

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare(
                'INSERT INTO customer_prebookings
                    (customer_id, branch_id, route_id, employee_id, booking_source, notes, created_by)
                 VALUES
                    (:customer_id, :branch_id, :route_id, :employee_id, :booking_source, :notes, :created_by)'
            );
            $stmt->execute([
                'customer_id' => $header['customer_id'],
                'branch_id' => $header['branch_id'],
                'route_id' => $header['route_id'] ?? null,
                'employee_id' => $header['employee_id'] ?? null,
                'booking_source' => $header['booking_source'] ?? 'direct',
                'notes' => $header['notes'] ?? null,
                'created_by' => $header['created_by'],
            ]);
            $id = (int) $this->pdo->lastInsertId();

            $this->pdo->prepare('UPDATE customer_prebookings SET prebooking_no = :code WHERE id = :id')
                ->execute(['code' => CodeGenerator::fromId('PB', $id), 'id' => $id]);

            $this->insertLines($id, $lines);

            $this->pdo->commit();
            return $id;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /** Only while still 'pending' — once a booking is being actioned, item edits go through a fresh booking instead. */
    public function update(int $id, array $header, array $lines): void
    {
        if (empty($lines)) {
            throw new \RuntimeException('At least one item is required');
        }

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('SELECT status FROM customer_prebookings WHERE id = :id FOR UPDATE');
            $stmt->execute(['id' => $id]);
            $status = $stmt->fetchColumn();
            if ($status === false) {
                throw new \RuntimeException('Pre-booking not found');
            }
            if ($status !== 'pending') {
                throw new \RuntimeException("Cannot edit a pre-booking once it is '{$status}' — only a pending booking can be edited");
            }

            $stmt = $this->pdo->prepare(
                'UPDATE customer_prebookings SET
                    customer_id = :customer_id, route_id = :route_id, employee_id = :employee_id,
                    booking_source = :booking_source, notes = :notes
                 WHERE id = :id'
            );
            $stmt->execute([
                'id' => $id,
                'customer_id' => $header['customer_id'],
                'route_id' => $header['route_id'] ?? null,
                'employee_id' => $header['employee_id'] ?? null,
                'booking_source' => $header['booking_source'] ?? 'direct',
                'notes' => $header['notes'] ?? null,
            ]);

            $this->pdo->prepare('DELETE FROM customer_prebooking_items WHERE prebooking_id = :id')->execute(['id' => $id]);
            $this->insertLines($id, $lines);

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function updateStatus(int $id, string $newStatus): array
    {
        $stmt = $this->pdo->prepare('SELECT status FROM customer_prebookings WHERE id = :id FOR UPDATE');
        $stmt->execute(['id' => $id]);
        $current = $stmt->fetchColumn();
        if ($current === false) {
            throw new \RuntimeException('Pre-booking not found');
        }
        if (!in_array($newStatus, self::VALID_TRANSITIONS[$current] ?? [], true)) {
            throw new \RuntimeException("Cannot move a '{$current}' pre-booking to '{$newStatus}'");
        }

        $this->pdo->prepare('UPDATE customer_prebookings SET status = :status WHERE id = :id')
            ->execute(['status' => $newStatus, 'id' => $id]);

        return $this->find($id);
    }

    private function insertLines(int $prebookingId, array $lines): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO customer_prebooking_items (prebooking_id, item_id, qty, rate, tax_percent)
             VALUES (:prebooking_id, :item_id, :qty, :rate, :tax_percent)'
        );
        foreach ($lines as $line) {
            $stmt->execute([
                'prebooking_id' => $prebookingId,
                'item_id' => (int) $line['item_id'],
                'qty' => (float) $line['qty'],
                'rate' => (float) ($line['rate'] ?? 0),
                'tax_percent' => (float) ($line['tax_percent'] ?? 0),
            ]);
        }
    }
}
