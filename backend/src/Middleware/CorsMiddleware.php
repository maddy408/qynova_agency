<?php

declare(strict_types=1);

namespace App\Middleware;

class CorsMiddleware
{
    public static function handle(): void
    {
        $config = require __DIR__ . '/../../config/config.php';
        $allowedOrigins = $config['cors']['origins'];
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

        // Allow localhost, 127.0.0.1, local LAN IPs, qynova.in domains, capacitor/ionic app origins in dev
        $isLocalDevOrigin = (bool) preg_match('#^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|.*\.qynova\.in)(:\d+)?$#', $origin)
            || preg_match('#^(capacitor|ionic|file)://#', $origin);

        if (empty($origin)) {
            header('Access-Control-Allow-Origin: *');
        } elseif ($isLocalDevOrigin || in_array($origin, $allowedOrigins, true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Vary: Origin');
        }

        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Branch-Id');

        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }
}
