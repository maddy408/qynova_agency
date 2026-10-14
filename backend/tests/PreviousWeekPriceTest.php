<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use App\Services\PreviousWeekPriceService;

// Ensure test database connection ONLY
$pdo = new PDO('mysql:host=127.0.0.1;port=3306;dbname=pos_system_test;charset=utf8mb4', 'root', 'Mysql@1234', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

echo "============================================================\n";
echo "PREVIOUS WEEK & LAST SELLING PRICE TEST SUITE (ON pos_system_test)\n";
echo "============================================================\n\n";

$passCount = 0;
$failCount = 0;

function assertTest(string $name, bool $condition, ?string $detail = null): void {
    global $passCount, $failCount;
    if ($condition) {
        $passCount++;
        echo " [PASS] $name\n";
    } else {
        $failCount++;
        echo " [FAIL] $name" . ($detail ? " ($detail)" : "") . "\n";
    }
}

// -------------------------------------------------------------
// Setup Seed Items for Testing
// -------------------------------------------------------------
$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
$pdo->exec('TRUNCATE TABLE invoice_items');
$pdo->exec('TRUNCATE TABLE invoices');
$pdo->exec('TRUNCATE TABLE items');
$pdo->exec('TRUNCATE TABLE pos_feature_settings');
$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

// Insert base stock units
$pdo->exec("INSERT IGNORE INTO stock_units (id, name, short_code, is_decimal) VALUES (1, 'Piece', 'PCS', 0), (2, 'Box', 'BOX', 0), (3, 'Kilogram', 'KG', 1)");

// Insert secondary branch for branch isolation testing
$pdo->exec("INSERT IGNORE INTO branches (id, company_id, branch_name, print_name, address_line1, city, state, is_main_branch, status)
            VALUES (2, 1, 'Branch 2', 'Branch 2 Print', 'Address 2', 'City 2', 'State 2', 0, 'active')");

// Insert Products:
// 1: Mango (Sold last week and earlier)
// 2: Mango Juice (Multiple prices last week)
// 3: Fresh Apples (Never sold)
// 4: Juice Bottle (Boundary tests)
// 5: Wholesale Item (Tiers & status filtering)
// 6: Pineapple (Sold only 3 weeks ago)
// 7: Guava (Two bills on same date)
// 8: Papaya (Multiple lines in same bill with different rates)
// 9: Watermelon (Cancelled/held/returned/deleted/other branch/other unit excluded)
$pdo->prepare(
    "INSERT INTO items (id, item_code, item_name, base_unit_id, secondary_unit_id, conversion_factor, retail_price, wholesale_price, mrp, net_srate, retail_selling_price, wholesale_selling_price, is_active)
     VALUES 
     (1, 'MNG01', 'Mango', 1, 2, 10.000, 85.00, 75.00, 100.00, 85.00, NULL, NULL, 1),
     (2, 'MNG02', 'Mango Juice', 1, NULL, NULL, 50.00, 45.00, 60.00, 50.00, NULL, NULL, 1),
     (3, 'APL01', 'Fresh Apples', 3, NULL, NULL, 120.00, 110.00, 150.00, 120.00, NULL, NULL, 1),
     (4, 'JUC01', 'Juice Bottle', 1, NULL, NULL, 82.50, 80.00, 95.00, 82.50, NULL, NULL, 1),
     (5, 'WHL01', 'Wholesale Item', 1, NULL, NULL, 100.00, 90.00, 120.00, 100.00, 95.00, 85.00, 1),
     (6, 'PIN01', 'Pineapple', 1, NULL, NULL, 70.00, 65.00, 80.00, 70.00, NULL, NULL, 1),
     (7, 'GUA01', 'Guava', 1, NULL, NULL, 40.00, 35.00, 50.00, 40.00, NULL, NULL, 1),
     (8, 'PAP01', 'Papaya', 1, NULL, NULL, 30.00, 25.00, 40.00, 30.00, NULL, NULL, 1),
     (9, 'WAT01', 'Watermelon', 1, 2, 5.000, 60.00, 55.00, 70.00, 60.00, NULL, NULL, 1)"
)->execute();

// Reference current date for tests: Monday 2026-10-12 10:00:00 (Asia/Kolkata)
// Previous week = Monday 2026-10-05 00:00:00 to Monday 2026-10-12 00:00:00 (exclusive)
$asOf = new DateTimeImmutable('2026-10-12 10:00:00', new DateTimeZone('Asia/Kolkata'));
$service = new PreviousWeekPriceService($pdo);

// Insertion helper for tests
$insertInvoice = function(
    int $id,
    string $no,
    string $createdAt,
    string $status = 'completed',
    string $priceType = 'normal',
    int $branchId = 1,
    ?string $deletedAt = null,
    ?string $invoiceDate = null
) use ($pdo): void {
    $date = $invoiceDate ?? substr($createdAt, 0, 10);
    $pdo->prepare(
        "INSERT INTO invoices (id, invoice_no, branch_id, employee_id, bill_type, price_type, invoice_date, grand_total, status, deleted_at, created_at)
         VALUES (:id, :no, :branch, 1, 'gst', :tier, :dt, 100.00, :st, :del, :ts)"
    )->execute([
        'id' => $id,
        'no' => $no,
        'branch' => $branchId,
        'tier' => $priceType,
        'dt' => $date,
        'st' => $status,
        'del' => $deletedAt,
        'ts' => $createdAt,
    ]);
};

$insertLine = function(
    int $id,
    int $invoiceId,
    int $itemId,
    int $unitId,
    string $rate,
    string $qty
) use ($pdo): void {
    $pdo->prepare(
        "INSERT INTO invoice_items (id, invoice_id, item_id, unit_id, item_name_snapshot, qty, rate, line_total)
         VALUES (:id, :inv, :item, :unit, 'Snapshot', :qty, :rate, :total)"
    )->execute([
        'id' => $id,
        'inv' => $invoiceId,
        'item' => $itemId,
        'unit' => $unitId,
        'qty' => $qty,
        'rate' => $rate,
        'total' => (float) bcmul($rate, $qty, 2),
    ]);
};

// -------------------------------------------------------------
// Seed Invoices and Line Items
// -------------------------------------------------------------

// Product 1 (Mango): Sold 2 weeks ago (INV 99 @ 70.00) and last week (INV 101 @ 80.00)
$insertInvoice(99, 'INV-099', '2026-09-25 10:00:00');
$insertLine(991, 99, 1, 1, '70.00', '10.000');

$insertInvoice(101, 'INV-101', '2026-10-07 14:00:00');
$insertLine(1011, 101, 1, 1, '80.00', '5.000');

// Product 2 (Mango Juice): Multiple prices last week (INV 102 @ 40.00 and INV 103 @ 45.00)
$insertInvoice(102, 'INV-102', '2026-10-06 11:00:00');
$insertLine(1021, 102, 2, 1, '40.00', '10.000');

$insertInvoice(103, 'INV-103', '2026-10-08 16:30:00');
$insertLine(1031, 103, 2, 1, '45.00', '20.000');

// Product 4 (Juice Bottle): Sunday 23:59:59 (in prev week) vs Monday 00:00:00 (outside prev week)
$insertInvoice(104, 'INV-104', '2026-10-11 23:59:59');
$insertLine(1041, 104, 4, 1, '82.50', '2.000');

$insertInvoice(105, 'INV-105', '2026-10-12 00:00:00');
$insertLine(1051, 105, 4, 1, '90.00', '1.000');

// Product 5 (Wholesale Item): Status filtering & tier separation
$insertInvoice(106, 'INV-106', '2026-10-08 10:00:00', 'cancelled', 'retail');
$insertLine(1061, 106, 5, 1, '99.00', '5.000');

$insertInvoice(107, 'INV-107', '2026-10-08 10:00:00', 'held', 'retail');
$insertLine(1071, 107, 5, 1, '99.00', '5.000');

$insertInvoice(108, 'INV-108', '2026-10-08 10:00:00', 'deleted', 'retail');
$insertLine(1081, 108, 5, 1, '99.00', '5.000');

$insertInvoice(109, 'INV-109', '2026-10-09 12:00:00', 'completed', 'retail');
$insertLine(1091, 109, 5, 1, '95.00', '4.000');

$insertInvoice(110, 'INV-110', '2026-10-09 15:00:00', 'completed', 'wholesale');
$insertLine(1101, 110, 5, 1, '85.00', '6.000');

// Product 6 (Pineapple): Sold only 3 weeks ago (2026-09-21) @ 65.00
$insertInvoice(111, 'INV-111', '2026-09-21 11:00:00');
$insertLine(1111, 111, 6, 1, '65.00', '8.000');

// Product 7 (Guava): Two bills on SAME date/time (INV 201 @ 30.00, INV 202 @ 35.00)
$insertInvoice(201, 'INV-201', '2026-10-08 12:00:00');
$insertLine(2011, 201, 7, 1, '30.00', '3.000');

$insertInvoice(202, 'INV-202', '2026-10-08 12:00:00');
$insertLine(2021, 202, 7, 1, '35.00', '4.000');

// Product 8 (Papaya): Bill INV 203 has TWO lines for Product 8 at different rates (22.00 vs 25.00)
$insertInvoice(203, 'INV-203', '2026-10-08 15:00:00');
$insertLine(501, 203, 8, 1, '22.00', '3.000');
$insertLine(502, 203, 8, 1, '25.00', '4.000');

// Product 9 (Watermelon): Valid sale @ 55.00 on 2026-10-09. All invalid/excluded sales @ 110.00 on 2026-10-10
$insertInvoice(301, 'INV-301', '2026-10-09 10:00:00', 'completed', 'normal', 1);
$insertLine(3011, 301, 9, 1, '55.00', '2.000'); // VALID

$insertInvoice(302, 'INV-302', '2026-10-10 10:00:00', 'cancelled', 'normal', 1);
$insertLine(3021, 302, 9, 1, '110.00', '2.000'); // CANCELLED

$insertInvoice(303, 'INV-303', '2026-10-10 10:00:00', 'held', 'normal', 1);
$insertLine(3031, 303, 9, 1, '110.00', '2.000'); // HELD

$insertInvoice(304, 'INV-304', '2026-10-10 10:00:00', 'returned', 'normal', 1);
$insertLine(3041, 304, 9, 1, '110.00', '2.000'); // RETURNED

$insertInvoice(305, 'INV-305', '2026-10-10 10:00:00', 'completed', 'normal', 1, '2026-10-10 11:00:00');
$insertLine(3051, 305, 9, 1, '110.00', '2.000'); // SOFT DELETED

$insertInvoice(306, 'INV-306', '2026-10-10 10:00:00', 'completed', 'normal', 2);
$insertLine(3061, 306, 9, 1, '110.00', '2.000'); // OTHER BRANCH (2)

$insertInvoice(307, 'INV-307', '2026-10-10 10:00:00', 'completed', 'normal', 1);
$insertLine(3071, 307, 9, 2, '110.00', '2.000'); // OTHER UNIT (2 = BOX)

$insertInvoice(308, 'INV-308', '2026-10-10 10:00:00', 'completed', 'wholesale', 1);
$insertLine(3081, 308, 9, 1, '110.00', '2.000'); // OTHER TIER (wholesale)

// Backdated invoice for Product 1 (invoice_date earlier than created_at)
// invoice_date is 2026-09-01, but created_at is 2026-10-07 15:00:00 (during prev week)
$insertInvoice(112, 'INV-112', '2026-10-07 15:00:00', 'completed', 'normal', 1, null, '2026-09-01');
$insertLine(1121, 112, 1, 1, '80.00', '2.000');

echo "--- RUNNING TESTS ---\n\n";

// =============================================================
// Requirement a: Item sold last week and earlier
// =============================================================
// Product 1 was sold 2 weeks ago @ 70.00 and last week @ 80.00.
// last_sale must be 80.00 (the most recent sale, not the oldest 70.00).
$res1 = $service->getProductPreviousWeekPrice(1, 1, 'normal', 1, $asOf);
assertTest('Req a: last_sale price is 80.00 (most recent sale, not oldest 70.00)', $res1['last_sale']['price'] === '80.00', 'Actual: ' . ($res1['last_sale']['price'] ?? 'null'));
assertTest('Req a: last_sale sold_on is latest sale time', $res1['last_sale']['sold_on'] === '2026-10-07 15:00:00');
assertTest('Req a: previous_week single price is 80.00', $res1['previous_week']['single_price'] === '80.00');

// Product 2 was sold last week @ 40.00 and @ 45.00. Average is 43.33.
// last_sale must be 45.00 (most recent sale, not the average 43.33).
$res2 = $service->getProductPreviousWeekPrice(2, 1, 'normal', 1, $asOf, 'AUTO');
assertTest('Req a: last_sale price is 45.00 (most recent sale, not average 43.33)', $res2['last_sale']['price'] === '45.00', 'Actual: ' . ($res2['last_sale']['price'] ?? 'null'));

// =============================================================
// Requirement b: Item sold only 3 weeks ago
// =============================================================
// Product 6 (Pineapple) sold on 2026-09-21 @ 65.00, no sales last week.
$res6 = $service->getProductPreviousWeekPrice(6, 1, 'normal', 1, $asOf);
assertTest('Req b: previous_week has_data is false for 3-week-old item', $res6['previous_week']['has_data'] === false);
assertTest('Req b: previous_week message unchanged: No previous week\'s selling price available.', $res6['message'] === "No previous week's selling price available.");
assertTest('Req b: last_sale exists for 3-week-old item', $res6['last_sale'] !== null);
assertTest('Req b: last_sale price is 65.00', $res6['last_sale']['price'] === '65.00', 'Actual: ' . ($res6['last_sale']['price'] ?? 'null'));
assertTest('Req b: last_sale sold_on is 2026-09-21 11:00:00', $res6['last_sale']['sold_on'] === '2026-09-21 11:00:00');

// =============================================================
// Requirement c: Item never sold
// =============================================================
// Product 3 (Fresh Apples) has 0 sales in history.
$res3 = $service->getProductPreviousWeekPrice(3, 3, 'normal', 1, $asOf);
assertTest('Req c: last_sale is null for never-sold item', $res3['last_sale'] === null);
assertTest('Req c: previous_week has_data is false', $res3['previous_week']['has_data'] === false);
assertTest('Req c: message is No previous week\'s selling price available.', $res3['message'] === "No previous week's selling price available.");

// =============================================================
// Requirement d: Deterministic ordering
// =============================================================
// Product 7 (Guava): Two bills on same date/time (INV 201 @ 30.00, INV 202 @ 35.00). Higher invoice id wins.
$res7 = $service->getProductPreviousWeekPrice(7, 1, 'normal', 1, $asOf);
assertTest('Req d: Two bills on same timestamp: later invoice ID (202 vs 201) wins -> 35.00', $res7['last_sale']['price'] === '35.00', 'Actual: ' . ($res7['last_sale']['price'] ?? 'null'));

// Product 8 (Papaya): Bill INV 203 has two line items (line 501 @ 22.00, line 502 @ 25.00). Later line item id wins.
$res8 = $service->getProductPreviousWeekPrice(8, 1, 'normal', 1, $asOf);
assertTest('Req d: Bill with multiple lines for same item: latest line ID (502 vs 501) wins -> 25.00', $res8['last_sale']['price'] === '25.00', 'Actual: ' . ($res8['last_sale']['price'] ?? 'null'));
echo "  [INFO] Test Data Verification: In invoice INV-203, item 8 had lines at 22.00 (id: 501) and 25.00 (id: 502); latest line id 502 selected rate 25.00.\n";

// =============================================================
// Requirement e: Status, branch, unit, and tier isolation
// =============================================================
// Product 9 (Watermelon): Valid sale @ 55.00. Cancelled, held, returned, deleted, other branch, other unit, wholesale all at 110.00.
$res9 = $service->getProductPreviousWeekPrice(9, 1, 'normal', 1, $asOf);
assertTest('Req e: last_sale excludes cancelled, held, returned, deleted, branch 2, box unit, wholesale -> selects 55.00', $res9['last_sale']['price'] === '55.00', 'Actual: ' . ($res9['last_sale']['price'] ?? 'null'));

// Retail vs Wholesale separation on Product 5
$res5Retail = $service->getProductPreviousWeekPrice(5, 1, 'retail', 1, $asOf);
$res5Wholesale = $service->getProductPreviousWeekPrice(5, 1, 'wholesale', 1, $asOf);
assertTest('Req e: Retail last_sale is 95.00', $res5Retail['last_sale']['price'] === '95.00');
assertTest('Req e: Wholesale last_sale is 85.00', $res5Wholesale['last_sale']['price'] === '85.00');
assertTest('Req e: Tiers never cross-contaminate last_sale', $res5Retail['last_sale']['price'] !== $res5Wholesale['last_sale']['price']);

// =============================================================
// Requirement f: Future bill / Point-in-time / Unsaved cart line
// =============================================================
// Insert a bill created after $asOf (2026-10-12 10:00:05) for Product 1 @ 99.00
$insertInvoice(999, 'INV-999', '2026-10-12 10:00:05');
$insertLine(9991, 999, 1, 1, '99.00', '1.000');

$res1PointInTime = $service->getProductPreviousWeekPrice(1, 1, 'normal', 1, $asOf);
assertTest('Req f: Future bill (created after asOf) does NOT alter last_sale (still 80.00, not 99.00)', $res1PointInTime['last_sale']['price'] === '80.00', 'Actual: ' . ($res1PointInTime['last_sale']['price'] ?? 'null'));

// =============================================================
// Requirement g: JSON Key Scan & Code Inspection (Pure Selling Price)
// =============================================================
assertTest('Req g: Response contains yearly_prices array', array_key_exists('yearly_prices', $res1) && is_array($res1['yearly_prices']));
assertTest('Req g: Response does NOT contain difference key', !array_key_exists('difference', $res1));

function scanKeys(array $data, array &$forbiddenFound): void {
    foreach ($data as $k => $v) {
        $keyLower = strtolower((string) $k);
        if (
            str_contains($keyLower, 'purchase') ||
            str_contains($keyLower, 'cost') ||
            str_contains($keyLower, 'supplier') ||
            str_contains($keyLower, 'net_purrate')
        ) {
            $forbiddenFound[] = $k;
        }
        if (is_array($v)) {
            scanKeys($v, $forbiddenFound);
        }
    }
}

$forbiddenKeys = [];
scanKeys($res1, $forbiddenKeys);
scanKeys($res2, $forbiddenKeys);
scanKeys($res3, $forbiddenKeys);
scanKeys($res6, $forbiddenKeys);
scanKeys($res9, $forbiddenKeys);
assertTest('Req g: JSON key scan finds ZERO purchase/cost/supplier keys in any response', empty($forbiddenKeys), implode(', ', $forbiddenKeys));

// Code inspection of PreviousWeekPriceService.php to ensure no purchase/cost column is selected from DB
$serviceCode = file_get_contents(__DIR__ . '/../src/Services/PreviousWeekPriceService.php');
preg_match_all("/(?:prepare|query)\(\s*['\"](SELECT.*?)['\"]\s*\)/is", $serviceCode, $sqlMatches);
$foundPurchaseInSql = false;
foreach ($sqlMatches[1] as $sql) {
    if (preg_match('/\b(purchase_price|net_purrate|supplier|cost)\b/i', $sql)) {
        $foundPurchaseInSql = true;
    }
}
assertTest('Req g: PreviousWeekPriceService.php queries ZERO purchase/cost columns from database', !$foundPurchaseInSql);

// =============================================================
// Requirement h: Read-only verification & Side-by-Side SQL Comparison
// =============================================================
$countInvoicesBefore = (int) $pdo->query('SELECT count(*) FROM invoices')->fetchColumn();
$countItemsBefore = (int) $pdo->query('SELECT count(*) FROM invoice_items')->fetchColumn();

// Perform multiple API queries
$service->getProductPreviousWeekPrice(1, 1, 'normal', 1, $asOf);
$service->getProductPreviousWeekPrice(2, 1, 'normal', 1, $asOf);
$service->getProductPreviousWeekPrice(3, 3, 'normal', 1, $asOf);
$service->getProductPreviousWeekPrice(6, 1, 'normal', 1, $asOf);
$service->getProductPreviousWeekPrice(9, 1, 'normal', 1, $asOf);

$countInvoicesAfter = (int) $pdo->query('SELECT count(*) FROM invoices')->fetchColumn();
$countItemsAfter = (int) $pdo->query('SELECT count(*) FROM invoice_items')->fetchColumn();

assertTest('Req h: Endpoint is 100% read-only (invoices count unchanged)', $countInvoicesBefore === $countInvoicesAfter);
assertTest('Req h: Endpoint is 100% read-only (invoice_items count unchanged)', $countItemsBefore === $countItemsAfter);

// Independent handwritten SQL for last_sale comparison
$handWrittenLastSaleSql = "
    SELECT ii.rate, ii.qty, inv.created_at, u.short_code
    FROM invoice_items ii
    INNER JOIN invoices inv ON inv.id = ii.invoice_id
    LEFT JOIN stock_units u ON u.id = ii.unit_id
    WHERE inv.branch_id = 1
      AND inv.status = 'completed'
      AND inv.deleted_at IS NULL
      AND inv.price_type = 'normal'
      AND ii.item_id = 1
      AND ii.unit_id = 1
      AND inv.created_at <= '2026-10-12 10:00:00'
    ORDER BY inv.created_at DESC, inv.id DESC, ii.id DESC
    LIMIT 1
";
$handRow = $pdo->query($handWrittenLastSaleSql)->fetch(PDO::FETCH_ASSOC);
$sqlPrice = number_format((float) $handRow['rate'], 2, '.', '');
$apiPrice = $res1['last_sale']['price'];
assertTest("Req h: Independent handwritten SQL matches API last_sale (API: $apiPrice, SQL: $sqlPrice)", $apiPrice === $sqlPrice);
assertTest("Req h: Independent SQL sold_on matches API (" . $res1['last_sale']['sold_on'] . ")", $res1['last_sale']['sold_on'] === $handRow['created_at']);

// =============================================================
// Requirement i: Previous-week window boundary & fields
// =============================================================
// Product 4: Sunday 23:59:59 sale in, Monday 00:00:00 sale strictly out
$res4 = $service->getProductPreviousWeekPrice(4, 1, 'normal', 1, $asOf);
assertTest('Req i: Sunday 23:59:59 sale belongs to previous week (rate 82.50)', count($res4['previous_week']['prices']) === 1 && $res4['previous_week']['single_price'] === '82.50');
assertTest('Req i: Monday 00:00:00 sale strictly excluded from previous week', $res4['previous_week']['sales_count'] === 1);
assertTest('Req i: previous_week returns from boundary', $res4['previous_week']['from'] === '2026-10-05 00:00:00');
assertTest('Req i: previous_week returns to_exclusive boundary', $res4['previous_week']['to_exclusive'] === '2026-10-12 00:00:00');

// =============================================================
// Requirement j: Existing behavior preservation
// =============================================================
assertTest('Req j: Product name preserved', $res1['name'] === 'Mango');
assertTest('Req j: Product code preserved', $res1['code'] === 'MNG01');
assertTest('Req j: Product unit preserved', $res1['unit'] === 'PCS');
assertTest('Req j: Pricing tier preserved', $res1['pricing_tier'] === 'normal');
assertTest('Req j: Current price preserved (85.00)', $res1['current_price'] === '85.00');
assertTest('Req j: AUTO rule range message preserved', $res2['message'] === 'Rs 40.00 to Rs 45.00 (2 different prices)');

// Query performance benchmark on last_sale query
$start = microtime(true);
for ($i = 0; $i < 50; $i++) {
    $service->getProductPreviousWeekPrice(1, 1, 'normal', 1, $asOf);
}
$timePerReqMs = ((microtime(true) - $start) / 50) * 1000;
echo sprintf("\nQuery Benchmark (50 consecutive calls): %.2f ms / request\n\n", $timePerReqMs);
assertTest('Performance: Query response time under 15ms', $timePerReqMs < 15.0);

echo "\n============================================================\n";
echo "TEST RESULTS: PASS: $passCount | FAIL: $failCount\n";
echo "============================================================\n";
