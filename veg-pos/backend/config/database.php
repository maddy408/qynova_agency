<?php

declare(strict_types=1);

function get_pdo(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $config = require __DIR__ . '/config.php';
    $db = $config['db'];

    if ($db['host'] === 'localhost') {
        $dsn = sprintf('mysql:host=localhost;dbname=%s;charset=utf8mb4', $db['database']);
    } else {
        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $db['host'], $db['port'], $db['database']);
    }

    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
    if (defined('Pdo\\Mysql::ATTR_INIT_COMMAND')) {
        $options[\Pdo\Mysql::ATTR_INIT_COMMAND] = 'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci';
    } elseif (defined('PDO::MYSQL_ATTR_INIT_COMMAND')) {
        $options[PDO::MYSQL_ATTR_INIT_COMMAND] = 'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci';
    }

    $pdo = new PDO($dsn, $db['username'], $db['password'], $options);
    $pdo->exec('SET NAMES utf8mb4');

    return $pdo;
}
