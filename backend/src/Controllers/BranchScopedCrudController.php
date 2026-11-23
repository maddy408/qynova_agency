<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\CodeGenerator;
use App\Helpers\Response;
use App\Helpers\Validator;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Models\SimpleCrudModel;
use PDO;

/**
 * CRUD for entities that always belong to exactly one branch (routes,
 * suppliers, customers — section 3.2/4.2 of the spec). A user without
 * branches.switch_context is hard-locked to their own home branch on every
 * read and write; ?branch_id= from the query string is ignored for them so
 * they can never see or write another branch's rows just by editing the URL.
 *
 * $autoDefaults: [column => fn(array $claims): mixed] applied on create only
 * when the caller didn't already supply that column (e.g. created_by,
 * expense_date defaulting to today). $codePrefix/$codeColumn auto-generate a
 * code like "EXP00001" from the new row's own id, same convention as
 * CrudController.
 */
class BranchScopedCrudController
{
    public function __construct(
        private PDO $pdo,
        private string $table,
        private array $columns,
        private string $managePermission,
        private string $orderBy = 'id',
        private ?string $codePrefix = null,
        private string $codeColumn = 'code',
        private array $autoDefaults = [],
        /** fn(int $id, array $savedRow, array $claims): void — fired once, right after create commits. */
        private $onCreated = null
    ) {
    }

    private function model(): SimpleCrudModel
    {
        return new SimpleCrudModel($this->pdo, $this->table, $this->columns, $this->orderBy);
    }

    private function resolveBranchId(array $claims): int
    {
        $homeBranch = $claims['branch_id'] ?? null;
        $canSwitch = in_array('branches.switch_context', (array) ($claims['permissions'] ?? []), true);

        if ($canSwitch && isset($_GET['branch_id'])) {
            return (int) $_GET['branch_id'];
        }

        if ($homeBranch === null) {
            Response::error('Your account has no home branch assigned', 422);
        }

        return (int) $homeBranch;
    }

    public function index(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $branchId = $this->resolveBranchId($claims);
        $where = ['branch_id' => $branchId];

        if ($this->table === 'expenses') {
            $sql = "SELECT e.*, ec.name AS category_name, u.name AS created_by_name
                    FROM expenses e
                    LEFT JOIN expense_categories ec ON ec.id = e.category_id
                    LEFT JOIN users u ON u.id = e.created_by
                    WHERE e.branch_id = :branch_id
                    ORDER BY e.id DESC";
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute(['branch_id' => $branchId]);
            Response::json($stmt->fetchAll());
            return;
        }

        if (isset($_GET['page'])) {
            $page = max(1, (int) $_GET['page']);
            $limit = max(1, min(100, (int) ($_GET['limit'] ?? 10)));
            $search = isset($_GET['search']) && trim((string) $_GET['search']) !== '' ? trim((string) $_GET['search']) : null;
            $status = isset($_GET['status']) && in_array($_GET['status'], ['active', 'inactive'], true) ? $_GET['status'] : null;

            if ($status !== null && in_array('status', $this->columns, true)) {
                $where['status'] = $status;
            }

            $searchColumns = [];
            foreach (['ledger_name', 'name', 'phone', 'gstin', 'expense_no', 'description', 'receipt_no', 'payment_mode'] as $candidate) {
                if (in_array($candidate, $this->columns, true)) {
                    $searchColumns[] = $candidate;
                }
            }

            Response::json($this->model()->paginate($where, $page, $limit, $search, $searchColumns));
            return;
        }

        Response::json($this->model()->all($where));
    }


    public function show(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $row = $this->findScoped($claims, (int) $id);
        Response::json($row);
    }

    /**
     * Phone/pincode/GSTIN format checks, applied only to whichever of
     * these columns this entity's table actually has — same validator the
     * staff and item forms use, so customers/suppliers/routes never need
     * their own copy. Normalizes in place (trim, GSTIN uppercased) so the
     * value that gets saved is the cleaned one, not raw user input.
     */
    private function validateCommonFields(array &$data): void
    {
        if (array_key_exists('phone', $data) && $data['phone'] !== null) {
            $data['phone'] = trim((string) $data['phone']);
            if (!Validator::isValidPhone($data['phone'])) {
                Response::error('Phone number must be a valid 10-digit Indian mobile number', 422);
            }
        }
        if (array_key_exists('pincode', $data) && $data['pincode'] !== null) {
            $data['pincode'] = trim((string) $data['pincode']);
            if (!Validator::isValidPincode($data['pincode'])) {
                Response::error('Pincode must be exactly 6 digits', 422);
            }
        }
        if (array_key_exists('gstin', $data) && $data['gstin'] !== null) {
            $data['gstin'] = strtoupper(trim((string) $data['gstin']));
            if (!Validator::isValidGstin($data['gstin'])) {
                Response::error('GSTIN format is invalid — expected 15 characters, e.g. 27AAPFU0939F1ZV', 422);
            }
        }
    }

    private function validateEntityData(array &$data, bool $isUpdate = false): void
    {
        if ($this->table === 'customers') {
            if (isset($data['name']) && !isset($data['ledger_name'])) {
                $data['ledger_name'] = $data['name'];
            }
            if (!$isUpdate && empty(trim((string) ($data['ledger_name'] ?? '')))) {
                Response::error('Customer name is required', 422);
            }
            if ($isUpdate && array_key_exists('ledger_name', $data) && empty(trim((string) $data['ledger_name']))) {
                Response::error('Customer name cannot be empty', 422);
            }
            if (!empty($data['phone'])) {
                $phone = trim((string) $data['phone']);
                if (!Validator::isValidPhone($phone)) {
                    Response::error('Mobile number must be a valid 10-digit Indian mobile number', 422);
                }
            }
        } elseif ($this->table === 'suppliers') {
            if (!$isUpdate && empty(trim((string) ($data['name'] ?? '')))) {
                Response::error('Supplier name is required', 422);
            }
            if ($isUpdate && array_key_exists('name', $data) && empty(trim((string) $data['name']))) {
                Response::error('Supplier name cannot be empty', 422);
            }
            if (!empty($data['phone'])) {
                $phone = trim((string) $data['phone']);
                if (!Validator::isValidPhone($phone)) {
                    Response::error('Supplier mobile number must be a valid 10-digit Indian mobile number', 422);
                }
            }
        } elseif ($this->table === 'expenses') {
            if (isset($data['expense_category_id']) && !isset($data['category_id'])) {
                $data['category_id'] = (int) $data['expense_category_id'];
            }
            if (!$isUpdate && empty($data['category_id'])) {
                Response::error('Expense category is required', 422);
            }
            if ($isUpdate && array_key_exists('category_id', $data) && empty($data['category_id'])) {
                Response::error('Expense category cannot be empty', 422);
            }
            if (!$isUpdate && (!isset($data['amount']) || (float) $data['amount'] <= 0)) {
                Response::error('Expense amount must be greater than zero', 422);
            }
            if ($isUpdate && array_key_exists('amount', $data) && (float) $data['amount'] <= 0) {
                Response::error('Expense amount must be greater than zero', 422);
            }
        }
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, $this->managePermission);

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $this->validateCommonFields($data);
        $data['branch_id'] = $this->resolveBranchId($claims);
        foreach ($this->autoDefaults as $column => $default) {
            if (!isset($data[$column]) || $data[$column] === '') {
                $data[$column] = $default($claims);
            }
        }

        $this->validateEntityData($data, false);

        try {
            $id = $this->model()->create($data);

            if ($this->codePrefix !== null) {
                $this->model()->update($id, [$this->codeColumn => CodeGenerator::fromId($this->codePrefix, $id)]);
            }

            $saved = $this->model()->find($id);

            if ($this->onCreated !== null) {
                ($this->onCreated)($id, $saved, $claims);
            }

            Response::json($saved, 201);
        } catch (\PDOException $e) {
            $code = $e->errorInfo[1] ?? 0;
            if ($code === 1062) {
                Response::error('A record with this value already exists.', 422);
            } elseif ($code === 1452) {
                Response::error('Referenced related record does not exist.', 422);
            } else {
                Response::error('Failed to save record: ' . $e->getMessage(), 422);
            }
        }
    }

    public function update(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, $this->managePermission);

        $row = $this->findScoped($claims, (int) $id);
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        unset($data['branch_id']); // branch is fixed at creation, never reassigned via update
        $this->validateCommonFields($data);

        $this->validateEntityData($data, true);

        try {
            $this->model()->update((int) $row['id'], $data);
            Response::json($this->model()->find((int) $row['id']));
        } catch (\PDOException $e) {
            $code = $e->errorInfo[1] ?? 0;
            if ($code === 1062) {
                Response::error('A record with this value already exists.', 422);
            } elseif ($code === 1452) {
                Response::error('Referenced related record does not exist.', 422);
            } else {
                Response::error('Failed to update record: ' . $e->getMessage(), 422);
            }
        }
    }

    public function destroy(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, $this->managePermission);

        $row = $this->findScoped($claims, (int) $id);
        $this->model()->delete((int) $row['id']);
        Response::json(['deleted' => true]);
    }

    private function findScoped(array $claims, int $id): array
    {
        $branchId = $this->resolveBranchId($claims);
        $row = $this->model()->find($id);

        if (!$row || (int) $row['branch_id'] !== $branchId) {
            Response::error('Not found', 404);
        }

        return $row;
    }
}
