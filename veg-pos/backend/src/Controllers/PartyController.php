<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\AuthMiddleware;
use App\Services\LedgerService;
use PDO;

class PartyController
{
    public function __construct(private PDO $pdo)
    {
    }

    public function index(): void
    {
        AuthMiddleware::authenticate();
        $q = trim((string) ($_GET['q'] ?? ''));
        $type = trim((string) ($_GET['type'] ?? ''));

        $where = 'WHERE p.active = 1';
        $params = [];
        if ($q !== '') {
            $where .= ' AND (p.name LIKE :q1 OR p.phone LIKE :q2 OR p.place LIKE :q3)';
            $params['q1'] = "%{$q}%";
            $params['q2'] = "%{$q}%";
            $params['q3'] = "%{$q}%";
        }
        if ($type !== '') {
            $where .= ' AND (p.type = :type OR p.type = \'both\')';
            $params['type'] = $type;
        }

        $page = isset($_GET['page']) ? max(1, (int) $_GET['page']) : null;
        $limit = isset($_GET['limit']) ? max(1, (int) $_GET['limit']) : 10;

        if ($page !== null) {
            $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM parties p {$where}");
            $countStmt->execute($params);
            $total = (int) $countStmt->fetchColumn();

            $offset = ($page - 1) * $limit;
            $sql = "SELECT p.*, COALESCE((SELECT SUM(amount) FROM ledger_entries l WHERE l.party_id = p.id), 0) AS balance
                    FROM parties p {$where} ORDER BY p.name ASC LIMIT {$limit} OFFSET {$offset}";
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll();

            Response::json([
                'data' => $rows,
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'total_pages' => (int) ceil($total / $limit),
            ]);
        }

        $sql = "SELECT p.*, COALESCE((SELECT SUM(amount) FROM ledger_entries l WHERE l.party_id = p.id), 0) AS balance
                FROM parties p {$where} ORDER BY p.name ASC";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        Response::json($stmt->fetchAll());
    }

    public function show(string $id): void
    {
        AuthMiddleware::authenticate();
        $stmt = $this->pdo->prepare('SELECT * FROM parties WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $party = $stmt->fetch();
        if (!$party) {
            Response::error('Party not found', 404);
        }
        $party['balance'] = LedgerService::currentBalance($this->pdo, (int) $id);
        Response::json($party);
    }

    public function store(): void
    {
        AuthMiddleware::authenticate();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $this->validate($body);

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare(
                'INSERT INTO parties (name, phone, place, type, opening_balance, active)
                 VALUES (:name, :phone, :place, :type, :opening_balance, 1)'
            );
            $openingBalance = (float) ($body['opening_balance'] ?? 0);
            $stmt->execute([
                'name' => $body['name'],
                'phone' => $body['phone'] ?? null,
                'place' => $body['place'] ?? null,
                'type' => $body['type'] ?? 'customer',
                'opening_balance' => $openingBalance,
            ]);
            $id = (int) $this->pdo->lastInsertId();

            if (abs($openingBalance) > 0.0001) {
                LedgerService::post($this->pdo, $id, date('Y-m-d'), 'opening', $id, $openingBalance, 'Opening balance');
            }

            $this->pdo->commit();
            Response::json(['id' => $id], 201);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Failed to create party: ' . $e->getMessage(), 500);
        }
    }

    public function update(string $id): void
    {
        AuthMiddleware::authenticate();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $this->validate($body);

        $stmt = $this->pdo->prepare(
            'UPDATE parties SET name = :name, phone = :phone, place = :place, type = :type WHERE id = :id'
        );
        $stmt->execute([
            'id' => $id,
            'name' => $body['name'],
            'phone' => $body['phone'] ?? null,
            'place' => $body['place'] ?? null,
            'type' => $body['type'] ?? 'customer',
        ]);

        Response::json(['ok' => true]);
    }

    public function destroy(string $id): void
    {
        $claims = AuthMiddleware::authenticate();
        AuthMiddleware::requireRole($claims, ['admin', 'manager']);
        $this->pdo->prepare('UPDATE parties SET active = 0 WHERE id = :id')->execute(['id' => $id]);
        Response::json(['ok' => true]);
    }

    public function ledger(string $id): void
    {
        AuthMiddleware::authenticate();
        $from = $_GET['from'] ?? null;
        $to = $_GET['to'] ?? null;

        $stmt = $this->pdo->prepare('SELECT * FROM parties WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $party = $stmt->fetch();
        if (!$party) {
            Response::error('Party not found', 404);
        }

        $sql = 'SELECT * FROM ledger_entries WHERE party_id = :id';
        $params = ['id' => $id];
        if ($from) {
            $sql .= ' AND entry_date >= :from';
            $params['from'] = $from;
        }
        if ($to) {
            $sql .= ' AND entry_date <= :to';
            $params['to'] = $to;
        }
        $sql .= ' ORDER BY entry_date ASC, id ASC';

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $entries = $stmt->fetchAll();

        $running = 0.0;
        foreach ($entries as &$e) {
            $running += (float) $e['amount'];
            $e['running_balance'] = round($running, 2);
        }

        Response::json([
            'party' => $party,
            'entries' => $entries,
            'current_balance' => LedgerService::currentBalance($this->pdo, (int) $id),
        ]);
    }

    /**
     * Unpaid/partially paid bills or purchases for this party, used by the
     * payment screen's auto-allocate (oldest first) and manual tick lists.
     */
    public function unpaidDocuments(string $id): void
    {
        AuthMiddleware::authenticate();

        $bills = $this->pdo->prepare(
            "SELECT id, bill_no AS doc_no, bill_date AS doc_date, 'bill' AS doc_type,
                    CASE WHEN bill_type = 'commission' THEN grand_total ELSE grand_total END AS total,
                    paid_amount, balance_due
             FROM bills WHERE party_id = :id AND status = 'active' AND balance_due > 0.009
             ORDER BY bill_date ASC, id ASC"
        );
        $bills->execute(['id' => $id]);

        $purchases = $this->pdo->prepare(
            "SELECT id, purchase_no AS doc_no, purchase_date AS doc_date, 'purchase' AS doc_type,
                    total, paid_amount, balance_due
             FROM purchases WHERE party_id = :id AND status = 'active' AND balance_due > 0.009
             ORDER BY purchase_date ASC, id ASC"
        );
        $purchases->execute(['id' => $id]);

        Response::json([
            'bills' => $bills->fetchAll(),
            'purchases' => $purchases->fetchAll(),
        ]);
    }

    /**
     * @param array<string, mixed> $body
     */
    private function validate(array $body): void
    {
        if (trim((string) ($body['name'] ?? '')) === '') {
            Response::error('Party name is required', 422);
        }
    }
}
