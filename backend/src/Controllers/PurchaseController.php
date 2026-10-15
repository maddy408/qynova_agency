<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Models\PurchaseModel;
use PDO;

class PurchaseController
{
    private PurchaseModel $model;

    public function __construct(private PDO $pdo)
    {
        $this->model = new PurchaseModel($pdo);
    }

    private function resolveBranchId(array $claims): int
    {
        $canSwitch = in_array('branches.switch_context', (array) ($claims['permissions'] ?? []), true);
        if ($canSwitch && isset($_GET['branch_id'])) {
            return (int) $_GET['branch_id'];
        }
        return (int) $claims['branch_id'];
    }

    private function stripCostIfUnauthorized(array $claims, array $rows): array
    {
        if (in_array('purchases.view_purchase_cost', (array) ($claims['permissions'] ?? []), true)) {
            return $rows;
        }
        $strip = fn ($row) => array_diff_key($row, array_flip(['subtotal', 'tax_total', 'grand_total', 'paid_amount', 'pending_balance']));
        return isset($rows[0]) || $rows === [] ? array_map($strip, $rows) : $strip($rows);
    }

    public function index(): void
    {
        $claims = JwtAuthMiddleware::authenticate();

        if (isset($_GET['page']) && empty($_GET['export']) && empty($_GET['detail']) && empty($_GET['ids'])) {
            $page = max(1, (int) $_GET['page']);
            $limit = max(1, min(100, (int) ($_GET['limit'] ?? 10)));
            $result = $this->model->paginate(
                $this->resolveBranchId($claims),
                $page,
                $limit,
                $_GET['search'] ?? null
            );
            $result['data'] = $this->stripCostIfUnauthorized($claims, $result['data']);
            Response::json($result);
            return;
        }

        $rows = $this->model->all($this->resolveBranchId($claims));


        // ?ids=1,2,3 narrows to exactly those GRNs (the "Export Selected"
        // case from the UI's row checkboxes) — applied to the same
        // branch-scoped list every other view of this endpoint already
        // uses, never a different/unscoped query.
        if (!empty($_GET['ids'])) {
            $wanted = array_map('intval', explode(',', (string) $_GET['ids']));
            $rows = array_values(array_filter($rows, fn ($r) => in_array((int) $r['id'], $wanted, true)));
        }

        $canViewCost = in_array('purchases.view_purchase_cost', (array) ($claims['permissions'] ?? []), true);

        // ?detail=1 returns the same flattened item-line rows the Excel
        // export streams, as JSON — lets the web app build a client-side
        // PDF from the identical, backend-computed numbers (gross/discount/
        // GST/net) instead of recomputing them in JS, so PDF and Excel can
        // never drift apart.
        if (!empty($_GET['detail'])) {
            Response::json($this->flattenedGrnLines($rows, $canViewCost));
            return;
        }

        if (!empty($_GET['export'])) {
            PermissionMiddleware::require($claims, 'reports.export_excel');
            $this->exportGrnExcel($rows, !empty($_GET['ids']), $canViewCost);
        }

        Response::json($this->stripCostIfUnauthorized($claims, $rows));
    }

    /**
     * One row per GRN line (item detail) — every field General Purchase
     * requirement section 2/3/8 asks for, all derived from real stored
     * columns (PurchaseModel::lineItemsFor(), the exact same query/method
     * find() uses for the single-GRN view, so list export and single-GRN
     * view can never show different numbers for the same line). Cost/rate
     * columns are stripped for a caller without purchases.view_purchase_cost.
     */
    private function flattenedGrnLines(array $purchases, bool $canViewCost): array
    {
        $rows = [];
        foreach ($purchases as $p) {
            foreach ($this->model->lineItemsFor((int) $p['id']) as $line) {
                $row = [
                    'grn_no' => $p['grn_no'],
                    'purchase_date' => $p['purchase_date'],
                    'supplier_name' => $p['supplier_name'],
                    'supplier_invoice_no' => $p['supplier_invoice_no'],
                    'branch_name' => $p['branch_name'] ?? null,
                    'supplier_phone' => $p['supplier_phone'] ?? null,
                    'supplier_address' => $p['supplier_address'] ?? null,
                    'supplier_gstin' => $p['supplier_gstin'] ?? null,
                    'created_by_name' => $p['created_by_name'] ?? null,
                    'item_name' => $line['item_name'],
                    'item_code' => $line['item_code'],
                    'hsn_code' => $line['hsn_code'],
                    'qty' => $line['qty'],
                    'free_qty' => $line['free_qty'],
                    'unit_code' => $line['unit_code'],
                    'status' => $p['status'],
                    'payment_mode' => $p['payment_mode'],
                ];
                if ($canViewCost) {
                    $row += [
                        'rate' => $line['rate'],
                        'mrp' => $line['mrp'],
                        'gross_amount' => $line['gross_amount'],
                        'discount_percent' => $line['discount_percent'],
                        'discount_amount' => $line['discount_amount'],
                        'taxable_amount' => $line['taxable_amount'],
                        'tax_percent' => $line['tax_percent'],
                        'tax_amount' => $line['tax_amount'],
                        'net_amount' => $line['net_amount'],
                        'grn_grand_total' => $p['grand_total'],
                        'grn_paid_amount' => $p['paid_amount'],
                        'grn_pending_balance' => $p['pending_balance'],
                    ];
                }
                $rows[] = $row;
            }
        }
        return $rows;
    }

    /**
     * One row per GRN line (item detail), same flattened-report convention
     * used by the invoice-wise profit export — header fields (GRN #, date,
     * supplier, invoice #, payment mode, totals, status) repeated on every
     * line of that GRN. A single-GRN export (exactly one id selected) is
     * named after that GRN directly (section 10/11), not the generic
     * "Selected" filename.
     */
    private function exportGrnExcel(array $purchases, bool $isSelected, bool $canViewCost): void
    {
        $singleGrnNo = (count($purchases) === 1) ? $purchases[0]['grn_no'] : null;

        if (empty($purchases)) {
            \App\Helpers\TableExporter::export(['grn_no' => 'GRN #'], [], 'GRN_Purchases_' . ($isSelected ? 'Selected' : 'All') . '_' . date('Y-m-d') . '.xlsx');
            return;
        }

        $rows = $this->flattenedGrnLines($purchases, $canViewCost);

        $columns = [
            'grn_no' => 'GRN Number', 'purchase_date' => 'Purchase Date', 'supplier_name' => 'Supplier',
            'supplier_invoice_no' => 'Supplier Invoice Number', 'branch_name' => 'Branch',
            'item_code' => 'Item Code', 'item_name' => 'Item Name', 'hsn_code' => 'HSN',
            'qty' => 'Qty', 'free_qty' => 'Free Qty', 'unit_code' => 'Unit',
        ];
        if ($canViewCost) {
            $columns += [
                'rate' => 'Purchase Rate', 'mrp' => 'MRP',
                'discount_percent' => 'Discount %', 'discount_amount' => 'Discount Amount',
                'taxable_amount' => 'Taxable Amount', 'tax_percent' => 'GST %', 'tax_amount' => 'GST Amount',
                'net_amount' => 'Net Amount',
            ];
        }
        $columns['payment_mode'] = 'Payment Mode';
        if ($canViewCost) {
            $columns += ['grn_grand_total' => 'GRN Grand Total', 'grn_pending_balance' => 'GRN Pending Balance'];
        }
        $columns['status'] = 'Payment Status';

        $filename = $singleGrnNo !== null
            ? "{$singleGrnNo}.xlsx"
            : 'GRN_Purchases_' . ($isSelected ? 'Selected' : 'All') . '_' . date('Y-m-d') . '.xlsx';
        \App\Helpers\TableExporter::export($columns, $rows, $filename);
    }

    public function show(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $row = $this->model->find((int) $id);
        if (!$row) {
            Response::error('Not found', 404);
        }
        Response::json($this->stripCostIfUnauthorized($claims, $row));
    }

    /** GET /api/purchases/{id}/returnable-items — feeds Purchase Return's GRN-line picker. */
    public function returnableItems(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'returns.purchase_return');
        $purchase = $this->model->find((int) $id);
        if (!$purchase) {
            Response::error('Not found', 404);
        }
        $canSwitch = in_array('branches.switch_context', (array) ($claims['permissions'] ?? []), true);
        if (!$canSwitch && (int) $purchase['branch_id'] !== (int) $claims['branch_id']) {
            Response::error('Not found', 404);
        }
        Response::json($this->model->returnableItems((int) $id));
    }

    /**
     * Resolves each line's item row and prices it server-side via
     * PurchaseModel::priceLine() — the frontend's own totals are for
     * display only, never trusted for the actual save. Also verifies the
     * item is actually sellable/stocked at the target branch (reuses the
     * item_branches mapping already enforced by ItemModel::all()).
     *
     * @return array{0: array, 1: ?string} [priced lines, error]
     */
    private function priceLines(array $items, int $branchId): array
    {
        if (empty($items)) {
            return [[], 'At least one item is required'];
        }

        $lines = [];
        foreach ($items as $input) {
            if (empty($input['item_id']) || empty($input['qty'])) {
                return [[], 'Each line needs item_id and qty'];
            }
            $qty = (float) $input['qty'];
            $freeQty = (float) ($input['free_qty'] ?? 0);
            // Omitted rate means "use the item's NET_PURRATE" (resolved
            // below via priceLine) — only a rate the caller actually sent
            // gets validated as non-negative.
            $rateProvided = isset($input['rate']) && $input['rate'] !== '';
            $discountPercent = (float) ($input['discount_percent'] ?? 0);
            $discountAmountInput = $input['discount_amount'] ?? null;

            if ($qty <= 0) {
                return [[], 'Quantity must be greater than 0'];
            }
            if ($freeQty < 0) {
                return [[], 'Free quantity cannot be negative'];
            }
            if ($rateProvided && (float) $input['rate'] < 0) {
                return [[], 'Purchase price cannot be negative'];
            }
            if (isset($input['mrp']) && $input['mrp'] !== '' && (float) $input['mrp'] < 0) {
                return [[], 'MRP cannot be negative'];
            }
            if ($discountPercent < 0 || $discountPercent > 100) {
                return [[], 'Discount percent must be between 0 and 100'];
            }

            $stmt = $this->pdo->prepare(
                'SELECT i.*, ib.branch_id AS mapped_branch
                 FROM items i
                 LEFT JOIN item_branches ib ON ib.item_id = i.id AND ib.branch_id = :branch_id
                 WHERE i.id = :id'
            );
            $stmt->execute(['id' => (int) $input['item_id'], 'branch_id' => $branchId]);
            $item = $stmt->fetch();
            if (!$item) {
                return [[], "Item {$input['item_id']} not found"];
            }
            if ($item['mapped_branch'] === null) {
                return [[], "'{$item['item_name']}' is not available at this branch — map it under Catalog first"];
            }

            $effectiveRate = $rateProvided
                ? (float) $input['rate']
                : \App\Models\ItemModel::resolveUnitPricing($item, !empty($input['unit_id']) ? (int) $input['unit_id'] : null)['net_purrate'];
            $grossCheck = round($qty * $effectiveRate, 2);
            if ($discountAmountInput !== null && $discountAmountInput !== '' && (float) $discountAmountInput > $grossCheck + 0.009) {
                return [[], "Discount amount cannot exceed the gross amount for '{$item['item_name']}'"];
            }

            $priced = $this->model->priceLine($item, $input);
            if (!empty($input['unit_id'])) {
                $priced['unit_id'] = (int) $input['unit_id'];
            }
            $lines[] = $priced;
        }

        return [$lines, null];
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'purchases.create_grn');

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($body['supplier_id'])) {
            Response::error('supplier_id is required', 422);
        }

        $branchId = $this->resolveBranchId($claims);
        [$lines, $error] = $this->priceLines($body['items'] ?? [], $branchId);
        if ($error) {
            Response::error($error, 422);
        }

        $header = [
            'supplier_id' => (int) $body['supplier_id'],
            'branch_id' => $branchId,
            'purchase_request_id' => $body['purchase_request_id'] ?? null,
            'supplier_invoice_no' => $body['supplier_invoice_no'] ?? null,
            'payment_mode' => $body['payment_mode'] ?? 'credit',
            'paid_amount' => (float) ($body['paid_amount'] ?? 0),
        ];

        try {
            $id = $this->model->create($header, $lines, (int) $claims['sub']);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
        Response::json($this->model->find($id), 201);
    }

    public function update(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'purchases.edit_grn');

        $existing = $this->model->find((int) $id);
        if (!$existing) {
            Response::error('Not found', 404);
        }

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        [$lines, $error] = $this->priceLines($body['items'] ?? [], (int) $existing['branch_id']);
        if ($error) {
            Response::error($error, 422);
        }

        try {
            $result = $this->model->editPurchase(
                (int) $id,
                ['supplier_invoice_no' => $body['supplier_invoice_no'] ?? null],
                $lines,
                (int) $claims['sub']
            );
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
        Response::json($result);
    }

    public function destroy(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'purchases.delete_grn');

        try {
            $this->model->delete((int) $id, (int) $claims['sub']);
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
        Response::json(['deleted' => true]);
    }
}
