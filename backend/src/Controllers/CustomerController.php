<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use PDO;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;

/**
 * Customer Excel import/export/template — additive to the existing plain
 * BranchScopedCrudController CRUD for /api/customers (create/edit/list/delete
 * are untouched); this only adds the bulk-file flow, mirroring
 * ItemController's import/export pattern (preview-then-commit, row-level
 * errors, never a partial/corrupt write).
 */
class CustomerController
{
    /**
     * Column order for both the import template and the export file. The
     * first ten match the reference format's exact business columns
     * (S.NO is display-only — it's the row's position, never stored or
     * read back); PRICING_TYPE is an addition at the end, same convention
     * ItemController uses for its own legacy-format-plus-additions columns.
     */
    private const EXCEL_COLUMNS = [
        's_no' => 'S.NO',
        'ledger_name' => 'CUSTOMER',
        'credit_limit' => 'CREDIT LIMIT',
        'opening_balance' => 'OPENING',
        'customer_group' => 'GROUP',
        'phone' => 'MOBILE',
        'city' => 'CITY',
        'gstin' => 'GST NO',
        'address' => 'ADDRESS',
        'doj' => 'DOJ (OPTIONAL)',
        'dob' => 'DOB (OPTIONAL)',
        'pricing_type' => 'PRICING TYPE',
    ];

    public function __construct(private PDO $pdo)
    {
    }

    private function resolveBranchId(array $claims): int
    {
        $canSwitch = in_array('branches.switch_context', (array) ($claims['permissions'] ?? []), true);
        if ($canSwitch && isset($_GET['branch_id'])) {
            return (int) $_GET['branch_id'];
        }
        return (int) ($claims['branch_id'] ?? 0);
    }

    // -------------------------------------------------------------
    // Export — current branch's customers
    // -------------------------------------------------------------
    public function exportExcel(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $branchId = $this->resolveBranchId($claims);

        $stmt = $this->pdo->prepare(
            'SELECT c.*, ci.name AS city_name
             FROM customers c
             LEFT JOIN cities ci ON ci.id = c.city_id
             WHERE c.branch_id = :branch_id
             ORDER BY c.ledger_name'
        );
        $stmt->execute(['branch_id' => $branchId]);
        $rows = $stmt->fetchAll();

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Customers');
        $sheet->fromArray(array_values(self::EXCEL_COLUMNS), null, 'A1');

        $rowIndex = 2;
        foreach ($rows as $i => $row) {
            $sheet->fromArray([
                $i + 1,
                $row['ledger_name'],
                (float) $row['credit_limit'],
                (float) $row['opening_balance'],
                $row['customer_group'],
                $row['phone'],
                $row['city_name'],
                $row['gstin'],
                $row['address'],
                $row['doj'],
                $row['dob'],
                $row['pricing_type'],
            ], null, "A{$rowIndex}");
            $rowIndex++;
        }

        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="customers_export.xlsx"');
        header('Cache-Control: max-age=0');

        $writer = IOFactory::createWriter($spreadsheet, 'Xlsx');
        $writer->save('php://output');
        exit;
    }

    /** GET /api/customers/import/template — a blank starter workbook with headers + sample rows. */
    public function importTemplate(): void
    {
        JwtAuthMiddleware::authenticate();

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Customers');
        $sheet->fromArray(array_values(self::EXCEL_COLUMNS), null, 'A1');
        $sheet->fromArray(
            [1, 'MURUGAN PETIKKADA', 0, 0, 'Sundry Debtors', '9383555480', 'THIPPANAMPATTI', '', 'ARIYAPPURAM', '01-04-2016', '01-04-2016', 'normal'],
            null,
            'A2'
        );
        // Second sample with empty DOB and DOJ, showing they are completely optional
        $sheet->fromArray(
            [2, 'VASAN MEDICAL', 0, 0, 'Wholesaler Shop', '9944395718', 'THIPPANAMPATTI', '', 'MAINROAD, AVUDAYANOOR', '', '', 'Wholesaler Shop'],
            null,
            'A3'
        );

        // MOBILE must import as text, not a number (leading zeros/precision) —
        // format the whole column as text so a spreadsheet app doesn't coerce it.
        $sheet->getStyle('F2:F1000')->getNumberFormat()->setFormatCode('@');

        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="customers_import_template.xlsx"');
        header('Cache-Control: max-age=0');

        $writer = IOFactory::createWriter($spreadsheet, 'Xlsx');
        $writer->save('php://output');
        exit;
    }

    public function importPreview(): void
    {
        $this->import(false);
    }

    public function importCommit(): void
    {
        $this->import(true);
    }

    /** Helper to load and normalize all pricing types from the database */
    private function getPricingTypesLookup(): array
    {
        $stmt = $this->pdo->query('SELECT id, name, code FROM pricing_types ORDER BY id ASC');
        $lookup = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $pt) {
            $codeKey = strtolower(trim($pt['code']));
            $nameKey = strtolower(trim(preg_replace('/\s+/', ' ', $pt['name'])));
            $lookup[$codeKey] = $pt;
            $lookup[$nameKey] = $pt;
        }
        return $lookup;
    }

    private function normalizePricingTypeCode(string $raw): string
    {
        $slug = strtolower(trim($raw));
        $slug = preg_replace('/[^a-z0-9]+/', '_', $slug);
        return trim($slug, '_');
    }

    private function normalizePricingTypeName(string $raw): string
    {
        return ucwords(strtolower(trim(preg_replace('/\s+/', ' ', $raw))));
    }

    private function import(bool $commit): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'parties.manage_customers');
        $branchId = $this->resolveBranchId($claims);

        if (empty($_FILES['file']['tmp_name'])) {
            Response::error('No file uploaded (expected multipart field "file")', 422);
        }

        $autoCreatePricing = true;
        if (isset($_POST['auto_create_pricing_types'])) {
            $val = $_POST['auto_create_pricing_types'];
            $autoCreatePricing = ($val === '1' || $val === 'true' || $val === 1 || $val === true);
        }

        $spreadsheet = IOFactory::load($_FILES['file']['tmp_name']);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray(null, true, true, false);

        $rawHeader = array_map(fn ($h) => trim((string) $h), array_shift($rows) ?? []);
        $header = array_map(fn ($h) => $this->normalizeHeader($h), $rawHeader);

        // Existing customers in THIS branch, keyed for dedup-on-reimport
        $existingByPhone = [];
        $existingByName = [];
        $stmt = $this->pdo->prepare('SELECT id, ledger_name, phone FROM customers WHERE branch_id = :b');
        $stmt->execute(['b' => $branchId]);
        foreach ($stmt->fetchAll() as $row) {
            if (!empty($row['phone'])) {
                $existingByPhone[$this->normalizePhone((string) $row['phone'])] = (int) $row['id'];
            }
            $existingByName[$this->normalizeName((string) $row['ledger_name'])] = (int) $row['id'];
        }

        $cityLookup = [];
        $cityStmt = $this->pdo->query('SELECT id, name FROM cities');
        foreach ($cityStmt->fetchAll() as $row) {
            $cityLookup[strtolower(trim((string) $row['name']))] = (int) $row['id'];
        }

        $groupLookup = [];
        $groupStmt = $this->pdo->query(
            "SELECT DISTINCT customer_group FROM customers WHERE customer_group IS NOT NULL AND customer_group <> ''"
        );
        foreach ($groupStmt->fetchAll() as $row) {
            $groupLookup[$this->normalizeName((string) $row['customer_group'])] = $row['customer_group'];
        }

        $pricingLookup = $this->getPricingTypesLookup();
        $newPricingTypesFound = []; // [ code => Display Name ]
        $missingDobCount = 0;
        $missingDojCount = 0;

        $results = [];
        $toUpsert = [];

        foreach ($rows as $rowNumber => $row) {
            if (empty(array_filter($row, fn ($v) => $v !== null && $v !== ''))) {
                continue; // skip completely blank rows
            }
            $record = array_combine($header, array_pad($row, count($header), null));

            // Track missing optional fields for reporting
            if (empty(trim((string) ($record['dob'] ?? '')))) {
                $missingDobCount++;
            }
            if (empty(trim((string) ($record['doj'] ?? '')))) {
                $missingDojCount++;
            }

            [$mapped, $rowErrors] = $this->mapImportRow(
                $record,
                $existingByPhone,
                $existingByName,
                $cityLookup,
                $groupLookup,
                $pricingLookup,
                $newPricingTypesFound,
                $autoCreatePricing,
                $commit
            );

            $results[] = [
                'row' => $rowNumber + 2,
                'customer' => $record['ledger_name'] ?? null,
                'errors' => $rowErrors,
            ];

            if (empty($rowErrors)) {
                $toUpsert[] = $mapped;
            }
        }

        $inserted = 0;
        $updated = 0;

        if ($commit) {
            $this->pdo->beginTransaction();
            try {
                // If auto-create pricing types is enabled, ensure all new pricing types exist in pricing_types table
                if ($autoCreatePricing && !empty($newPricingTypesFound)) {
                    $insertPt = $this->pdo->prepare(
                        'INSERT IGNORE INTO pricing_types (name, code, is_default) VALUES (:name, :code, 0)'
                    );
                    foreach ($newPricingTypesFound as $ptCode => $ptName) {
                        $insertPt->execute(['name' => $ptName, 'code' => $ptCode]);
                    }
                }

                foreach ($toUpsert as $mapped) {
                    ['data' => $data, 'existing_id' => $existingId] = $mapped;
                    $data['branch_id'] = $branchId;
                    if ($existingId !== null) {
                        $set = implode(',', array_map(fn ($c) => "$c = :$c", array_keys($data)));
                        $this->pdo->prepare("UPDATE customers SET {$set} WHERE id = :id")
                            ->execute([...$data, 'id' => $existingId]);
                        $updated++;
                    } else {
                        $cols = array_keys($data);
                        $placeholders = array_map(fn ($c) => ":$c", $cols);
                        $this->pdo->prepare('INSERT INTO customers (' . implode(',', $cols) . ') VALUES (' . implode(',', $placeholders) . ')')
                            ->execute($data);
                        $inserted++;
                    }
                }
                $this->pdo->commit();
            } catch (\Throwable $e) {
                $this->pdo->rollBack();
                Response::error('Failed to commit import: ' . $e->getMessage(), 500);
            }
        }

        // Get unique existing pricing type names
        $existingPricingNames = [];
        foreach ($pricingLookup as $item) {
            $existingPricingNames[$item['name']] = $item['name'];
        }

        Response::json([
            'total_rows' => count($results),
            'valid_rows' => count($toUpsert),
            'invalid_rows' => count($results) - count($toUpsert),
            'inserted' => $commit ? $inserted : 0,
            'updated' => $commit ? $updated : 0,
            'committed' => $commit,
            'existing_pricing_types' => array_values($existingPricingNames),
            'new_pricing_types' => array_values($newPricingTypesFound),
            'missing_optional_dob_count' => $missingDobCount,
            'missing_optional_doj_count' => $missingDojCount,
            'rows' => $results,
        ]);
    }

    /** Accepts either the required Excel label (CUSTOMER, GST NO, ...) or the internal key spelling. */
    private function normalizeHeader(string $rawHeader): string
    {
        $normalized = strtolower(trim($rawHeader));
        if (str_contains($normalized, 'dob') || str_contains($normalized, 'birth')) {
            return 'dob';
        }
        if (str_contains($normalized, 'doj') || str_contains($normalized, 'joining')) {
            return 'doj';
        }
        if (str_contains($normalized, 'pricing') || str_contains($normalized, 'price_type')) {
            return 'pricing_type';
        }
        if (str_contains($normalized, 'customer') || str_contains($normalized, 'ledger')) {
            return 'ledger_name';
        }
        if (str_contains($normalized, 'mobile') || str_contains($normalized, 'phone')) {
            return 'phone';
        }
        if (str_contains($normalized, 'credit')) {
            return 'credit_limit';
        }
        if (str_contains($normalized, 'open')) {
            return 'opening_balance';
        }
        if (str_contains($normalized, 'group')) {
            return 'customer_group';
        }
        if (str_contains($normalized, 'gst')) {
            return 'gstin';
        }
        if (str_contains($normalized, 'address')) {
            return 'address';
        }
        if (str_contains($normalized, 'city')) {
            return 'city';
        }

        static $reverse = null;
        if ($reverse === null) {
            $reverse = [];
            foreach (self::EXCEL_COLUMNS as $key => $label) {
                $reverse[strtolower($key)] = $key;
                $reverse[strtolower($label)] = $key;
            }
        }
        return $reverse[$normalized] ?? $rawHeader;
    }

    /** @return array{0: array{data: array, existing_id: int|null}, 1: string[]} */
    private function mapImportRow(
        array $record,
        array &$existingByPhone,
        array &$existingByName,
        array &$cityLookup,
        array &$groupLookup,
        array &$pricingLookup,
        array &$newPricingTypesFound,
        bool $autoCreatePricing,
        bool $commit
    ): array {
        $errors = [];

        $ledgerName = trim((string) ($record['ledger_name'] ?? ''));
        if ($ledgerName === '') {
            $errors[] = 'CUSTOMER (name) is required';
        }

        // MOBILE: read as text so a leading zero survives
        $phoneRaw = $record['phone'] ?? '';
        $phone = is_float($phoneRaw) ? number_format($phoneRaw, 0, '', '') : trim((string) $phoneRaw);
        if ($phone !== '' && !preg_match('/^[0-9+\-\s()]{6,20}$/', $phone)) {
            $errors[] = "invalid mobile number '{$phone}'";
        }

        $existingId = null;
        if ($phone !== '' && isset($existingByPhone[$this->normalizePhone($phone)])) {
            $existingId = $existingByPhone[$this->normalizePhone($phone)];
        } elseif ($ledgerName !== '' && isset($existingByName[$this->normalizeName($ledgerName)])) {
            $existingId = $existingByName[$this->normalizeName($ledgerName)];
        }

        foreach (['credit_limit', 'opening_balance'] as $numField) {
            if (isset($record[$numField]) && $record[$numField] !== '' && !is_numeric($record[$numField])) {
                $errors[] = "{$numField} must be numeric";
            }
        }
        $creditLimit = isset($record['credit_limit']) && $record['credit_limit'] !== '' ? (float) $record['credit_limit'] : 0.0;
        $openingBalance = isset($record['opening_balance']) && $record['opening_balance'] !== '' ? (float) $record['opening_balance'] : 0.0;

        $gstinRaw = trim((string) ($record['gstin'] ?? ''));
        $gstin = in_array(strtoupper($gstinRaw), ['', '0', 'NA', 'N/A', '-', 'NIL'], true) ? null : $gstinRaw;
        if ($gstin !== null && !preg_match('/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/', strtoupper($gstin))) {
            $errors[] = "invalid GSTIN format '{$gstin}'";
        }

        $cityName = trim((string) ($record['city'] ?? ''));
        $cityId = $cityName !== '' ? ($cityLookup[strtolower($cityName)] ?? null) : null;

        $groupRaw = trim((string) ($record['customer_group'] ?? ''));
        $group = null;
        if ($groupRaw !== '') {
            $normalized = $this->normalizeName($groupRaw);
            $group = $groupLookup[$normalized] ?? $groupRaw;
            $groupLookup[$normalized] = $group;
        }

        // DOB & DOJ ARE COMPLETELY OPTIONAL
        // Missing or blank date never causes an error, it simply saves as null.
        $doj = $this->parseExcelDate($record['doj'] ?? null);
        $dob = $this->parseExcelDate($record['dob'] ?? null);

        // DYNAMIC PRICING TYPE MANAGEMENT
        $rawPricing = trim((string) ($record['pricing_type'] ?? ''));
        if ($rawPricing === '') {
            $pricingType = 'normal';
        } else {
            $lookupKey = strtolower(preg_replace('/\s+/', ' ', $rawPricing));
            $codeKey = $this->normalizePricingTypeCode($rawPricing);

            if (isset($pricingLookup[$lookupKey])) {
                $pricingType = $pricingLookup[$lookupKey]['code'];
            } elseif (isset($pricingLookup[$codeKey])) {
                $pricingType = $pricingLookup[$codeKey]['code'];
            } else {
                // New pricing type encountered
                $displayName = $this->normalizePricingTypeName($rawPricing);
                $newPricingTypesFound[$codeKey] = $displayName;

                if ($commit && !$autoCreatePricing) {
                    $errors[] = "Pricing type '{$rawPricing}' does not exist and auto-create is disabled.";
                    $pricingType = 'normal';
                } else {
                    $pricingType = $codeKey;
                }
            }
        }

        $data = [
            'ledger_name' => $ledgerName,
            'phone' => $phone !== '' ? $phone : null,
            'credit_limit' => $creditLimit,
            'opening_balance' => $openingBalance,
            'customer_group' => $group,
            'city_id' => $cityId,
            'gstin' => $gstin,
            'address' => ($record['address'] ?? '') !== '' ? trim((string) $record['address']) : null,
            'doj' => $doj,
            'dob' => $dob,
            'pricing_type' => $pricingType,
        ];

        return [['data' => $data, 'existing_id' => $existingId], $errors];
    }

    private function normalizePhone(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone) ?? '';
    }

    private function normalizeName(string $name): string
    {
        return strtolower(preg_replace('/\s+/', ' ', trim($name)));
    }

    /**
     * Robust Excel & text date parser:
     * Handles Excel numeric serial dates, D/M/Y, M/D/Y, single-digit day/month (4/1/2016, 9/1/2017),
     * Y-m-d, textual dates, and fallbacks.
     * If blank/missing, returns null without any error.
     */
    private function parseExcelDate(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_numeric($value)) {
            try {
                $dt = ExcelDate::excelToDateTimeObject((float) $value);
                return $dt->format('Y-m-d');
            } catch (\Throwable) {
                return null;
            }
        }
        $text = trim((string) $value);
        if ($text === '' || in_array(strtolower($text), ['null', 'nil', 'na', 'n/a', '-', '0', '00-00-0000', '0000-00-00'], true)) {
            return null;
        }

        $formats = [
            'Y-m-d', 'Y/m/d', 'Y.m.d',
            'd-m-Y', 'd/m/Y', 'd.m.Y',
            'm-d-Y', 'm/d/Y', 'm.d.Y',
            'j-n-Y', 'j/n/Y', 'j.n.Y',
            'n-j-Y', 'n/j/Y', 'n.j.Y',
            'd-m-y', 'd/m/y', 'd.m.y',
            'j-n-y', 'j/n/y', 'j.n.y',
            'm-d-y', 'm/d/y', 'm.d.y',
            'n-j-y', 'n/j/y', 'n.j.y',
            'd M Y', 'd-M-Y', 'd/M/Y',
            'd F Y', 'd-F-Y', 'd/F/Y',
            'M d, Y', 'F d, Y',
        ];
        foreach ($formats as $format) {
            $dt = \DateTime::createFromFormat($format, $text);
            if ($dt !== false) {
                return $dt->format('Y-m-d');
            }
        }

        // Handle slash or dash or dot formats like 4/1/2016 or 04/01/2016
        if (preg_match('/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/', $text, $m)) {
            $p1 = (int) $m[1];
            $p2 = (int) $m[2];
            $year = (int) $m[3];
            if ($year < 100) {
                $year += ($year > 50 ? 1900 : 2000);
            }
            // If p1 > 12, it must be day-month-year
            if ($p1 > 12 && $p2 <= 12 && checkdate($p2, $p1, $year)) {
                return sprintf('%04d-%02d-%02d', $year, $p2, $p1);
            }
            // If p2 > 12, it must be month-day-year
            if ($p2 > 12 && $p1 <= 12 && checkdate($p1, $p2, $year)) {
                return sprintf('%04d-%02d-%02d', $year, $p1, $p2);
            }
            // Default Indian convention: Day / Month / Year
            if (checkdate($p2, $p1, $year)) {
                return sprintf('%04d-%02d-%02d', $year, $p2, $p1);
            }
            // Fallback Month / Day / Year
            if (checkdate($p1, $p2, $year)) {
                return sprintf('%04d-%02d-%02d', $year, $p1, $p2);
            }
        }

        $ts = strtotime($text);
        if ($ts !== false && $ts > 0) {
            return date('Y-m-d', $ts);
        }

        return null;
    }
}
