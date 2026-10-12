<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\ItemModel;
use DateTimeImmutable;
use DateTimeZone;
use PDO;

class PreviousWeekPriceService
{
    private DateTimeZone $tz;

    public function __construct(private PDO $pdo)
    {
        $this->tz = new DateTimeZone('Asia/Kolkata');
    }

    /**
     * Compute previous calendar week boundaries in Asia/Kolkata.
     * Monday 00:00:00 up to Monday 00:00:00 (exclusive).
     * A sale at Sunday 23:59:59 belongs to previous week; Monday 00:00:00 belongs to current week.
     */
    public function getPreviousWeekRange(?DateTimeImmutable $asOf = null): array
    {
        $now = $asOf ?? new DateTimeImmutable('now', $this->tz);
        $dayOfWeek = (int) $now->format('N'); // 1 = Monday, 7 = Sunday
        $daysSinceMonday = $dayOfWeek - 1;
        $thisMondayMidnight = $now->setTime(0, 0, 0)->sub(new \DateInterval("P{$daysSinceMonday}D"));
        $lastMondayMidnight = $thisMondayMidnight->sub(new \DateInterval('P7D'));

        return [
            'from' => $lastMondayMidnight->format('Y-m-d H:i:s'),
            'to_exclusive' => $thisMondayMidnight->format('Y-m-d H:i:s'),
        ];
    }

    /**
     * Fetch settings: pos_prev_week_popup_enabled, prev_week_price_rule.
     */
    public function getSettings(int $branchId): array
    {
        $defaults = [
            'pos_prev_week_popup_enabled' => true,
            'prev_week_price_rule' => 'AUTO',
            'prev_week_popup_on_repeat_add' => false,
        ];

        try {
            $stmt = $this->pdo->prepare('SELECT pos_prev_week_popup_enabled, prev_week_price_rule, prev_week_popup_on_repeat_add FROM pos_feature_settings WHERE branch_id = :b');
            $stmt->execute(['b' => $branchId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                return [
                    'pos_prev_week_popup_enabled' => (bool) $row['pos_prev_week_popup_enabled'],
                    'prev_week_price_rule' => (string) $row['prev_week_price_rule'],
                    'prev_week_popup_on_repeat_add' => (bool) $row['prev_week_popup_on_repeat_add'],
                ];
            }
        } catch (\PDOException) {
            // Table might not exist yet, fallback gracefully to defaults
        }

        return $defaults;
    }

    /**
     * Calculate price difference strictly using BCMath / decimal strings.
     */
    public function calculateDifference(string $currentPrice, string $prevPrice): array
    {
        $diff = bcsub($currentPrice, $prevPrice, 2);
        $cmp = bccomp($diff, '0.00', 2);

        $direction = match (true) {
            $cmp > 0 => 'up',
            $cmp < 0 => 'down',
            default => 'no_change',
        };

        $percent = '0.00';
        if (bccomp($prevPrice, '0.00', 2) > 0) {
            $rawPercent = bcdiv(bcmul(bcsub($currentPrice, $prevPrice, 4), '100', 4), $prevPrice, 4);
            $percent = number_format((float) $rawPercent, 2, '.', '');
        }

        return [
            'amount' => $diff,
            'percent' => $percent,
            'direction' => $direction,
            'comparable' => true,
        ];
    }

    /**
     * Resolve product previous week selling price.
     * Pure read-only operation: no cost/purchase fields are ever read or exposed.
     */
    public function getProductPreviousWeekPrice(
        int $productId,
        ?int $unitId,
        string $pricingTier,
        int $branchId,
        ?DateTimeImmutable $asOf = null,
        ?string $ruleOverride = null
    ): array {
        // Fetch item basic data
        $stmt = $this->pdo->prepare(
            'SELECT i.id, i.item_code, i.item_name, i.barcode, i.base_unit_id, i.secondary_unit_id,
                    i.retail_price, i.wholesale_price, i.mrp, i.net_srate,
                    i.secondary_mrp, i.secondary_net_srate,
                    i.retail_selling_price, i.wholesale_selling_price,
                    u.name AS base_unit_name, u.short_code AS base_unit_code
             FROM items i
             LEFT JOIN stock_units u ON u.id = i.base_unit_id
             WHERE i.id = :id'
        );
        $stmt->execute(['id' => $productId]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$item) {
            return ['error' => 'not_found', 'code' => 404, 'message' => 'Product not found'];
        }

        // Avoid PHP notices in ItemModel::resolveUnitPricing without reading any cost columns from DB
        $item['purchase_price'] = '0.00';
        $item['net_purrate'] = '0.00';

        $effectiveUnitId = $unitId ?? (int) $item['base_unit_id'];
        $unitCode = (string) ($item['base_unit_code'] ?? 'UNIT');

        if ($effectiveUnitId !== (int) $item['base_unit_id'] && !empty($item['secondary_unit_id'])) {
            $uStmt = $this->pdo->prepare('SELECT short_code FROM stock_units WHERE id = :u');
            $uStmt->execute(['u' => $effectiveUnitId]);
            $unitCode = (string) ($uStmt->fetchColumn() ?: $unitCode);
        }

        $tier = in_array(strtolower($pricingTier), ['retail', 'wholesale', 'normal'], true)
            ? strtolower($pricingTier)
            : 'normal';

        // Resolve current selling price using existing ItemModel resolver
        $resolvedCurrent = ItemModel::resolveSellingPrice($item, $effectiveUnitId, $tier);
        $currentPrice = number_format((float) $resolvedCurrent['rate'], 2, '.', '');

        $normalPrice = number_format((float) ItemModel::resolveSellingPrice($item, $effectiveUnitId, 'normal')['rate'], 2, '.', '');
        $offerActive = bccomp($currentPrice, $normalPrice, 2) !== 0;

        $settings = $this->getSettings($branchId);
        $rule = $ruleOverride ?: ($settings['prev_week_price_rule'] ?? 'AUTO');
        $weekRange = $this->getPreviousWeekRange($asOf);

        // Historical query on invoice_items + invoices ONLY
        $histStmt = $this->pdo->prepare(
            'SELECT 
                ii.rate,
                SUM(ii.qty) AS total_qty,
                COUNT(DISTINCT inv.id) AS bill_count,
                MAX(inv.created_at) AS latest_sale_time
             FROM invoice_items ii
             INNER JOIN invoices inv ON inv.id = ii.invoice_id
             WHERE inv.branch_id = :branch_id
               AND inv.status = "completed"
               AND inv.price_type = :tier
               AND ii.item_id = :item_id
               AND ii.unit_id = :unit_id
               AND inv.created_at >= :from_time
               AND inv.created_at < :to_time
             GROUP BY ii.rate
             ORDER BY latest_sale_time DESC, ii.rate ASC'
        );
        $histStmt->execute([
            'branch_id' => $branchId,
            'tier' => $tier,
            'item_id' => $productId,
            'unit_id' => $effectiveUnitId,
            'from_time' => $weekRange['from'],
            'to_time' => $weekRange['to_exclusive'],
        ]);
        $rows = $histStmt->fetchAll(PDO::FETCH_ASSOC);

        $prices = [];
        $totalBills = 0;
        $latestPrice = null;
        $highest = null;
        $lowest = null;
        $totalQtySum = '0.000';
        $weightedAmountSum = '0.00';

        foreach ($rows as $index => $r) {
            $p = number_format((float) $r['rate'], 2, '.', '');
            $q = number_format((float) $r['total_qty'], 3, '.', '');
            $b = (int) $r['bill_count'];

            if ($index === 0) {
                $latestPrice = $p;
                $highest = $p;
                $lowest = $p;
            } else {
                if (bccomp($p, $highest, 2) > 0) $highest = $p;
                if (bccomp($p, $lowest, 2) < 0) $lowest = $p;
            }

            $totalBills += $b;
            $totalQtySum = bcadd($totalQtySum, $q, 3);
            $weightedAmountSum = bcadd($weightedAmountSum, bcmul($p, $q, 4), 2);

            $prices[] = [
                'price' => $p,
                'quantity' => $q,
                'bills' => $b,
            ];
        }

        $hasData = count($prices) > 0;
        $singlePrice = null;
        $diff = null;
        $message = null;

        if (!$hasData) {
            $message = "No previous week's selling price available.";
        } elseif (count($prices) === 1) {
            $singlePrice = $prices[0]['price'];
            $diff = $this->calculateDifference($currentPrice, $singlePrice);
        } else {
            // Multiple distinct selling prices in the previous week
            switch (strtoupper($rule)) {
                case 'LATEST':
                    $singlePrice = $latestPrice;
                    $diff = $this->calculateDifference($currentPrice, $singlePrice);
                    $message = "Multiple prices last week. Using latest sale price.";
                    break;
                case 'AVERAGE':
                    if (bccomp($totalQtySum, '0.000', 3) > 0) {
                        $avg = bcdiv($weightedAmountSum, $totalQtySum, 2);
                        $singlePrice = number_format((float) $avg, 2, '.', '');
                        $diff = $this->calculateDifference($currentPrice, $singlePrice);
                        $message = "Multiple prices last week. Using quantity-weighted average.";
                    } else {
                        $singlePrice = $latestPrice;
                        $diff = $this->calculateDifference($currentPrice, $singlePrice);
                    }
                    break;
                case 'MOST_USED':
                    // Sort by quantity or bills
                    $mostUsed = $prices[0];
                    foreach ($prices as $cand) {
                        if (bccomp($cand['quantity'], $mostUsed['quantity'], 3) > 0) {
                            $mostUsed = $cand;
                        }
                    }
                    $singlePrice = $mostUsed['price'];
                    $diff = $this->calculateDifference($currentPrice, $singlePrice);
                    $message = "Multiple prices last week. Using most sold price.";
                    break;
                case 'AUTO':
                default:
                    $singlePrice = null;
                    $diff = [
                        'amount' => null,
                        'percent' => null,
                        'direction' => 'mixed',
                        'comparable' => false,
                    ];
                    $message = sprintf('Rs %s to Rs %s (%d different prices)', $lowest, $highest, count($prices));
                    break;
            }
        }

        return [
            'product_id' => (int) $item['id'],
            'variant_id' => (int) $item['id'],
            'name' => (string) $item['item_name'],
            'code' => (string) ($item['item_code'] ?? ''),
            'unit' => $unitCode,
            'unit_id' => $effectiveUnitId,
            'pack_size' => null,
            'pricing_tier' => $tier,
            'current_price' => $currentPrice,
            'normal_price' => $normalPrice,
            'offer_active' => $offerActive,
            'previous_week' => [
                'from' => $weekRange['from'],
                'to_exclusive' => $weekRange['to_exclusive'],
                'has_data' => $hasData,
                'prices' => $prices,
                'single_price' => $singlePrice,
                'lowest' => $lowest,
                'highest' => $highest,
                'latest_price' => $latestPrice,
                'sales_count' => $totalBills,
            ],
            'difference' => $diff,
            'rule_used' => $rule,
            'popup_enabled' => (bool) ($settings['pos_prev_week_popup_enabled'] ?? true),
            'message' => $message,
        ];
    }
}
