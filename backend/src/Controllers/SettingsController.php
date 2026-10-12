<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use PDO;

/** Settings (section 4.19): Company Profile, Thermal Printer Setup, Invoice Sequence Prefixes. */
class SettingsController
{
    public function __construct(private PDO $pdo)
    {
    }

    private function resolveBranchId(array $claims): int
    {
        $canSwitch = in_array('branches.switch_context', (array) ($claims['permissions'] ?? []), true);
        if ($canSwitch && isset($_GET['branch_id'])) {
            return (int) $_GET['branch_id'];
        }
        return (int) $claims['branch_id'];
    }

    // -------------------------------------------------------------
    // Company Profile — the branches row itself (section 3.1)
    // -------------------------------------------------------------

    public function branchProfile(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $branchId = $this->resolveBranchId($claims);

        $stmt = $this->pdo->prepare('SELECT * FROM branches WHERE id = :id');
        $stmt->execute(['id' => $branchId]);
        $branch = $stmt->fetch();
        if (!$branch) {
            Response::error('Not found', 404);
        }
        Response::json($branch);
    }

    public function updateBranchProfile(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'settings.manage');
        $branchId = $this->resolveBranchId($claims);

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $columns = [
            'branch_name', 'print_name', 'logo_path', 'gstin', 'pan_number', 'address_line1',
            'city', 'state', 'pincode', 'phone', 'support_email', 'status',
        ];
        $set = [];
        $params = ['id' => $branchId];
        foreach ($columns as $col) {
            if (array_key_exists($col, $body)) {
                $set[] = "$col = :$col";
                $params[$col] = $body[$col];
            }
        }
        if (!empty($set)) {
            $this->pdo->prepare('UPDATE branches SET ' . implode(', ', $set) . ' WHERE id = :id')->execute($params);
        }

        $this->branchProfile();
    }

    // -------------------------------------------------------------
    // Thermal Printer Setup — bank/UPI/terms + printer profile
    // -------------------------------------------------------------

    public function printSettings(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $branchId = $this->resolveBranchId($claims);

        $stmt = $this->pdo->prepare('SELECT * FROM branch_print_settings WHERE branch_id = :branch_id');
        $stmt->execute(['branch_id' => $branchId]);
        $settings = $stmt->fetch();

        if (!$settings) {
            // Sensible defaults until the branch admin saves their own.
            $settings = [
                'branch_id' => $branchId, 'printer_type' => 'a4', 'invoice_footer_note' => null,
                'default_print_copies' => 1, 'bank_account_no' => null, 'bank_name' => null,
                'upi_id' => null, 'terms_and_conditions' => null, 'show_upi_qr_on_thermal' => 0,
                'allow_local_free_qty' => 1, 'allow_distance_free_qty' => 0,
            ];
        } else {
            $settings['allow_local_free_qty'] = (int) ($settings['allow_local_free_qty'] ?? 1);
            $settings['allow_distance_free_qty'] = (int) ($settings['allow_distance_free_qty'] ?? 0);
        }
        Response::json($settings);
    }

    public function updatePrintSettings(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'settings.manage');
        $branchId = $this->resolveBranchId($claims);

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $columns = [
            'printer_type', 'invoice_footer_note', 'default_print_copies', 'bank_account_no',
            'bank_name', 'upi_id', 'terms_and_conditions', 'show_upi_qr_on_thermal',
            'allow_local_free_qty', 'allow_distance_free_qty',
        ];
        $defaults = [
            'printer_type' => 'a4', 'default_print_copies' => 1, 'show_upi_qr_on_thermal' => 0,
            'allow_local_free_qty' => 1, 'allow_distance_free_qty' => 0,
        ];

        // A partial body must not blank out fields it didn't mention — merge
        // onto whatever's already saved (or the same defaults printSettings() uses).
        $stmt = $this->pdo->prepare('SELECT * FROM branch_print_settings WHERE branch_id = :branch_id');
        $stmt->execute(['branch_id' => $branchId]);
        $existing = $stmt->fetch() ?: [];

        $data = ['branch_id' => $branchId];
        foreach ($columns as $col) {
            $data[$col] = $body[$col] ?? $existing[$col] ?? $defaults[$col] ?? null;
        }

        $placeholders = implode(', ', array_map(fn ($c) => ":$c", array_keys($data)));
        $updateClause = implode(', ', array_map(fn ($c) => "$c = VALUES($c)", array_keys(array_diff_key($data, ['branch_id' => true]))));

        $this->pdo->prepare(
            'INSERT INTO branch_print_settings (' . implode(', ', array_keys($data)) . ")
             VALUES ({$placeholders})
             ON DUPLICATE KEY UPDATE {$updateClause}"
        )->execute($data);

        $this->printSettings();
    }

    public function freeQtySettings(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $branchId = $this->resolveBranchId($claims);

        $stmt = $this->pdo->prepare('SELECT allow_local_free_qty, allow_distance_free_qty FROM branch_print_settings WHERE branch_id = :branch_id');
        $stmt->execute(['branch_id' => $branchId]);
        $row = $stmt->fetch();

        if (!$row) {
            $row = [
                'allow_local_free_qty' => 1,
                'allow_distance_free_qty' => 0,
            ];
        } else {
            $row['allow_local_free_qty'] = (int) ($row['allow_local_free_qty'] ?? 1);
            $row['allow_distance_free_qty'] = (int) ($row['allow_distance_free_qty'] ?? 0);
        }
        Response::json($row);
    }

    public function updateFreeQtySettings(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'settings.manage');
        $branchId = $this->resolveBranchId($claims);

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $local = isset($body['allow_local_free_qty']) ? (int) (bool) $body['allow_local_free_qty'] : 1;
        $distance = isset($body['allow_distance_free_qty']) ? (int) (bool) $body['allow_distance_free_qty'] : 0;

        $stmt = $this->pdo->prepare('SELECT * FROM branch_print_settings WHERE branch_id = :branch_id');
        $stmt->execute(['branch_id' => $branchId]);
        $existing = $stmt->fetch();

        if ($existing) {
            $this->pdo->prepare('UPDATE branch_print_settings SET allow_local_free_qty = :local, allow_distance_free_qty = :distance WHERE branch_id = :branch_id')
                ->execute(['local' => $local, 'distance' => $distance, 'branch_id' => $branchId]);
        } else {
            $this->pdo->prepare('INSERT INTO branch_print_settings (branch_id, allow_local_free_qty, allow_distance_free_qty) VALUES (:branch_id, :local, :distance)')
                ->execute(['branch_id' => $branchId, 'local' => $local, 'distance' => $distance]);
        }

        $this->freeQtySettings();
    }

    // -------------------------------------------------------------
    // Invoice Sequence Prefixes — only the prefix is editable; the
    // running current_number stays untouched so numbering never repeats.
    // -------------------------------------------------------------

    public function sequences(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $branchId = $this->resolveBranchId($claims);

        $stmt = $this->pdo->prepare('SELECT * FROM invoice_sequences WHERE branch_id = :branch_id ORDER BY series');
        $stmt->execute(['branch_id' => $branchId]);
        Response::json($stmt->fetchAll());
    }

    public function updateSequence(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'settings.manage');

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($body['prefix'])) {
            Response::error('prefix is required', 422);
        }

        $this->pdo->prepare('UPDATE invoice_sequences SET prefix = :prefix WHERE id = :id')
            ->execute(['prefix' => $body['prefix'], 'id' => $id]);

        $stmt = $this->pdo->prepare('SELECT * FROM invoice_sequences WHERE id = :id');
        $stmt->execute(['id' => $id]);
        Response::json($stmt->fetch());
    }

    public function posPopupSettings(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $branchId = $this->resolveBranchId($claims);
        $service = new \App\Services\PreviousWeekPriceService($this->pdo);
        Response::json($service->getSettings($branchId));
    }

    public function updatePosPopupSettings(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'settings.manage');
        $branchId = $this->resolveBranchId($claims);

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $enabled = isset($body['pos_prev_week_popup_enabled']) ? (int) (bool) $body['pos_prev_week_popup_enabled'] : 1;
        $rule = in_array(strtoupper($body['prev_week_price_rule'] ?? ''), ['AUTO', 'LATEST', 'AVERAGE', 'MOST_USED'], true)
            ? strtoupper($body['prev_week_price_rule'])
            : 'AUTO';
        $repeat = isset($body['prev_week_popup_on_repeat_add']) ? (int) (bool) $body['prev_week_popup_on_repeat_add'] : 0;

        $stmt = $this->pdo->prepare(
            'INSERT INTO pos_feature_settings (branch_id, pos_prev_week_popup_enabled, prev_week_price_rule, prev_week_popup_on_repeat_add)
             VALUES (:branch_id, :enabled, :rule, :repeat)
             ON DUPLICATE KEY UPDATE 
                pos_prev_week_popup_enabled = VALUES(pos_prev_week_popup_enabled),
                prev_week_price_rule = VALUES(prev_week_price_rule),
                prev_week_popup_on_repeat_add = VALUES(prev_week_popup_on_repeat_add)'
        );
        $stmt->execute([
            'branch_id' => $branchId,
            'enabled' => $enabled,
            'rule' => $rule,
            'repeat' => $repeat,
        ]);

        $this->posPopupSettings();
    }
}
