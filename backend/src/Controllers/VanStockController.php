<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Models\CustomerPrebookingModel;
use App\Models\PurchaseRequestModel;
use App\Models\VanStockModel;
use App\Services\StockLedgerService;
use PDO;

class VanStockController
{
    private VanStockModel $model;

    public function __construct(private PDO $pdo)
    {
        $this->model = new VanStockModel($pdo);
    }

    private function resolveBranchId(array $claims): int
    {
        $canSwitch = in_array('branches.switch_context', (array) ($claims['permissions'] ?? []), true);
        if ($canSwitch && isset($_GET['branch_id'])) {
            return (int) $_GET['branch_id'];
        }
        return (int) $claims['branch_id'];
    }

    public function issue(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.issue_van_stock');

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($body['employee_id']) || empty($body['items'])) {
            Response::error('employee_id and items are required', 422);
        }

        $branchId = $this->resolveBranchId($claims);
        $sourceType = in_array($body['source_type'] ?? null, ['customer_prebooking', 'purchase_request'], true)
            ? $body['source_type'] : null;
        $sourceId = $sourceType !== null && !empty($body['source_id']) ? (int) $body['source_id'] : null;

        // Stock Warning (not a block): if any requested line exceeds what's
        // actually on hand at the source branch right now, report it back
        // instead of silently issuing — unless the caller already
        // acknowledged the shortage (confirm_insufficient), in which case we
        // always proceed. Checked fresh against the live ledger on every
        // call so a stock change between the warning and the confirm click
        // is still caught. Skipped entirely for a purchase_request source:
        // that flow credits the van directly from the supplier and never
        // debits the branch, so branch stock sufficiency is irrelevant.
        if ($sourceType !== 'purchase_request' && empty($body['confirm_insufficient'])) {
            $shortages = $this->insufficientStockLines($branchId, $body['items']);
            if (!empty($shortages)) {
                Response::json(['warning' => 'insufficient_stock', 'shortages' => $shortages], 409);
            }
        }

        try {
            $id = $this->model->issue(
                $branchId,
                (int) $body['employee_id'],
                !empty($body['route_id']) ? (int) $body['route_id'] : null,
                (int) $claims['sub'],
                $body['notes'] ?? null,
                $body['items'],
                $sourceType,
                $sourceId
            );
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
        Response::json(['issue_id' => $id], 201);
    }

    /** GET /api/van-stock/eligible-orders?type=customer|supplier — dropdown source for the order-linked issue flow. */
    public function eligibleOrders(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $branchId = $this->resolveBranchId($claims);
        $type = $_GET['type'] ?? '';

        if ($type === 'customer') {
            Response::json((new CustomerPrebookingModel($this->pdo))->eligibleForVanStock($branchId));
        } elseif ($type === 'supplier') {
            Response::json((new PurchaseRequestModel($this->pdo))->eligibleForVanStock($branchId));
        } else {
            Response::error("type must be 'customer' or 'supplier'", 422);
        }
    }

    /**
     * Per-line comparison of requested qty against the actual branch
     * balance in stock_ledger (never the item master, which carries no
     * quantity at all). Returns one entry per item that is short, each
     * carrying product name + available/requested/excess for the warning.
     */
    private function insufficientStockLines(int $branchId, array $items): array
    {
        $stockLedger = new StockLedgerService($this->pdo);
        $nameStmt = $this->pdo->prepare('SELECT item_name FROM items WHERE id = :id');
        $shortages = [];
        foreach ($items as $line) {
            $itemId = (int) ($line['item_id'] ?? 0);
            $qty = (float) ($line['qty'] ?? 0);
            if ($itemId <= 0 || $qty <= 0) {
                continue;
            }
            $available = $stockLedger->quantityOnHand($itemId, 'branch', $branchId);
            if ($qty > $available + 0.0001) {
                $nameStmt->execute(['id' => $itemId]);
                $shortages[] = [
                    'item_id' => $itemId,
                    'item_name' => $nameStmt->fetchColumn() ?: "Item #{$itemId}",
                    'available' => $available,
                    'requested' => $qty,
                    'excess' => round($qty - $available, 3),
                ];
            }
        }
        return $shortages;
    }

    public function returnStock(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.issue_van_stock');

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($body['employee_id']) || empty($body['items'])) {
            Response::error('employee_id and items are required', 422);
        }

        try {
            $id = $this->model->returnStock(
                $this->resolveBranchId($claims),
                (int) $body['employee_id'],
                !empty($body['issue_id']) ? (int) $body['issue_id'] : null,
                (int) $claims['sub'],
                $body['notes'] ?? null,
                $body['items']
            );
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
        Response::json(['return_id' => $id], 201);
    }

    /**
     * GET /api/van-stock/{employeeId} — what's currently out with this
     * salesman. ?export=1 streams the same, currently-filtered rows as
     * .xlsx instead of JSON; ?item_ids=1,2,3 narrows to just those items
     * (the "Export Selected" case — selection always narrows the same
     * query that's already scoped to this one salesman, never a different
     * salesman's data).
     */
    public function pending(string $employeeId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $rows = $this->model->pendingForEmployee((int) $employeeId);

        if (!empty($_GET['item_ids'])) {
            $wanted = array_map('intval', explode(',', (string) $_GET['item_ids']));
            $rows = array_values(array_filter($rows, fn ($r) => in_array((int) $r['item_id'], $wanted, true)));
        }

        if (!empty($_GET['export'])) {
            PermissionMiddleware::require($claims, 'reports.export_excel');
            $stmt = $this->pdo->prepare('SELECT name FROM users WHERE id = :id');
            $stmt->execute(['id' => (int) $employeeId]);
            $employeeName = $stmt->fetchColumn() ?: "employee-{$employeeId}";
            $safeName = preg_replace('/[^A-Za-z0-9]+/', '_', $employeeName);
            $suffix = !empty($_GET['item_ids']) ? 'Selected' : 'All';

            \App\Helpers\TableExporter::export([
                'item_id' => 'Item ID', 'item_name' => 'Item Name', 'item_code' => 'SKU', 'barcode' => 'Barcode',
                'unit_code' => 'Unit', 'quantity_on_hand' => 'On-hand Qty', 'cost_price' => 'Purchase/Cost Price',
                'selling_price' => 'Selling Price', 'stock_value' => 'Stock Value',
            ], $rows, "Van_Stock_{$suffix}_{$safeName}_" . date('Y-m-d') . '.xlsx');
        }

        Response::json($rows);
    }

    /**
     * GET /api/van-stock/issues — issue TRANSACTIONS for this branch (one
     * row per Issue Stock action, section 19), not the flattened item
     * balance pending() returns. ?employee_id narrows to one salesman.
     * ?detail=1 returns flattened item-line rows (all lines of every listed
     * transaction) for building a client-side PDF; ?export=1 streams the
     * same flattened rows as .xlsx. ?ids=1,2,3 narrows to specific issue
     * transactions (the "Export Selected" case) — selecting one multi-item
     * transaction still exports every item line it contains together.
     */
    public function issues(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $branchId = $this->resolveBranchId($claims);
        $employeeId = !empty($_GET['employee_id']) ? (int) $_GET['employee_id'] : null;
        $rows = $this->model->listIssues($branchId, $employeeId);

        if (!empty($_GET['ids'])) {
            $wanted = array_map('intval', explode(',', (string) $_GET['ids']));
            $rows = array_values(array_filter($rows, fn ($r) => in_array((int) $r['id'], $wanted, true)));
        }

        if (!empty($_GET['detail'])) {
            Response::json($this->flattenedIssueLines($rows));
            return;
        }

        if (!empty($_GET['export'])) {
            PermissionMiddleware::require($claims, 'reports.export_excel');
            $this->exportIssuesExcel($rows, !empty($_GET['ids']));
        }

        Response::json($rows);
    }

    /** GET /api/van-stock/issues/{id} — one issue transaction with all its item lines. */
    public function showIssue(string $id): void
    {
        JwtAuthMiddleware::authenticate();
        $issue = $this->model->findIssue((int) $id);
        if (!$issue) {
            Response::error('Not found', 404);
        }
        Response::json($issue);
    }

    /** One row per issue-transaction line — header fields repeated per item, same convention as the GRN export. */
    private function flattenedIssueLines(array $issues): array
    {
        $rows = [];
        foreach ($issues as $issue) {
            foreach ($this->model->issueLines((int) $issue['id']) as $line) {
                $rows[] = [
                    'issue_no' => $issue['issue_no'],
                    'issued_at' => $issue['issued_at'],
                    'employee_name' => $issue['employee_name'],
                    'route_name' => $issue['route_name'],
                    'issued_by_name' => $issue['issued_by_name'],
                    'notes' => $issue['notes'],
                    'item_name' => $line['item_name'],
                    'item_code' => $line['item_code'],
                    'qty' => $line['qty'],
                    'unit_code' => $line['unit_code'],
                ];
            }
        }
        return $rows;
    }

    private function exportIssuesExcel(array $issues, bool $isSelected): void
    {
        $singleIssueNo = (count($issues) === 1) ? $issues[0]['issue_no'] : null;

        if (empty($issues)) {
            \App\Helpers\TableExporter::export(['issue_no' => 'Issue #'], [], 'Van_Stock_Issues_' . ($isSelected ? 'Selected' : 'All') . '_' . date('Y-m-d') . '.xlsx');
            return;
        }

        $rows = $this->flattenedIssueLines($issues);
        $columns = [
            'issue_no' => 'Issue Number', 'issued_at' => 'Issue Date', 'employee_name' => 'Salesman',
            'route_name' => 'Route', 'item_code' => 'SKU', 'item_name' => 'Item Name',
            'qty' => 'Qty', 'unit_code' => 'Unit', 'issued_by_name' => 'Issued By', 'notes' => 'Notes',
        ];

        $filename = $singleIssueNo !== null
            ? "{$singleIssueNo}.xlsx"
            : 'Van_Stock_Issues_' . ($isSelected ? 'Selected' : 'All') . '_' . date('Y-m-d') . '.xlsx';
        \App\Helpers\TableExporter::export($columns, $rows, $filename);
    }
}
