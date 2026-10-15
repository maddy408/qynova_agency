<?php

declare(strict_types=1);

namespace App\Models;

use PDO;

/**
 * Generic CRUD for simple lookup-style tables (categories, brands, routes,
 * cities, tax_codes, stock_units, suppliers, ...). $columns whitelists which
 * fields a caller may write — never accept arbitrary column names from input.
 */
class SimpleCrudModel
{
    public function __construct(
        private PDO $pdo,
        private string $table,
        private array $columns,
        private string $orderBy = 'id'
    ) {
    }

    public function all(array $where = []): array
    {
        [$clause, $params] = $this->buildWhere($where);
        $stmt = $this->pdo->prepare("SELECT * FROM {$this->table} {$clause} ORDER BY {$this->orderBy}");
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function paginate(
        array $where = [],
        int $page = 1,
        int $limit = 10,
        ?string $search = null,
        array $searchColumns = []
    ): array {
        $page = max(1, $page);
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        [$clause, $params] = $this->buildWhere($where);

        if ($search !== null && trim($search) !== '' && !empty($searchColumns)) {
            $searchClauses = [];
            foreach ($searchColumns as $idx => $col) {
                $paramName = "search_{$idx}";
                $searchClauses[] = "{$col} LIKE :{$paramName}";
                $params[$paramName] = '%' . trim($search) . '%';
            }
            $searchSql = '(' . implode(' OR ', $searchClauses) . ')';
            $clause = $clause ? ($clause . ' AND ' . $searchSql) : ('WHERE ' . $searchSql);
        }

        // Count total matching records
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM {$this->table} {$clause}");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        // Fetch page slice
        $sql = "SELECT * FROM {$this->table} {$clause} ORDER BY {$this->orderBy} LIMIT :limit OFFSET :offset";
        $stmt = $this->pdo->prepare($sql);
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
        $stmt = $this->pdo->prepare("SELECT * FROM {$this->table} WHERE id = :id LIMIT 1");
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public function create(array $data): int
    {
        $data = array_intersect_key($data, array_flip($this->columns));
        $cols = array_keys($data);
        $placeholders = array_map(fn ($c) => ":$c", $cols);

        $stmt = $this->pdo->prepare(
            "INSERT INTO {$this->table} (" . implode(',', $cols) . ")
             VALUES (" . implode(',', $placeholders) . ")"
        );
        $stmt->execute($data);

        return (int) $this->pdo->lastInsertId();
    }

    public function update(int $id, array $data): void
    {
        $data = array_intersect_key($data, array_flip($this->columns));
        if (empty($data)) {
            return;
        }
        $set = implode(',', array_map(fn ($c) => "$c = :$c", array_keys($data)));

        $stmt = $this->pdo->prepare("UPDATE {$this->table} SET {$set} WHERE id = :id");
        $stmt->execute([...$data, 'id' => $id]);
    }

    public function delete(int $id): void
    {
        $stmt = $this->pdo->prepare("DELETE FROM {$this->table} WHERE id = :id");
        $stmt->execute(['id' => $id]);
    }

    private function buildWhere(array $where): array
    {
        if (empty($where)) {
            return ['', []];
        }
        $clauses = [];
        $params = [];
        foreach ($where as $col => $value) {
            $clauses[] = "$col = :$col";
            $params[$col] = $value;
        }
        return ['WHERE ' . implode(' AND ', $clauses), $params];
    }
}
