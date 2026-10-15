<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Models\PurchaseModel;
use App\Models\SupplierPaymentModel;
use PDO;

class SupplierPaymentController
{
    private SupplierPaymentModel $model;
    private PurchaseModel $purchases;

    public function __construct(private PDO $pdo)
    {
        $this->model = new SupplierPaymentModel($pdo);
        $this->purchases = new PurchaseModel($pdo);
    }

    private function resolveBranchId(array $claims): int
    {
        $canSwitch = in_array('branches.switch_context', (array) ($claims['permissions'] ?? []), true);
        if ($canSwitch && isset($_GET['branch_id'])) {
            return (int) $_GET['branch_id'];
        }
        return (int) $claims['branch_id'];
    }

    public function index(): void
    {
        $claims = JwtAuthMiddleware::authenticate();

        if (isset($_GET['page']) && empty($_GET['export']) && empty($_GET['ids'])) {
            $page = max(1, (int) $_GET['page']);
            $limit = max(1, min(100, (int) ($_GET['limit'] ?? 10)));
            $result = $this->model->paginate(
                $this->resolveBranchId($claims),
                $page,
                $limit,
                $_GET['search'] ?? null
            );
            Response::json($result);
            return;
        }

        $rows = $this->model->all($this->resolveBranchId($claims));


        // ?ids=1,2,3 narrows to exactly those payments (the "Export
        // Selected" case), applied to the same branch-scoped list.
        if (!empty($_GET['ids'])) {
            $wanted = array_map('intval', explode(',', (string) $_GET['ids']));
            $rows = array_values(array_filter($rows, fn ($r) => in_array((int) $r['id'], $wanted, true)));
        }

        if (!empty($_GET['export'])) {
            PermissionMiddleware::require($claims, 'reports.export_excel');
            $this->exportExcel($rows, !empty($_GET['ids']));
        }

        Response::json($rows);
    }

    /**
     * GRN Reference column comes from a real join to supplier_payment_
     * allocations (which GRN(s) this payment was actually allocated
     * against) — not invented; a payment with no allocations (paid on
     * account, not against a specific GRN) legitimately shows blank.
     */
    private function exportExcel(array $rows, bool $isSelected): void
    {
        if (!empty($rows)) {
            $ids = array_map(fn ($r) => (int) $r['id'], $rows);
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $this->pdo->prepare(
                "SELECT spa.supplier_payment_id, GROUP_CONCAT(p.grn_no SEPARATOR ', ') AS grn_refs
                 FROM supplier_payment_allocations spa
                 JOIN purchases p ON p.id = spa.purchase_id
                 WHERE spa.supplier_payment_id IN ({$placeholders})
                 GROUP BY spa.supplier_payment_id"
            );
            $stmt->execute($ids);
            $grnBySupplierPayment = array_column($stmt->fetchAll(), 'grn_refs', 'supplier_payment_id');
            foreach ($rows as &$row) {
                $row['grn_refs'] = $grnBySupplierPayment[$row['id']] ?? '';
            }
            unset($row);
        }

        $columns = [
            'payment_code' => 'Payment ID', 'paid_at' => 'Date', 'supplier_name' => 'Supplier',
            'grn_refs' => 'GRN / Purchase Reference', 'payment_mode' => 'Payment Mode', 'amount' => 'Amount',
            'reference_no' => 'Reference No', 'notes' => 'Notes', 'paid_by_name' => 'Created By',
        ];
        $filename = 'Supplier_Payments_' . ($isSelected ? 'Selected' : 'All') . '_' . date('Y-m-d') . '.xlsx';
        \App\Helpers\TableExporter::export($columns, $rows, $filename);
    }

    /** GET /api/suppliers/{id}/unpaid-grns — the "Unpaid Purchase GRNs Breakdown" panel. */
    public function unpaidGrns(string $supplierId): void
    {
        JwtAuthMiddleware::authenticate();
        Response::json($this->purchases->unpaidForSupplier((int) $supplierId));
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'purchases.settle_supplier_payment');

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($body['supplier_id']) || empty($body['amount']) || empty($body['payment_mode'])) {
            Response::error('supplier_id, amount and payment_mode are required', 422);
        }

        try {
            $result = $this->model->record(
                (int) $body['supplier_id'],
                $this->resolveBranchId($claims),
                (float) $body['amount'],
                $body['payment_mode'],
                $body['reference_no'] ?? null,
                $body['notes'] ?? null,
                (int) $claims['sub'],
                $body['allocations'] ?? null
            );
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }

        Response::json($result, 201);
    }
}
