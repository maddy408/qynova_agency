<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\CreditLedgerService;
use App\Services\SupplierLedgerService;
use PDO;

/** Dashboard KPI cards (section 11). Gated wholesale behind dashboard.view_financial_summary. */
class DashboardController
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

    public function summary(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'dashboard.view_financial_summary');
        $branchId = $this->resolveBranchId($claims);

        $scalar = function (string $sql, array $params = []) {
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchColumn();
        };

        $hasCustomRange = !empty($_GET['from']) && !empty($_GET['to']);
        $from = $hasCustomRange ? (string) $_GET['from'] : date('Y-m-01');
        $to = $hasCustomRange ? (string) $_GET['to'] : date('Y-m-d');

        $todaySales = (float) $scalar(
            "SELECT COALESCE(SUM(grand_total),0) FROM invoices
             WHERE branch_id = :b AND status = 'completed' AND invoice_date = CURDATE()",
            ['b' => $branchId]
        );
        $monthSales = (float) $scalar(
            "SELECT COALESCE(SUM(grand_total),0) FROM invoices
             WHERE branch_id = :b AND status = 'completed'
               AND invoice_date BETWEEN :from AND :to",
            ['b' => $branchId, 'from' => $from, 'to' => $to]
        );
        $todayPurchases = (float) $scalar(
            "SELECT COALESCE(SUM(grand_total),0) FROM purchases
             WHERE branch_id = :b AND status = 'active' AND purchase_date = CURDATE()",
            ['b' => $branchId]
        );
        $monthPurchases = (float) $scalar(
            "SELECT COALESCE(SUM(grand_total),0) FROM purchases
             WHERE branch_id = :b AND status = 'active'
               AND purchase_date BETWEEN :from AND :to",
            ['b' => $branchId, 'from' => $from, 'to' => $to]
        );
        $inventoryValuation = (float) $scalar(
            "SELECT COALESCE(SUM(sl.quantity_on_hand * i.cost_price),0)
             FROM stock_ledger sl JOIN items i ON i.id = sl.item_id
             WHERE sl.owner_type = 'branch' AND sl.owner_id = :b",
            ['b' => $branchId]
        );
        $customerOutstanding = (float) $scalar(
            "SELECT COALESCE(SUM(balance_due),0) FROM invoices
             WHERE branch_id = :b AND status = 'completed'",
            ['b' => $branchId]
        );
        $supplierOutstanding = (float) $scalar(
            "SELECT COALESCE(SUM(pending_balance),0) FROM purchases
             WHERE branch_id = :b AND status = 'active'",
            ['b' => $branchId]
        );
        $employeeCollectionsToday = (float) $scalar(
            "SELECT COALESCE(SUM(amount),0) FROM customer_collections
             WHERE branch_id = :b AND DATE(collected_at) = CURDATE()",
            ['b' => $branchId]
        );
        $operatingExpensesToday = (float) $scalar(
            "SELECT COALESCE(SUM(amount),0) FROM expenses WHERE branch_id = :b AND expense_date = CURDATE()",
            ['b' => $branchId]
        );
        $extraIncomeToday = (float) $scalar(
            "SELECT COALESCE(SUM(amount),0) FROM other_income WHERE branch_id = :b AND income_date = CURDATE()",
            ['b' => $branchId]
        );
        $lowStockCount = (int) $scalar(
            "SELECT COUNT(*) FROM (
                SELECT i.id
                FROM items i
                LEFT JOIN stock_ledger sl ON sl.item_id = i.id AND sl.owner_type = 'branch' AND sl.owner_id = :b
                WHERE i.is_active = 1
                GROUP BY i.id, i.min_stock_threshold
                HAVING COALESCE(SUM(sl.quantity_on_hand),0) <= i.min_stock_threshold
             ) t",
            ['b' => $branchId]
        );

        // 1. Profit (Gross Profit)
        $rangeRevenue = (float) $scalar(
            "SELECT COALESCE(SUM(CASE WHEN taxable_value > 0 THEN taxable_value ELSE grand_total END), 0)
             FROM invoices
             WHERE branch_id = :b AND status = 'completed' AND invoice_date BETWEEN :from AND :to",
            ['b' => $branchId, 'from' => $from, 'to' => $to]
        );
        $rangeReturns = (float) $scalar(
            "SELECT COALESCE(SUM(return_total), 0)
             FROM sales_returns
             WHERE branch_id = :b AND status = 'approved' AND DATE(created_at) BETWEEN :from AND :to",
            ['b' => $branchId, 'from' => $from, 'to' => $to]
        );
        $soldCogs = (float) $scalar(
            "SELECT COALESCE(SUM(ii.qty * COALESCE(i.cost_price, 0)), 0)
             FROM invoice_items ii
             JOIN invoices inv ON inv.id = ii.invoice_id
             LEFT JOIN items i ON i.id = ii.item_id
             WHERE inv.branch_id = :b AND inv.status = 'completed' AND inv.invoice_date BETWEEN :from AND :to",
            ['b' => $branchId, 'from' => $from, 'to' => $to]
        );
        $returnCogs = (float) $scalar(
            "SELECT COALESCE(SUM(sri.qty * COALESCE(i.cost_price, 0)), 0)
             FROM sales_return_items sri
             JOIN sales_returns sr ON sr.id = sri.sales_return_id
             LEFT JOIN items i ON i.id = sri.item_id
             WHERE sr.branch_id = :b AND sr.status = 'approved' AND DATE(sr.created_at) BETWEEN :from AND :to",
            ['b' => $branchId, 'from' => $from, 'to' => $to]
        );
        $grossProfit = max(0.0, $rangeRevenue - $rangeReturns) - max(0.0, $soldCogs - $returnCogs);

        // 2. Stock Loss (Product Loss from damage / spoilage)
        $stockLoss = (float) $scalar(
            "SELECT COALESCE(SUM(sa.qty * COALESCE(i.cost_price, 0)), 0)
             FROM stock_adjustments sa
             LEFT JOIN items i ON i.id = sa.item_id
             WHERE sa.owner_type = 'branch' AND sa.owner_id = :b
               AND sa.adjustment_type = 'deduction'
               AND sa.reason IN ('damage', 'spoilage')
               AND DATE(sa.created_at) BETWEEN :from AND :to",
            ['b' => $branchId, 'from' => $from, 'to' => $to]
        );
        $stockLossQty = (float) $scalar(
            "SELECT COALESCE(SUM(sa.qty), 0)
             FROM stock_adjustments sa
             WHERE sa.owner_type = 'branch' AND sa.owner_id = :b
               AND sa.adjustment_type = 'deduction'
               AND sa.reason IN ('damage', 'spoilage')
               AND DATE(sa.created_at) BETWEEN :from AND :to",
            ['b' => $branchId, 'from' => $from, 'to' => $to]
        );

        // 3. Stock Purchase (Net purchases after returns)
        $stockPurchasesGross = (float) $scalar(
            "SELECT COALESCE(SUM(grand_total), 0)
             FROM purchases
             WHERE branch_id = :b AND status = 'active' AND purchase_date BETWEEN :from AND :to",
            ['b' => $branchId, 'from' => $from, 'to' => $to]
        );
        $purchaseReturns = (float) $scalar(
            "SELECT COALESCE(SUM(return_total), 0)
             FROM purchase_returns
             WHERE branch_id = :b AND DATE(created_at) BETWEEN :from AND :to",
            ['b' => $branchId, 'from' => $from, 'to' => $to]
        );
        $netStockPurchase = max(0.0, $stockPurchasesGross - $purchaseReturns);

        // 4. Stock Adjustment (Net adjustment value on stock)
        $stockAdjustmentValue = (float) $scalar(
            "SELECT COALESCE(SUM(
                CASE
                    WHEN sa.adjustment_type = 'addition' THEN sa.qty * COALESCE(i.cost_price, 0)
                    ELSE -1 * (sa.qty * COALESCE(i.cost_price, 0))
                END
             ), 0)
             FROM stock_adjustments sa
             LEFT JOIN items i ON i.id = sa.item_id
             WHERE sa.owner_type = 'branch' AND sa.owner_id = :b
               AND DATE(sa.created_at) BETWEEN :from AND :to",
            ['b' => $branchId, 'from' => $from, 'to' => $to]
        );
        $stockAdjustmentNetQty = (float) $scalar(
            "SELECT COALESCE(SUM(
                CASE
                    WHEN sa.adjustment_type = 'addition' THEN sa.qty
                    ELSE -1 * sa.qty
                END
             ), 0)
             FROM stock_adjustments sa
             WHERE sa.owner_type = 'branch' AND sa.owner_id = :b
               AND DATE(sa.created_at) BETWEEN :from AND :to",
            ['b' => $branchId, 'from' => $from, 'to' => $to]
        );

        // 5. Order Management (Active customer prebookings value)
        $orderManagementValue = (float) $scalar(
            "SELECT COALESCE(SUM(cpi.qty * cpi.rate * (1 + cpi.tax_percent / 100)), 0)
             FROM customer_prebookings cp
             JOIN customer_prebooking_items cpi ON cpi.prebooking_id = cp.id
             WHERE cp.branch_id = :b AND cp.status != 'cancelled'
               AND DATE(cp.created_at) BETWEEN :from AND :to",
            ['b' => $branchId, 'from' => $from, 'to' => $to]
        );
        $orderManagementCount = (int) $scalar(
            "SELECT COUNT(*)
             FROM customer_prebookings cp
             WHERE cp.branch_id = :b AND cp.status != 'cancelled'
               AND DATE(cp.created_at) BETWEEN :from AND :to",
            ['b' => $branchId, 'from' => $from, 'to' => $to]
        );

        // Unresolved cash-handover shortages never fade quietly off a list —
        // surface them straight on the dashboard until someone re-verifies (section 4.16 / spec item 31).
        $stmt = $this->pdo->prepare(
            "SELECT handover_no, employee_id, u.name AS employee_name, submitted_amount, verified_amount, discrepancy, handover_date
             FROM cash_handovers ch JOIN users u ON u.id = ch.employee_id
             WHERE ch.branch_id = :b AND ch.status = 'discrepancy_flagged'
             ORDER BY ch.handover_date DESC"
        );
        $stmt->execute(['b' => $branchId]);
        $discrepancies = $stmt->fetchAll();

        Response::json([
            'today_sales_revenue' => round($todaySales, 2),
            'month_sales_total' => round($monthSales, 2),
            'today_purchases' => round($todayPurchases, 2),
            'month_purchases_total' => round($monthPurchases, 2),
            'inventory_valuation' => round($inventoryValuation, 2),
            'customer_net_outstanding' => round($customerOutstanding, 2),
            'supplier_net_outstanding' => round($supplierOutstanding, 2),
            'employee_collections_today' => round($employeeCollectionsToday, 2),
            'operating_expenses_today' => round($operatingExpensesToday, 2),
            'extra_income_today' => round($extraIncomeToday, 2),
            'low_stock_count' => $lowStockCount,
            'unresolved_handover_discrepancies' => $discrepancies,
            // 5 Requested Metrics:
            'profit' => round($grossProfit, 2),
            'gross_profit' => round($grossProfit, 2),
            'stock_loss' => round($stockLoss, 2),
            'product_loss' => round($stockLoss, 2),
            'stock_loss_qty' => round($stockLossQty, 2),
            'stock_purchase' => round($netStockPurchase, 2),
            'stock_purchases' => round($netStockPurchase, 2),
            'stock_adjustment' => round($stockAdjustmentValue, 2),
            'stock_adjustment_qty' => round($stockAdjustmentNetQty, 2),
            'order_management' => round($orderManagementValue, 2),
            'order_management_count' => $orderManagementCount,
            'range' => [
                'from' => $from,
                'to' => $to,
            ],
        ]);
    }
}
