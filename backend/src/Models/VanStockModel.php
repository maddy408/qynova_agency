<?php

declare(strict_types=1);

namespace App\Models;

use App\Helpers\CodeGenerator;
use App\Services\StockLedgerService;
use PDO;

/**
 * Van / salesman stock (section 4.7). Issuing moves stock from the branch's
 * own pool to the employee's; a day-end return reverses it. Both legs of
 * each operation are logged via StockLedgerService so the audit trail always
 * balances back to zero net change across owners.
 */
class VanStockModel
{
    public function __construct(private PDO $pdo)
    {
    }

    /**
     * $sourceType/$sourceId optionally link this issue back to an eligible
     * customer pre-booking or purchase request (section: Orders <-> Van
     * Stock integration). The two source types move stock in genuinely
     * different directions, so this is not one shared code path with a
     * label bolted on:
     *  - customer_prebooking: a normal van issue — debit the branch's own
     *    pool, credit the employee's, same as an issue with no order
     *    behind it.
     *  - purchase_request: goods arriving directly from the supplier into
     *    the van (e.g. a field purchase). The branch never had this stock
     *    to begin with, so only the employee pool is credited — same
     *    direction/movement_type as a GRN purchase receipt, just landing
     *    on an employee owner instead of a branch/warehouse owner.
     * Either way, every order line's issued_qty is advanced inside the
     * same transaction as the stock movement, so "remaining to issue" and
     * the actual ledger can never drift apart.
     */
    public function issue(
        int $branchId,
        int $employeeId,
        ?int $routeId,
        int $issuedBy,
        ?string $notes,
        array $lines,
        ?string $sourceType = null,
        ?int $sourceId = null
    ): int {
        $this->pdo->beginTransaction();
        try {
            if ($sourceType !== null) {
                $this->validateOrderLines($sourceType, $sourceId, $lines);
            }

            $stmt = $this->pdo->prepare(
                'INSERT INTO stock_issue_notes (branch_id, employee_id, route_id, source_type, source_id, issued_by, notes)
                 VALUES (:branch_id, :employee_id, :route_id, :source_type, :source_id, :issued_by, :notes)'
            );
            $stmt->execute([
                'branch_id' => $branchId, 'employee_id' => $employeeId,
                'route_id' => $routeId, 'source_type' => $sourceType, 'source_id' => $sourceId,
                'issued_by' => $issuedBy, 'notes' => $notes,
            ]);
            $issueId = (int) $this->pdo->lastInsertId();
            $this->pdo->prepare('UPDATE stock_issue_notes SET issue_no = :code WHERE id = :id')
                ->execute(['code' => CodeGenerator::fromId('ISS', $issueId), 'id' => $issueId]);

            $itemStmt = $this->pdo->prepare(
                'INSERT INTO stock_issue_items (issue_id, item_id, qty) VALUES (:issue_id, :item_id, :qty)'
            );
            $stock = new StockLedgerService($this->pdo);
            $isSupplierReceipt = $sourceType === 'purchase_request';
            foreach ($lines as $line) {
                $itemId = (int) $line['item_id'];
                $qty = (float) $line['qty'];
                $itemStmt->execute(['issue_id' => $issueId, 'item_id' => $itemId, 'qty' => $qty]);

                if ($isSupplierReceipt) {
                    $stock->applyMovement(
                        $itemId, 'employee', $employeeId, $qty, 'purchase',
                        'stock_issue_notes', $issueId, null, 'Supplier order received directly to van', $issuedBy
                    );
                } else {
                    $stock->applyMovement($itemId, 'branch', $branchId, -$qty, 'issue_to_salesman', 'stock_issue_notes', $issueId, null, null, $issuedBy);
                    $stock->applyMovement($itemId, 'employee', $employeeId, $qty, 'issue_to_salesman', 'stock_issue_notes', $issueId, null, null, $issuedBy);
                }
            }

            if ($sourceType !== null) {
                $this->adjustIssuedQty($sourceType, $sourceId, $lines, 1);
            }

            $this->pdo->commit();
            return $issueId;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /** @return array{0: string, 1: string} [order_items table, its FK column back to the order header] */
    private function orderItemsTable(string $sourceType): array
    {
        return $sourceType === 'purchase_request'
            ? ['purchase_request_items', 'purchase_request_id']
            : ['customer_prebooking_items', 'prebooking_id'];
    }

    /**
     * Locks every line of the order FOR UPDATE (so two concurrent issues
     * against the same order can't both read a stale "remaining" and both
     * succeed) and rejects the whole request if any line asks for more
     * than is actually left to issue. This is a hard rule about the order
     * itself — unlike the Issue-Stock-to-Van stock-availability warning,
     * there's no "continue anyway" for asking to fulfill more than was
     * ever ordered.
     */
    private function validateOrderLines(string $sourceType, ?int $sourceId, array $lines): void
    {
        if ($sourceId === null) {
            throw new \RuntimeException('source_id is required when source_type is set');
        }
        [$table, $fk] = $this->orderItemsTable($sourceType);

        $stmt = $this->pdo->prepare("SELECT item_id, qty, issued_qty FROM {$table} WHERE {$fk} = :order_id FOR UPDATE");
        $stmt->execute(['order_id' => $sourceId]);
        $orderLines = [];
        foreach ($stmt->fetchAll() as $row) {
            $orderLines[(int) $row['item_id']] = $row;
        }
        if (empty($orderLines)) {
            throw new \RuntimeException('Order not found or has no items');
        }

        foreach ($lines as $line) {
            $itemId = (int) $line['item_id'];
            $qty = (float) $line['qty'];
            if (!isset($orderLines[$itemId])) {
                throw new \RuntimeException("Item #{$itemId} is not part of this order");
            }
            $remaining = (float) $orderLines[$itemId]['qty'] - (float) $orderLines[$itemId]['issued_qty'];
            if ($qty > $remaining + 0.0001) {
                throw new \RuntimeException(
                    "Requested quantity ({$qty}) for item #{$itemId} exceeds the remaining eligible quantity ({$remaining}) on this order"
                );
            }
        }
    }

    /** $direction: +1 when issuing (advance issued_qty), -1 when a return un-fulfills it (floored at 0). */
    private function adjustIssuedQty(string $sourceType, ?int $sourceId, array $lines, int $direction): void
    {
        if ($sourceId === null) {
            return;
        }
        [$table, $fk] = $this->orderItemsTable($sourceType);
        $stmt = $this->pdo->prepare(
            "UPDATE {$table} SET issued_qty = GREATEST(0, issued_qty + :delta) WHERE {$fk} = :order_id AND item_id = :item_id"
        );
        foreach ($lines as $line) {
            $stmt->execute([
                'delta' => $direction * (float) $line['qty'],
                'order_id' => $sourceId,
                'item_id' => (int) $line['item_id'],
            ]);
        }
    }

    public function returnStock(int $branchId, int $employeeId, ?int $issueId, int $returnedBy, ?string $notes, array $lines): int
    {
        $this->pdo->beginTransaction();
        try {
            // A return against an issue that was linked to a customer
            // order un-fulfills that much of the order (it goes back into
            // "remaining to issue" — see adjustIssuedQty docblock).
            // Deliberately NOT done for a purchase_request-sourced issue:
            // those never debited the branch, so there is no natural
            // "give it back to the branch" leg for this flow to reverse;
            // the stock movement below still runs exactly as it does for
            // any other van return, only the order's own issued_qty
            // counter is left alone in that case.
            $sourceType = null;
            $sourceId = null;
            if ($issueId !== null) {
                $stmt = $this->pdo->prepare('SELECT source_type, source_id FROM stock_issue_notes WHERE id = :id');
                $stmt->execute(['id' => $issueId]);
                if ($src = $stmt->fetch()) {
                    $sourceType = $src['source_type'];
                    $sourceId = $src['source_id'] !== null ? (int) $src['source_id'] : null;
                }
            }

            $stmt = $this->pdo->prepare(
                'INSERT INTO stock_return_notes (issue_id, branch_id, employee_id, returned_by, notes)
                 VALUES (:issue_id, :branch_id, :employee_id, :returned_by, :notes)'
            );
            $stmt->execute([
                'issue_id' => $issueId, 'branch_id' => $branchId,
                'employee_id' => $employeeId, 'returned_by' => $returnedBy, 'notes' => $notes,
            ]);
            $returnId = (int) $this->pdo->lastInsertId();
            $this->pdo->prepare('UPDATE stock_return_notes SET return_no = :code WHERE id = :id')
                ->execute(['code' => CodeGenerator::fromId('RTN', $returnId), 'id' => $returnId]);

            $itemStmt = $this->pdo->prepare(
                'INSERT INTO stock_return_items (return_id, item_id, qty) VALUES (:return_id, :item_id, :qty)'
            );
            $stock = new StockLedgerService($this->pdo);
            foreach ($lines as $line) {
                $itemId = (int) $line['item_id'];
                $qty = (float) $line['qty'];

                // quantity_on_hand for this employee+item already nets out
                // every prior issue and return, so comparing against it
                // directly is "outstanding issued quantity, after
                // accounting for previous returns" — exactly what must not
                // be exceeded.
                $onHand = $stock->quantityOnHand($itemId, 'employee', $employeeId);
                if ($qty > $onHand + 0.0001) {
                    throw new \RuntimeException(
                        "Return quantity ({$qty}) for item #{$itemId} exceeds what is currently out with this salesman ({$onHand})"
                    );
                }

                $itemStmt->execute(['return_id' => $returnId, 'item_id' => $itemId, 'qty' => $qty]);

                $stock->applyMovement($itemId, 'employee', $employeeId, -$qty, 'salesman_return', 'stock_return_notes', $returnId, null, null, $returnedBy);
                $stock->applyMovement($itemId, 'branch', $branchId, $qty, 'salesman_return', 'stock_return_notes', $returnId, null, null, $returnedBy);
            }

            if ($sourceType === 'customer_prebooking' && $sourceId !== null) {
                $this->adjustIssuedQty($sourceType, $sourceId, $lines, -1);
            }

            $this->pdo->commit();
            return $returnId;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Issue TRANSACTIONS (headers) for a branch — one row per Issue Stock
     * action, however many items it contained (section 19/21: the issue
     * reference, not the per-item balance). item_count/total_qty are a
     * quick summary for the list view; full lines come from issueLines().
     */
    public function listIssues(int $branchId, ?int $employeeId = null): array
    {
        $sql = "SELECT sin.id, sin.issue_no, sin.issued_at, sin.notes,
                       sin.employee_id, u.name AS employee_name,
                       sin.route_id, r.name AS route_name,
                       ub.name AS issued_by_name,
                       COUNT(sii.id) AS item_count, SUM(sii.qty) AS total_qty
                FROM stock_issue_notes sin
                JOIN users u ON u.id = sin.employee_id
                LEFT JOIN routes r ON r.id = sin.route_id
                LEFT JOIN users ub ON ub.id = sin.issued_by
                LEFT JOIN stock_issue_items sii ON sii.issue_id = sin.id
                WHERE sin.branch_id = :branch_id";
        $params = ['branch_id' => $branchId];
        if ($employeeId !== null) {
            $sql .= ' AND sin.employee_id = :employee_id';
            $params['employee_id'] = $employeeId;
        }
        $sql .= ' GROUP BY sin.id ORDER BY sin.id DESC LIMIT 200';

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /** Item lines of one issue transaction — the "ONE ISSUE TRANSACTION → MANY ITEMS" detail (section 24). */
    public function issueLines(int $issueId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT sii.*, i.item_name, i.item_code, su.short_code AS unit_code
             FROM stock_issue_items sii
             JOIN items i ON i.id = sii.item_id
             LEFT JOIN stock_units su ON su.id = i.base_unit_id
             WHERE sii.issue_id = :issue_id
             ORDER BY sii.id'
        );
        $stmt->execute(['issue_id' => $issueId]);
        return $stmt->fetchAll();
    }

    public function findIssue(int $issueId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT sin.*, u.name AS employee_name, r.name AS route_name, ub.name AS issued_by_name
             FROM stock_issue_notes sin
             JOIN users u ON u.id = sin.employee_id
             LEFT JOIN routes r ON r.id = sin.route_id
             LEFT JOIN users ub ON ub.id = sin.issued_by
             WHERE sin.id = :id'
        );
        $stmt->execute(['id' => $issueId]);
        $issue = $stmt->fetch();
        if (!$issue) {
            return null;
        }
        $issue['items'] = $this->issueLines($issueId);
        return $issue;
    }

    /**
     * issued - returned per item for one employee, i.e. what's still "out"
     * with them (van pending). Joined to items/stock_units so the UI can
     * show the actual item name/SKU/unit instead of a bare item_id — the
     * balance itself (quantity_on_hand) was already correct; this was only
     * ever missing display data, not a stock-accounting bug (verified: two
     * issues to the same employee/item accumulate via stock_ledger's own
     * unique (item_id, owner_type, owner_id) balance row, never a duplicate
     * row, and a return only ever decrements that same row).
     */
    public function pendingForEmployee(int $employeeId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT sl.item_id, sl.quantity_on_hand,
                    i.item_name, i.item_code, i.barcode,
                    i.cost_price, i.purchase_price,
                    COALESCE(i.net_srate, i.retail_price) AS selling_price,
                    ROUND(sl.quantity_on_hand * i.cost_price, 2) AS stock_value,
                    su.short_code AS unit_code
             FROM stock_ledger sl
             JOIN items i ON i.id = sl.item_id
             LEFT JOIN stock_units su ON su.id = i.base_unit_id
             WHERE sl.owner_type = 'employee' AND sl.owner_id = :employee_id
             ORDER BY i.item_name"
        );
        $stmt->execute(['employee_id' => $employeeId]);
        return $stmt->fetchAll();
    }
}
