<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Models\SalesReturnModel;
use PDO;

class SalesReturnController
{
    private SalesReturnModel $model;

    public function __construct(private PDO $pdo)
    {
        $this->model = new SalesReturnModel($pdo);
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

        if (isset($_GET['page'])) {
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

        Response::json($this->model->all($this->resolveBranchId($claims)));
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
        PermissionMiddleware::require($claims, 'returns.sales_return');

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($body['items'])) {
            Response::error('At least one return line is required', 422);
        }

        $header = [
            'invoice_id' => !empty($body['invoice_id']) ? (int) $body['invoice_id'] : null,
            'customer_id' => !empty($body['customer_id']) ? (int) $body['customer_id'] : null,
            'branch_id' => $this->resolveBranchId($claims),
            'reason' => $body['reason'] ?? null,
            'refund_action' => $body['refund_action'] ?? 'credit_note',
            'created_by' => (int) $claims['sub'],
        ];

        $canApprove = in_array('returns.approve_untraceable_return', (array) ($claims['permissions'] ?? []), true);
        $refundAmount = isset($body['refund_amount']) && $body['refund_amount'] !== ''
            ? (float) $body['refund_amount']
            : null;

        try {
            $id = $this->model->create($header, $body['items'], $canApprove, $refundAmount);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
        Response::json($this->model->find($id), 201);
    }

    public function approve(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'returns.approve_untraceable_return');

        try {
            $this->model->approve((int) $id, (int) $claims['sub']);
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
        Response::json($this->model->find((int) $id));
    }

    public function reject(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'returns.approve_untraceable_return');
        $this->model->reject((int) $id);
        Response::json($this->model->find((int) $id));
    }
}
