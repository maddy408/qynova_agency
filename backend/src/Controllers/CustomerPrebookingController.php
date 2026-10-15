<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Models\CustomerPrebookingModel;
use PDO;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class CustomerPrebookingController
{
    private CustomerPrebookingModel $model;

    public function __construct(private PDO $pdo)
    {
        $this->model = new CustomerPrebookingModel($pdo);
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
        PermissionMiddleware::require($claims, 'orders.view_prebooking');

        if (isset($_GET['page'])) {
            $page = max(1, (int) $_GET['page']);
            $limit = max(1, min(100, (int) ($_GET['limit'] ?? 10)));
            $result = $this->model->paginate(
                $this->resolveBranchId($claims),
                $page,
                $limit,
                $_GET['status'] ?? null,
                $_GET['search'] ?? null
            );
            Response::json($result);
            return;
        }

        Response::json($this->model->all($this->resolveBranchId($claims)));
    }


    public function show(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.view_prebooking');
        $row = $this->model->find((int) $id);
        if (!$row) {
            Response::error('Not found', 404);
        }
        Response::json($row);
    }

    /** @return array{0: array, 1: array, 2: ?string} */
    private function prepare(array $claims, array $body): array
    {
        if (empty($body['customer_id'])) {
            return [[], [], 'customer_id is required'];
        }
        if (empty($body['items'])) {
            return [[], [], 'At least one item is required'];
        }

        $branchId = $this->resolveBranchId($claims);
        $stmt = $this->pdo->prepare('SELECT id FROM customers WHERE id = :id AND branch_id = :branch_id');
        $stmt->execute(['id' => (int) $body['customer_id'], 'branch_id' => $branchId]);
        if (!$stmt->fetch()) {
            return [[], [], 'Customer not found in this branch'];
        }

        $lines = [];
        foreach ($body['items'] as $line) {
            if (empty($line['item_id']) || empty($line['qty'])) {
                return [[], [], 'Each line needs item_id and qty'];
            }
            $stmt = $this->pdo->prepare(
                'SELECT i.*, tc.gst_percent FROM items i
                 LEFT JOIN tax_codes tc ON tc.id = i.tax_code_id WHERE i.id = :id'
            );
            $stmt->execute(['id' => (int) $line['item_id']]);
            $item = $stmt->fetch();
            if (!$item) {
                return [[], [], "Item {$line['item_id']} not found"];
            }
            $unitPricing = \App\Models\ItemModel::resolveUnitPricing($item, !empty($line['unit_id']) ? (int) $line['unit_id'] : null);
            $lines[] = [
                'item_id' => (int) $item['id'],
                'qty' => (float) $line['qty'],
                'rate' => isset($line['rate']) && $line['rate'] !== '' ? (float) $line['rate'] : $unitPricing['net_srate'],
                'tax_percent' => (float) ($item['gst_percent'] ?? 0),
            ];
        }

        $header = [
            'customer_id' => (int) $body['customer_id'],
            'branch_id' => $branchId,
            'route_id' => !empty($body['route_id']) ? (int) $body['route_id'] : null,
            'employee_id' => !empty($body['employee_id']) ? (int) $body['employee_id'] : null,
            'booking_source' => $body['booking_source'] ?? 'direct',
            'notes' => $body['notes'] ?? null,
            'created_by' => (int) $claims['sub'],
        ];

        return [$header, $lines, null];
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.create_prebooking');

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        [$header, $lines, $error] = $this->prepare($claims, $body);
        if ($error) {
            Response::error($error, 422);
        }

        try {
            $id = $this->model->create($header, $lines);
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
        Response::json($this->model->find($id), 201);
    }

    public function update(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.create_prebooking');

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        [$header, $lines, $error] = $this->prepare($claims, $body);
        if ($error) {
            Response::error($error, 422);
        }

        try {
            $this->model->update((int) $id, $header, $lines);
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
        Response::json($this->model->find((int) $id));
    }

    public function updateStatus(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage_prebooking_status');

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($body['status'])) {
            Response::error('status is required', 422);
        }

        try {
            $result = $this->model->updateStatus((int) $id, $body['status']);
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
        Response::json($result);
    }

    public function cancel(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage_prebooking_status');

        try {
            $result = $this->model->updateStatus((int) $id, 'cancelled');
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
        Response::json($result);
    }

    public function exportExcel(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.view_prebooking');

        $rows = $this->model->all($this->resolveBranchId($claims));

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $headers = ['Order No', 'Date', 'Customer', 'Route', 'Branch', 'Salesman', 'Booking Source', 'Total Items', 'Estimated Total', 'Status'];
        $sheet->fromArray($headers, null, 'A1');

        $rowNum = 2;
        foreach ($rows as $r) {
            $sheet->fromArray([
                $r['prebooking_no'], $r['created_at'], $r['customer_name'], $r['route_name'] ?? '-',
                $r['branch_id'], $r['employee_name'] ?? '-', $r['booking_source'], $r['item_count'],
                $r['estimated_total'], $r['status'],
            ], null, "A{$rowNum}");
            $rowNum++;
        }

        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment;filename="customer_prebookings.xlsx"');
        $writer = new Xlsx($spreadsheet);
        $writer->save('php://output');
        exit;
    }
}
