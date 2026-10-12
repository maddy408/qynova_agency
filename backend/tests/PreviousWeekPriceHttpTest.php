<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use App\Helpers\JwtHelper;

echo "============================================================\n";
echo "HTTP ENDPOINT & AUTHENTICATION TESTS (PORT 8080)\n";
echo "============================================================\n\n";

// Generate test tokens using application's JWT secret
$cashierToken = JwtHelper::issue([
    'sub' => 1,
    'role' => 'cashier',
    'branch_id' => 1,
    'permissions' => ['pos.access'],
]);

$customerToken = JwtHelper::issue([
    'sub' => 99,
    'role' => 'customer',
    'branch_id' => 1,
    'permissions' => [],
]);

$adminToken = JwtHelper::issue([
    'sub' => 1,
    'role' => 'admin',
    'branch_id' => 1,
    'permissions' => ['*'],
]);

function makeRequest(string $path, ?string $token = null): array {
    $url = 'http://127.0.0.1:8080' . $path;
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $headers = ['Content-Type: application/json'];
    if ($token) {
        $headers[] = 'Authorization: Bearer ' . $token;
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    return [
        'status' => $status,
        'body' => json_decode((string) $body, true) ?? $body,
    ];
}

$httpPass = 0;
$httpFail = 0;

function assertHttp(string $name, bool $cond, ?string $detail = null): void {
    global $httpPass, $httpFail;
    if ($cond) {
        $httpPass++;
        echo " [PASS] $name\n";
    } else {
        $httpFail++;
        echo " [FAIL] $name" . ($detail ? " ($detail)" : "") . "\n";
    }
}

// 1. Unauthenticated request (no token) -> 401
$resNoAuth = makeRequest('/api/items/1/previous-week-price');
assertHttp('HTTP 1: No token returns 401 Unauthorized', $resNoAuth['status'] === 401, 'Status: ' . $resNoAuth['status']);

// 2. Customer token -> 403 Forbidden
$resCustomer = makeRequest('/api/items/1/previous-week-price', $customerToken);
assertHttp('HTTP 2: Customer role token returns 403 Forbidden', $resCustomer['status'] === 403, 'Status: ' . $resCustomer['status']);

// 3. Unknown product id -> 404 Not Found
$resNotFound = makeRequest('/api/items/999999/previous-week-price', $cashierToken);
assertHttp('HTTP 3: Non-existent product ID returns 404 Not Found', $resNotFound['status'] === 404, 'Status: ' . $resNotFound['status']);

// 4. Alternate POS route: /api/pos/products/{id}/previous-week-price
$resPosRoute = makeRequest('/api/pos/products/999999/previous-week-price', $cashierToken);
assertHttp('HTTP 4: /api/pos/products/{id}/previous-week-price route reached and authorized', $resPosRoute['status'] === 404);

// 5. Settings endpoint: GET /api/settings/pos-popup
$resSettings = makeRequest('/api/settings/pos-popup', $cashierToken);
assertHttp('HTTP 5: GET /api/settings/pos-popup returns 200', $resSettings['status'] === 200, 'Status: ' . $resSettings['status']);
assertHttp('HTTP 5: pos_prev_week_popup_enabled is present', isset($resSettings['body']['pos_prev_week_popup_enabled']));

echo "\n============================================================\n";
echo "HTTP TEST RESULTS: PASS: $httpPass | FAIL: $httpFail\n";
echo "============================================================\n";
