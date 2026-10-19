<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\AuthMiddleware;
use PDO;

class HeldBillController
{
    public function __construct(private PDO $pdo)
    {
    }

    public function index(): void
    {
        AuthMiddleware::authenticate();
        $stmt = $this->pdo->query(
            'SELECT h.*, p.name AS party_name FROM held_bills h
             LEFT JOIN parties p ON p.id = h.party_id ORDER BY h.created_at DESC'
        );
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $row['cart'] = json_decode($row['cart_json'], true);
        }
        Response::json($rows);
    }

    public function store(): void
    {
        $claims = AuthMiddleware::authenticate();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $cartData = $body['cart'] ?? null;
        if ($cartData === null && isset($body['cart_json'])) {
            $cartData = is_string($body['cart_json']) ? json_decode($body['cart_json'], true) : $body['cart_json'];
        }

        if (!is_array($cartData) || empty($cartData['lines']) || !is_array($cartData['lines'])) {
            Response::error('Cannot hold an empty bill', 422);
        }

        $cartJson = json_encode($cartData, JSON_UNESCAPED_UNICODE);
        $locationType = $body['location_type'] ?? ($cartData['locationType'] ?? 'local');
        $billType = $body['bill_type'] ?? ($cartData['billType'] ?? 'normal');
        $partyId = $body['party_id'] ?? ($cartData['partyId'] ?? null);

        $stmt = $this->pdo->prepare(
            'INSERT INTO held_bills (label, cart_json, location_type, bill_type, party_id, created_by)
             VALUES (:label, :cart_json, :location_type, :bill_type, :party_id, :created_by)'
        );
        $stmt->execute([
            'label' => $body['label'] ?? null,
            'cart_json' => $cartJson,
            'location_type' => in_array($locationType, ['local', 'distant'], true) ? $locationType : 'local',
            'bill_type' => in_array($billType, ['normal', 'commission', 'quick'], true) ? $billType : 'normal',
            'party_id' => !empty($partyId) ? (int) $partyId : null,
            'created_by' => $claims['uid'],
        ]);

        Response::json(['id' => (int) $this->pdo->lastInsertId()], 201);
    }

    public function destroy(string $id): void
    {
        AuthMiddleware::authenticate();
        $this->pdo->prepare('DELETE FROM held_bills WHERE id = :id')->execute(['id' => $id]);
        Response::json(['ok' => true]);
    }
}
