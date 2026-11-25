<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use PDO;

class PricingTypeController
{
    public function __construct(private PDO $pdo)
    {
    }

    /** GET /api/pricing-types */
    public function index(): void
    {
        JwtAuthMiddleware::authenticate();
        $stmt = $this->pdo->query('SELECT id, name, code, is_default, created_at FROM pricing_types ORDER BY id ASC');
        Response::json($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    /** POST /api/pricing-types */
    public function store(): void
    {
        JwtAuthMiddleware::authenticate();
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $name = trim((string) ($input['name'] ?? ''));
        if ($name === '') {
            Response::error('Pricing type name is required.', 422);
        }

        $code = strtolower(trim(preg_replace('/[^a-zA-Z0-9]+/', '_', $name), '_'));
        if ($code === '') {
            Response::error('Invalid pricing type name.', 422);
        }

        // Check if already exists case-insensitively
        $stmt = $this->pdo->prepare('SELECT id, name, code, is_default FROM pricing_types WHERE code = :code OR LOWER(name) = :lower_name');
        $stmt->execute(['code' => $code, 'lower_name' => strtolower($name)]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($existing) {
            Response::json($existing);
            return;
        }

        $displayName = ucwords(strtolower(preg_replace('/\s+/', ' ', $name)));
        $insert = $this->pdo->prepare('INSERT INTO pricing_types (name, code, is_default) VALUES (:name, :code, 0)');
        $insert->execute(['name' => $displayName, 'code' => $code]);
        $id = (int) $this->pdo->lastInsertId();

        Response::json([
            'id' => $id,
            'name' => $displayName,
            'code' => $code,
            'is_default' => 0,
        ], 201);
    }
}
