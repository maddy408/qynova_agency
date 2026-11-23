<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\CodeGenerator;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Models\SimpleCrudModel;
use PDO;

/**
 * Generic REST CRUD for simple lookup-style entities (categories, tax_codes,
 * stock_units, routes, cities, suppliers, brands, product_lines). List/show
 * only require login; write actions require the entity's manage permission —
 * catalog data is meant to be readable broadly, editable only by the gated role.
 */
class CrudController
{
    public function __construct(
        private PDO $pdo,
        private string $table,
        private array $columns,
        private string $managePermission,
        private ?string $codePrefix = null,
        private string $orderBy = 'id'
    ) {
    }

    private function model(): SimpleCrudModel
    {
        return new SimpleCrudModel($this->pdo, $this->table, $this->columns, $this->orderBy);
    }

    public function index(): void
    {
        JwtAuthMiddleware::authenticate();

        if (isset($_GET['page'])) {
            $page = max(1, (int) $_GET['page']);
            $limit = max(1, min(100, (int) ($_GET['limit'] ?? 10)));
            $search = isset($_GET['search']) && trim((string) $_GET['search']) !== '' ? trim((string) $_GET['search']) : null;

            $searchColumns = [];
            foreach (['name', 'code', 'description'] as $candidate) {
                if (in_array($candidate, $this->columns, true)) {
                    $searchColumns[] = $candidate;
                }
            }

            Response::json($this->model()->paginate([], $page, $limit, $search, $searchColumns));
            return;
        }

        Response::json($this->model()->all());
    }


    public function show(string $id): void
    {
        JwtAuthMiddleware::authenticate();
        $row = $this->model()->find((int) $id);
        if (!$row) {
            Response::error('Not found', 404);
        }
        Response::json($row);
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, $this->managePermission);

        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        // Validation for cities
        if ($this->table === 'cities') {
            if (empty(trim((string) ($data['name'] ?? '')))) {
                Response::error('City name is required', 422);
            }
            if (empty($data['route_id'])) {
                // If route_id is omitted, check if a route exists to fallback or return error
                $firstRouteStmt = $this->pdo->query('SELECT id FROM routes ORDER BY id ASC LIMIT 1');
                $firstRouteId = $firstRouteStmt->fetchColumn();
                if ($firstRouteId) {
                    $data['route_id'] = (int) $firstRouteId;
                } else {
                    Response::error('Please create at least one Route before adding a City', 422);
                }
            }
        }

        try {
            $id = $this->model()->create($data);

            if ($this->codePrefix !== null) {
                $this->model()->update($id, ['code' => CodeGenerator::fromId($this->codePrefix, $id)]);
            }

            Response::json($this->model()->find($id), 201);
        } catch (\PDOException $e) {
            $code = $e->errorInfo[1] ?? 0;
            if ($code === 1062) {
                Response::error('A record with this value already exists.', 422);
            } elseif ($code === 1452) {
                Response::error('Selected related record (e.g. Route) does not exist.', 422);
            } elseif ($code === 1364) {
                Response::error('Required fields are missing.', 422);
            } else {
                Response::error('Failed to save: ' . $e->getMessage(), 422);
            }
        }
    }

    public function update(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, $this->managePermission);

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        if (!$this->model()->find((int) $id)) {
            Response::error('Not found', 404);
        }

        if ($this->table === 'cities' && isset($data['name']) && empty(trim((string) $data['name']))) {
            Response::error('City name cannot be empty', 422);
        }

        try {
            $this->model()->update((int) $id, $data);
            Response::json($this->model()->find((int) $id));
        } catch (\PDOException $e) {
            $code = $e->errorInfo[1] ?? 0;
            if ($code === 1062) {
                Response::error('A record with this value already exists.', 422);
            } elseif ($code === 1452) {
                Response::error('Selected related record does not exist.', 422);
            } else {
                Response::error('Failed to update: ' . $e->getMessage(), 422);
            }
        }
    }

    public function destroy(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, $this->managePermission);

        if (!$this->model()->find((int) $id)) {
            Response::error('Not found', 404);
        }
        $this->model()->delete((int) $id);
        Response::json(['deleted' => true]);
    }
}
