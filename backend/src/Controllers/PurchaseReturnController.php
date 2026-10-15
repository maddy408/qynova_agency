<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Models\PurchaseReturnModel;
use PDO;

class PurchaseReturnController
{
    private PurchaseReturnModel $model;

    public function __construct(private PDO $pdo)
    {
        $this->model = new PurchaseReturnModel($pdo);
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
        $branchId = $this->resolveBranchId($claims);

        if (isset($_GET['page'])) {
            $page = max(1, (int) $_GET['page']);
            $limit = max(1, min(100, (int) ($_GET['limit'] ?? 10)));
            $search = isset($_GET['search']) && trim((string) $_GET['search']) !== '' ? trim((string) $_GET['search']) : null;
            Response::json($this->model->paginate($branchId, $page, $limit, $search));
            return;
        }

        Response::json($this->model->all($branchId));
    }

    public function show(string $id): void
    {
        JwtAuthMiddleware::authenticate();
        $row = $this->model->find((int) $id);
        if (!$row) {
            Response::error('Not found', 404);
        }
        Response::json($row);
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'returns.purchase_return');

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($body['supplier_id']) || empty($body['items'])) {
            Response::error('supplier_id and items are required', 422);
        }

        $header = [
            'purchase_id' => !empty($body['purchase_id']) ? (int) $body['purchase_id'] : null,
            'supplier_id' => (int) $body['supplier_id'],
            'branch_id' => $this->resolveBranchId($claims),
            'reason' => $body['reason'] ?? null,
        ];

        $refundAmount = isset($body['refund_amount']) && $body['refund_amount'] !== ''
            ? (float) $body['refund_amount']
            : null;

        try {
            $id = $this->model->create($header, $body['items'], (int) $claims['sub'], $refundAmount);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
        Response::json($this->model->find($id), 201);
    }
}
