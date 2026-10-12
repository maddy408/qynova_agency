<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use App\Helpers\JwtHelper;
use App\Services\PreviousWeekPriceService;

// Ensure test database connection
$pdo = new PDO('mysql:host=127.0.0.1;port=3306;dbname=pos_system_test;charset=utf8mb4', 'root', 'Mysql@1234', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

echo "============================================================\n";
echo "PREVIOUS WEEK SELLING PRICE TEST SUITE (ON pos_system_test)\n";
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

// Insert base stock units if missing
$pdo->exec("INSERT IGNORE INTO stock_units (id, name, short_code, is_decimal) VALUES (1, 'Piece', 'PCS', 0), (2, 'Box', 'BOX', 0), (3, 'Kilogram', 'KG', 1)");

// Insert Products:
// Product 1: Mango (Regular)
// Product 2: Mango Juice (Similar name, different ID)
// Product 3: Fresh Apples (Never sold)
// Product 4: Juice Bottle (Decimal prices)
// Product 5: Wholesale Item (Different tiers)
$pdo->prepare(
    "INSERT INTO items (id, item_code, item_name, base_unit_id, secondary_unit_id, conversion_factor, retail_price, wholesale_price, mrp, net_srate, retail_selling_price, wholesale_selling_price, is_active)
     VALUES 
     (1, 'MNG01', 'Mango', 1, 2, 10.000, 85.00, 75.00, 100.00, 85.00, NULL, NULL, 1),
     (2, 'MNG02', 'Mango Juice', 1, NULL, NULL, 50.00, 45.00, 60.00, 50.00, NULL, NULL, 1),
     (3, 'APL01', 'Fresh Apples', 3, NULL, NULL, 120.00, 110.00, 150.00, 120.00, NULL, NULL, 1),
     (4, 'JUC01', 'Juice Bottle', 1, NULL, NULL, 82.50, 80.00, 95.00, 82.50, NULL, NULL, 1),
     (5, 'WHL01', 'Wholesale Item', 1, NULL, NULL, 100.00, 90.00, 120.00, 100.00, 95.00, 85.00, 1)"
)->execute();

// Reference current date for tests: Monday 2026-10-12 10:00:00 (Asia/Kolkata)
// Previous week = Monday 2026-10-05 00:00:00 to Monday 2026-10-12 00:00:00 (exclusive)
$asOf = new DateTimeImmutable('2026-10-12 10:00:00', new DateTimeZone('Asia/Kolkata'));
$service = new PreviousWeekPriceService($pdo);

// Helper to insert completed invoice + line item with specific timestamp and status
$insertSale = function (
    int $invoiceId,
    string $invoiceNo,
    int $itemId,
    int $unitId,
    string $rate,
    string $qty,
    string $createdAt,
    string $status = 'completed',
    string $priceType = 'normal'
) use ($pdo): void {
    $date = substr($createdAt, 0, 10);
    $pdo->prepare(
        "INSERT INTO invoices (id, invoice_no, branch_id, employee_id, bill_type, price_type, invoice_date, grand_total, status, created_at)
         VALUES (:id, :no, 1, 1, 'gst', :tier, :dt, :total, :st, :ts)"
    )->execute([
        'id' => $invoiceId,
        'no' => $invoiceNo,
        'tier' => $priceType,
        'dt' => $date,
        'total' => (float) bcmul($rate, $qty, 2),
        'st' => $status,
        'ts' => $createdAt,
    ]);

    $pdo->prepare(
        "INSERT INTO invoice_items (invoice_id, item_id, unit_id, item_name_snapshot, qty, rate, line_total)
         VALUES (:inv, :item, :unit, 'Snapshot', :qty, :rate, :total)"
    )->execute([
        'inv' => $invoiceId,
        'item' => $itemId,
        'unit' => $unitId,
        'qty' => $qty,
        'rate' => $rate,
        'total' => (float) bcmul($rate, $qty, 2),
    ]);
};

// Seed Sales:
// Product 1: Exactly 1 price last week (sold on 2026-10-07 at Rs 80.00)
$insertSale(101, 'INV-101', 1, 1, '80.00', '5.000', '2026-10-07 14:00:00');

// Product 2: Multiple distinct prices last week (Rs 40.00 and Rs 45.00)
$insertSale(102, 'INV-102', 2, 1, '40.00', '10.000', '2026-10-06 11:00:00');
$insertSale(103, 'INV-103', 2, 1, '45.00', '20.000', '2026-10-08 16:30:00'); // latest

// Product 4: Boundary tests (Sunday 23:59:59 vs Monday 00:00:00)
$insertSale(104, 'INV-104', 4, 1, '82.50', '2.000', '2026-10-11 23:59:59'); // In previous week
$insertSale(105, 'INV-105', 4, 1, '90.00', '1.000', '2026-10-12 00:00:00'); // In NEW week (must NOT be counted)

// Product 5: Status filtering (cancelled, deleted, held) & tier separation
$insertSale(106, 'INV-106', 5, 1, '99.00', '5.000', '2026-10-08 10:00:00', 'cancelled', 'retail');
$insertSale(107, 'INV-107', 5, 1, '99.00', '5.000', '2026-10-08 10:00:00', 'held', 'retail');
$insertSale(108, 'INV-108', 5, 1, '99.00', '5.000', '2026-10-08 10:00:00', 'deleted', 'retail');
$insertSale(109, 'INV-109', 5, 1, '95.00', '4.000', '2026-10-09 12:00:00', 'completed', 'retail');
$insertSale(110, 'INV-110', 5, 1, '85.00', '6.000', '2026-10-09 15:00:00', 'completed', 'wholesale');

// Older sale for Product 1 from 2 weeks ago (must NOT be counted)
$insertSale(99, 'INV-099', 1, 1, '70.00', '10.000', '2026-09-25 10:00:00');

// -------------------------------------------------------------
// Test 1: Exactly one price last week (Product 1 Mango)
// -------------------------------------------------------------
$res1 = $service->getProductPreviousWeekPrice(1, 1, 'normal', 1, $asOf);
assertTest('Test 1: Has data', $res1['previous_week']['has_data'] === true);
assertTest('Test 1: Single price is 80.00', $res1['previous_week']['single_price'] === '80.00');
assertTest('Test 1: Current price is 85.00', $res1['current_price'] === '85.00');
assertTest('Test 1: Difference amount is +5.00', $res1['difference']['amount'] === '5.00');
assertTest('Test 1: Difference direction is up', $res1['difference']['direction'] === 'up');
assertTest('Test 1: Difference percent is 6.25%', $res1['difference']['percent'] === '6.25');
assertTest('Test 1: Older sale (Rs 70 from Sept 25) was excluded', count($res1['previous_week']['prices']) === 1);

// -------------------------------------------------------------
// Test 2: Several prices last week (Product 2 Mango Juice)
// -------------------------------------------------------------
$res2Auto = $service->getProductPreviousWeekPrice(2, 1, 'normal', 1, $asOf, 'AUTO');
assertTest('Test 2: Multiple prices found', count($res2Auto['previous_week']['prices']) === 2);
assertTest('Test 2 (AUTO): single_price is null', $res2Auto['previous_week']['single_price'] === null);
assertTest('Test 2 (AUTO): difference is not comparable', $res2Auto['difference']['comparable'] === false);
assertTest('Test 2 (AUTO): Lowest price is 40.00 and highest is 45.00', $res2Auto['previous_week']['lowest'] === '40.00' && $res2Auto['previous_week']['highest'] === '45.00');

// -------------------------------------------------------------
// Test 3: Multiple price rules (LATEST, AVERAGE, MOST_USED)
// -------------------------------------------------------------
$res2Latest = $service->getProductPreviousWeekPrice(2, 1, 'normal', 1, $asOf, 'LATEST');
assertTest('Test 3 (LATEST): picks latest price 45.00', $res2Latest['previous_week']['single_price'] === '45.00' && $res2Latest['difference']['comparable'] === true);

$res2Avg = $service->getProductPreviousWeekPrice(2, 1, 'normal', 1, $asOf, 'AVERAGE');
// 10 qty * 40 = 400, 20 qty * 45 = 900. Total 1300 / 30 = 43.33
assertTest('Test 3 (AVERAGE): calculates quantity-weighted avg 43.33', $res2Avg['previous_week']['single_price'] === '43.33');

$res2Most = $service->getProductPreviousWeekPrice(2, 1, 'normal', 1, $asOf, 'MOST_USED');
assertTest('Test 3 (MOST_USED): picks price with highest qty (45.00)', $res2Most['previous_week']['single_price'] === '45.00');

// -------------------------------------------------------------
// Test 4: Product never sold (Product 3 Fresh Apples)
// -------------------------------------------------------------
$res3 = $service->getProductPreviousWeekPrice(3, 3, 'normal', 1, $asOf);
assertTest('Test 4: Product never sold has_data is false', $res3['previous_week']['has_data'] === false);
assertTest('Test 4: single_price is null', $res3['previous_week']['single_price'] === null);
assertTest('Test 4: Friendly message', $res3['message'] === "No previous week's selling price available.");

// -------------------------------------------------------------
// Test 5: Date boundary tests (Sunday 23:59:59 vs Monday 00:00:00)
// -------------------------------------------------------------
$res4 = $service->getProductPreviousWeekPrice(4, 1, 'normal', 1, $asOf);
assertTest('Test 5: Sunday 23:59:59 sale included', count($res4['previous_week']['prices']) === 1 && $res4['previous_week']['single_price'] === '82.50');
assertTest('Test 5: Monday 00:00:00 sale strictly excluded from previous week', $res4['previous_week']['sales_count'] === 1);

// -------------------------------------------------------------
// Test 6: Status filtering (cancelled, held, deleted excluded)
// -------------------------------------------------------------
$res5Retail = $service->getProductPreviousWeekPrice(5, 1, 'retail', 1, $asOf);
assertTest('Test 6: Retail tier has 1 sale', count($res5Retail['previous_week']['prices']) === 1 && $res5Retail['previous_week']['single_price'] === '95.00');
assertTest('Test 6: Cancelled, held, deleted excluded (no Rs 99.00 counted)', $res5Retail['previous_week']['sales_count'] === 1);

// -------------------------------------------------------------
// Test 7: Retail vs Wholesale separation
// -------------------------------------------------------------
$res5Wholesale = $service->getProductPreviousWeekPrice(5, 1, 'wholesale', 1, $asOf);
assertTest('Test 7: Wholesale tier separated from Retail', $res5Wholesale['previous_week']['single_price'] === '85.00');
assertTest('Test 7: Tiers never cross-compared', $res5Retail['previous_week']['single_price'] !== $res5Wholesale['previous_week']['single_price']);

// -------------------------------------------------------------
// Test 8: Two products with similar names (Mango vs Mango Juice)
// -------------------------------------------------------------
assertTest('Test 8: Similar named products have distinct data', $res1['name'] === 'Mango' && $res2Auto['name'] === 'Mango Juice' && $res1['previous_week']['single_price'] !== $res2Auto['previous_week']['single_price']);

// -------------------------------------------------------------
// Test 9: Security & JSON key scan (Zero purchase/cost fields)
// -------------------------------------------------------------
function scanKeys(array $data, array &$forbiddenFound): void {
    foreach ($data as $k => $v) {
        $keyLower = strtolower((string) $k);
        if (str_contains($keyLower, 'purchase') || str_contains($keyLower, 'cost') || str_contains($keyLower, 'supplier_rate') || str_contains($keyLower, 'purrate')) {
            $forbiddenFound[] = $k;
        }
        if (is_array($v)) {
            scanKeys($v, $forbiddenFound);
        }
    }
}
$forbiddenKeys = [];
scanKeys($res1, $forbiddenKeys);
scanKeys($res2Auto, $forbiddenKeys);
scanKeys($res5Retail, $forbiddenKeys);
assertTest('Test 9: JSON key scan finds ZERO purchase/cost/supplier keys', empty($forbiddenKeys), implode(', ', $forbiddenKeys));

// -------------------------------------------------------------
// Test 10: Read-Only Verification (Zero Database Writes)
// -------------------------------------------------------------
$countInvoicesBefore = (int) $pdo->query('SELECT count(*) FROM invoices')->fetchColumn();
$countItemsBefore = (int) $pdo->query('SELECT count(*) FROM invoice_items')->fetchColumn();

// Perform multiple API queries
$service->getProductPreviousWeekPrice(1, 1, 'normal', 1, $asOf);
$service->getProductPreviousWeekPrice(2, 1, 'normal', 1, $asOf);
$service->getProductPreviousWeekPrice(3, 3, 'normal', 1, $asOf);

$countInvoicesAfter = (int) $pdo->query('SELECT count(*) FROM invoices')->fetchColumn();
$countItemsAfter = (int) $pdo->query('SELECT count(*) FROM invoice_items')->fetchColumn();

assertTest('Test 10: Invoices count unchanged after queries', $countInvoicesBefore === $countInvoicesAfter);
assertTest('Test 10: Invoice items count unchanged after queries', $countItemsBefore === $countItemsAfter);

// -------------------------------------------------------------
// Test 11: Independent Hand-Written SQL Side-by-Side Comparison
// -------------------------------------------------------------
$handWrittenSql = "
    SELECT ii.rate, SUM(ii.qty) as qty, COUNT(DISTINCT inv.id) as bills
    FROM invoice_items ii
    JOIN invoices inv ON inv.id = ii.invoice_id
    WHERE inv.branch_id = 1 
      AND inv.status = 'completed'
      AND inv.price_type = 'normal'
      AND ii.item_id = 1
      AND ii.unit_id = 1
      AND inv.created_at >= '2026-10-05 00:00:00'
      AND inv.created_at < '2026-10-12 00:00:00'
    GROUP BY ii.rate
";
$handRow = $pdo->query($handWrittenSql)->fetch(PDO::FETCH_ASSOC);
$apiPrice = $res1['previous_week']['single_price'];
$sqlPrice = number_format((float) $handRow['rate'], 2, '.', '');
assertTest('Test 11: Side-by-side SQL matches API (API: ' . $apiPrice . ', SQL: ' . $sqlPrice . ')', $apiPrice === $sqlPrice);

// -------------------------------------------------------------
// Test 12: High Volume EXPLAIN and Performance Analysis
// -------------------------------------------------------------
$explainStmt = $pdo->prepare("
    EXPLAIN SELECT 
        ii.rate,
        SUM(ii.qty) AS total_qty,
        COUNT(DISTINCT inv.id) AS bill_count,
        MAX(inv.created_at) AS latest_sale_time
    FROM invoice_items ii
    INNER JOIN invoices inv ON inv.id = ii.invoice_id
    WHERE inv.branch_id = 1
      AND inv.status = 'completed'
      AND inv.price_type = 'normal'
      AND ii.item_id = 1
      AND ii.unit_id = 1
      AND inv.created_at >= '2026-10-05 00:00:00'
      AND inv.created_at < '2026-10-12 00:00:00'
    GROUP BY ii.rate
");
$explainStmt->execute();
$explainPlan = $explainStmt->fetchAll(PDO::FETCH_ASSOC);
echo "\n--- EXPLAIN QUERY PLAN ---\n";
foreach ($explainPlan as $plan) {
    echo sprintf("Table: %-15s Type: %-8s Key: %-25s Rows: %-5s Extra: %s\n", $plan['table'], $plan['type'], $plan['key'] ?? 'NULL', $plan['rows'], $plan['Extra'] ?? '');
}

$start = microtime(true);
for ($i = 0; $i < 50; $i++) {
    $service->getProductPreviousWeekPrice(1, 1, 'normal', 1, $asOf);
}
$timePerReqMs = ((microtime(true) - $start) / 50) * 1000;
echo sprintf("\nQuery Benchmark (50 consecutive calls): %.2f ms / request\n\n", $timePerReqMs);
assertTest('Test 12: Query response time under 15ms', $timePerReqMs < 15.0);

echo "\n============================================================\n";
echo "TEST RESULTS: PASS: $passCount | FAIL: $failCount\n";
echo "============================================================\n";
