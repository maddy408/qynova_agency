<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\TableExporter;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use PDO;

/**
 * The report catalog (section 10/4.18). Every report takes ?from=&to=
 * (default: current month to today), is gated behind its own permission,
 * and supports &export=1 to stream the same rows as .xlsx instead of JSON
 * (gated additionally behind reports.export_excel).
 */
class ReportsController
{
    /**
     * Safety cap on unbounded list-style reports (one row per invoice/GRN).
     * Load-tested at 5,000 invoices/branch/month; a report with no LIMIT at
     * 10x that volume would ship a multi-MB JSON payload to the browser for
     * a single date range. Narrow the date range for anything past this —
     * a real pagination UI is the proper fix if that becomes routine.
     */
    private const LIST_REPORT_ROW_CAP = 5000;

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

    private function dateRange(): array
    {
        return [$_GET['from'] ?? date('Y-m-01'), $_GET['to'] ?? date('Y-m-d')];
    }

    private function output(array $claims, array $columns, array $rows, string $filename): void
    {
        if (!empty($_GET['export'])) {
            PermissionMiddleware::require($claims, 'reports.export_excel');
            TableExporter::export($columns, $rows, $filename);
        }
        Response::json($rows);
    }

    /** GST Sales Register — hardcoded bill_type='gst' filter, never toggleable (rule 5 / section 5). */
    public function gstRegister(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.view_gst_register');
        [$from, $to] = $this->dateRange();

        $stmt = $this->pdo->prepare(
            "SELECT i.invoice_no, i.invoice_date, c.ledger_name AS customer_name, i.taxable_value,
                    i.cgst_amount, i.sgst_amount, i.igst_amount, i.grand_total, i.payment_status
             FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id
             WHERE i.branch_id = :b AND i.status = 'completed' AND i.bill_type = 'gst'
               AND i.invoice_date BETWEEN :from AND :to
             ORDER BY i.invoice_date, i.id
             LIMIT " . self::LIST_REPORT_ROW_CAP
        );
        $stmt->execute(['b' => $this->resolveBranchId($claims), 'from' => $from, 'to' => $to]);

        $this->output($claims, [
            'invoice_no' => 'Invoice #', 'invoice_date' => 'Date', 'customer_name' => 'Customer',
            'taxable_value' => 'Taxable Value', 'cgst_amount' => 'CGST', 'sgst_amount' => 'SGST',
            'igst_amount' => 'IGST', 'grand_total' => 'Grand Total', 'payment_status' => 'Payment Status',
        ], $stmt->fetchAll(), 'gst_sales_register.xlsx');
    }

    /** Non-GST/estimate register — deliberately separate from the GST register, never merged into it. */
    public function nonGstRegister(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.view_non_gst_register');
        [$from, $to] = $this->dateRange();

        $stmt = $this->pdo->prepare(
            "SELECT i.invoice_no, i.invoice_date, c.ledger_name AS customer_name, i.grand_total, i.payment_status
             FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id
             WHERE i.branch_id = :b AND i.status = 'completed' AND i.bill_type = 'non_gst'
               AND i.invoice_date BETWEEN :from AND :to
             ORDER BY i.invoice_date, i.id
             LIMIT " . self::LIST_REPORT_ROW_CAP
        );
        $stmt->execute(['b' => $this->resolveBranchId($claims), 'from' => $from, 'to' => $to]);

        $this->output($claims, [
            'invoice_no' => 'Estimate #', 'invoice_date' => 'Date', 'customer_name' => 'Customer',
            'grand_total' => 'Grand Total', 'payment_status' => 'Payment Status',
        ], $stmt->fetchAll(), 'non_gst_register.xlsx');
    }

    public function purchaseRegister(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.view_all');
        [$from, $to] = $this->dateRange();
        $canViewCost = in_array('purchases.view_purchase_cost', (array) ($claims['permissions'] ?? []), true);

        $stmt = $this->pdo->prepare(
            "SELECT p.grn_no, p.purchase_date, s.name AS supplier_name, p.grand_total, p.paid_amount, p.pending_balance, p.status
             FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
             WHERE p.branch_id = :b AND p.purchase_date BETWEEN :from AND :to
             ORDER BY p.purchase_date, p.id
             LIMIT " . self::LIST_REPORT_ROW_CAP
        );
        $stmt->execute(['b' => $this->resolveBranchId($claims), 'from' => $from, 'to' => $to]);
        $rows = $stmt->fetchAll();

        $columns = ['grn_no' => 'GRN #', 'purchase_date' => 'Date', 'supplier_name' => 'Supplier'];
        if ($canViewCost) {
            $columns += ['grand_total' => 'Grand Total', 'paid_amount' => 'Paid', 'pending_balance' => 'Pending'];
        } else {
            $rows = array_map(fn ($r) => array_diff_key($r, array_flip(['grand_total', 'paid_amount', 'pending_balance'])), $rows);
        }
        $columns['status'] = 'Status';

        $this->output($claims, $columns, $rows, 'purchase_register.xlsx');
    }

    /**
     * Aligned to the same gross/discount/gst/net formula every other
     * wise-sales report uses (SALES_AGGREGATE_SQL) instead of its own
     * bespoke total_taxable/total_tax pair — the two were computing
     * overlapping-but-differently-named values, which is exactly the kind
     * of mobile/web drift rule 19 asks not to carry forward uncorrected.
     */
    public function itemWiseSales(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.view_all');
        [$from, $to] = $this->dateRange();

        $stmt = $this->pdo->prepare(
            "SELECT i.item_name AS item_name, i.item_code AS item_code, i.barcode AS barcode,
                    COALESCE(b.name, '') AS brand_name, COALESCE(cat.name, '') AS category_name,
                    COALESCE(s.name, '') AS supplier_name,
                    " . self::SALES_AGGREGATE_SQL . "
             FROM invoice_items ii
             JOIN invoices inv ON inv.id = ii.invoice_id
             JOIN items i ON i.id = ii.item_id
             LEFT JOIN brands b ON b.id = i.brand_id
             LEFT JOIN categories cat ON cat.id = i.category_id
             LEFT JOIN suppliers s ON s.id = i.supplier_id
             WHERE inv.branch_id = :b AND inv.status = 'completed' AND inv.invoice_date BETWEEN :from AND :to
             GROUP BY ii.item_id, i.item_name, i.item_code, i.barcode, b.name, cat.name, s.name
             ORDER BY net_sales DESC"
        );
        $stmt->execute(['b' => $this->resolveBranchId($claims), 'from' => $from, 'to' => $to]);

        $this->output($claims, [
            'item_name' => 'Item', 'item_code' => 'SKU', 'barcode' => 'Barcode',
            'brand_name' => 'Brand', 'category_name' => 'Category', 'supplier_name' => 'Supplier',
            'quantity' => 'Qty Sold', 'gross_sales' => 'Gross Sales', 'discount' => 'Discount',
            'gst' => 'GST', 'net_sales' => 'Net Sales',
        ], $stmt->fetchAll(), 'item_wise_sales.xlsx');
    }

    /**
     * Shared "gross/discount/gst/net" aggregate columns used by every
     * wise-sales report below. Mirrors InvoiceModel::priceLine()'s own math:
     * gross = qty*rate, net = line_total (already gross-discount) + tax.
     */
    private const SALES_AGGREGATE_SQL =
        "SUM(ii.qty) AS quantity,
         SUM(ii.qty * ii.rate) AS gross_sales,
         SUM(ii.discount_amount) AS discount,
         SUM(ii.tax_amount) AS gst,
         SUM(ii.line_total + ii.tax_amount) AS net_sales";

    /** Cross-branch view for users who can switch branch context; otherwise the caller's own branch only. */
    private function branchScopeSql(array $claims, string $alias = 'inv'): array
    {
        $canSwitch = in_array('branches.switch_context', (array) ($claims['permissions'] ?? []), true);
        if ($canSwitch && !isset($_GET['branch_id'])) {
            return ['', []];
        }
        return [" AND {$alias}.branch_id = :b", ['b' => $this->resolveBranchId($claims)]];
    }

    public function branchWiseSales(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.view_all');
        [$from, $to] = $this->dateRange();
        [$scopeSql, $scopeParams] = $this->branchScopeSql($claims);

        $stmt = $this->pdo->prepare(
            "SELECT br.branch_name AS branch_name,
                    COUNT(DISTINCT inv.id) AS total_bills,
                    COUNT(DISTINCT ii.item_id) AS total_items,
                    " . self::SALES_AGGREGATE_SQL . ",
                    MAX(pay.paid_amount) AS paid_amount, MAX(pay.credit_amount) AS credit_amount
             FROM invoice_items ii
             JOIN invoices inv ON inv.id = ii.invoice_id
             JOIN branches br ON br.id = inv.branch_id
             LEFT JOIN (
                 SELECT branch_id, SUM(paid_amount) AS paid_amount, SUM(balance_due) AS credit_amount
                 FROM invoices
                 WHERE status = 'completed' AND invoice_date BETWEEN :from2 AND :to2
                 GROUP BY branch_id
             ) pay ON pay.branch_id = inv.branch_id
             WHERE inv.status = 'completed' AND inv.invoice_date BETWEEN :from AND :to{$scopeSql}
             GROUP BY inv.branch_id, br.branch_name
             ORDER BY net_sales DESC"
        );
        $stmt->execute(['from' => $from, 'to' => $to, 'from2' => $from, 'to2' => $to, ...$scopeParams]);

        $this->output($claims, [
            'branch_name' => 'Branch', 'total_bills' => 'Total Bills', 'total_items' => 'Total Items',
            'quantity' => 'Quantity', 'gross_sales' => 'Gross Sales', 'discount' => 'Discount',
            'gst' => 'GST', 'net_sales' => 'Net Sales', 'paid_amount' => 'Paid Amount', 'credit_amount' => 'Credit Amount',
        ], $stmt->fetchAll(), 'branch_wise_sales.xlsx');
    }

    public function routeWiseSales(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.view_all');
        [$from, $to] = $this->dateRange();

        $stmt = $this->pdo->prepare(
            "SELECT COALESCE(r.name, 'Unassigned') AS route_name,
                    COUNT(DISTINCT inv.id) AS total_bills,
                    COUNT(DISTINCT inv.customer_id) AS customers,
                    " . self::SALES_AGGREGATE_SQL . ",
                    MAX(pay.paid_amount) AS paid_amount, MAX(pay.credit_amount) AS credit_amount
             FROM invoice_items ii
             JOIN invoices inv ON inv.id = ii.invoice_id
             LEFT JOIN customers c ON c.id = inv.customer_id
             LEFT JOIN routes r ON r.id = c.route_id
             LEFT JOIN (
                 SELECT cu.route_id, SUM(iv.paid_amount) AS paid_amount, SUM(iv.balance_due) AS credit_amount
                 FROM invoices iv
                 LEFT JOIN customers cu ON cu.id = iv.customer_id
                 WHERE iv.status = 'completed' AND iv.invoice_date BETWEEN :from2 AND :to2
                 GROUP BY cu.route_id
             ) pay ON pay.route_id <=> c.route_id
             WHERE inv.branch_id = :b AND inv.status = 'completed' AND inv.invoice_date BETWEEN :from AND :to
             GROUP BY c.route_id, r.name
             ORDER BY net_sales DESC"
        );
        $stmt->execute(['b' => $this->resolveBranchId($claims), 'from' => $from, 'to' => $to, 'from2' => $from, 'to2' => $to]);

        $this->output($claims, [
            'route_name' => 'Route', 'total_bills' => 'Total Bills', 'customers' => 'Customers',
            'quantity' => 'Quantity', 'gross_sales' => 'Gross Sales', 'discount' => 'Discount',
            'gst' => 'GST', 'net_sales' => 'Net Sales', 'paid_amount' => 'Paid Amount', 'credit_amount' => 'Credit Amount',
        ], $stmt->fetchAll(), 'route_wise_sales.xlsx');
    }

    public function customerWiseSales(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.view_all');
        [$from, $to] = $this->dateRange();

        $stmt = $this->pdo->prepare(
            "SELECT c.id AS customer_code, c.ledger_name AS customer_name,
                    br.branch_name AS branch_name, COALESCE(r.name, 'Unassigned') AS route_name,
                    COUNT(DISTINCT inv.id) AS bills,
                    COUNT(DISTINCT ii.item_id) AS items,
                    " . self::SALES_AGGREGATE_SQL . ",
                    MAX(pay.paid_amount) AS paid_amount, MAX(pay.credit_amount) AS credit_amount
             FROM invoice_items ii
             JOIN invoices inv ON inv.id = ii.invoice_id
             JOIN customers c ON c.id = inv.customer_id
             JOIN branches br ON br.id = c.branch_id
             LEFT JOIN routes r ON r.id = c.route_id
             LEFT JOIN (
                 SELECT customer_id, SUM(paid_amount) AS paid_amount, SUM(balance_due) AS credit_amount
                 FROM invoices
                 WHERE branch_id = :b2 AND status = 'completed' AND invoice_date BETWEEN :from2 AND :to2
                 GROUP BY customer_id
             ) pay ON pay.customer_id = c.id
             WHERE inv.branch_id = :b AND inv.status = 'completed' AND inv.invoice_date BETWEEN :from AND :to
             GROUP BY c.id, c.ledger_name, br.branch_name, r.name
             ORDER BY net_sales DESC"
        );
        $branchId = $this->resolveBranchId($claims);
        $stmt->execute(['b' => $branchId, 'b2' => $branchId, 'from' => $from, 'to' => $to, 'from2' => $from, 'to2' => $to]);

        $this->output($claims, [
            'customer_code' => 'Customer Code', 'customer_name' => 'Customer', 'branch_name' => 'Branch', 'route_name' => 'Route',
            'bills' => 'Bills', 'items' => 'Items',
            'quantity' => 'Quantity', 'gross_sales' => 'Gross Sales', 'discount' => 'Discount',
            'gst' => 'GST', 'net_sales' => 'Net Sales', 'paid_amount' => 'Paid Amount', 'credit_amount' => 'Credit Amount',
        ], $stmt->fetchAll(), 'customer_wise_sales.xlsx');
    }

    public function supplierWiseSales(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.view_all');
        [$from, $to] = $this->dateRange();

        $stmt = $this->pdo->prepare(
            "SELECT s.name AS supplier_name,
                    COUNT(DISTINCT ii.item_id) AS items_sold,
                    " . self::SALES_AGGREGATE_SQL . "
             FROM invoice_items ii
             JOIN invoices inv ON inv.id = ii.invoice_id
             JOIN items i ON i.id = ii.item_id
             JOIN suppliers s ON s.id = i.supplier_id
             WHERE inv.branch_id = :b AND inv.status = 'completed' AND inv.invoice_date BETWEEN :from AND :to
             GROUP BY s.id, s.name
             ORDER BY net_sales DESC"
        );
        $stmt->execute(['b' => $this->resolveBranchId($claims), 'from' => $from, 'to' => $to]);

        $this->output($claims, [
            'supplier_name' => 'Supplier', 'items_sold' => 'Items Sold', 'quantity' => 'Quantity',
            'gross_sales' => 'Gross Sales', 'discount' => 'Discount', 'gst' => 'GST', 'net_sales' => 'Net Sales',
        ], $stmt->fetchAll(), 'supplier_wise_sales.xlsx');
    }

    public function brandWiseSales(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.view_all');
        [$from, $to] = $this->dateRange();

        $stmt = $this->pdo->prepare(
            "SELECT b.name AS brand_name,
                    COUNT(DISTINCT ii.item_id) AS items_sold,
                    " . self::SALES_AGGREGATE_SQL . "
             FROM invoice_items ii
             JOIN invoices inv ON inv.id = ii.invoice_id
             JOIN items i ON i.id = ii.item_id
             JOIN brands b ON b.id = i.brand_id
             WHERE inv.branch_id = :b AND inv.status = 'completed' AND inv.invoice_date BETWEEN :from AND :to
             GROUP BY b.id, b.name
             ORDER BY net_sales DESC"
        );
        $stmt->execute(['b' => $this->resolveBranchId($claims), 'from' => $from, 'to' => $to]);

        $this->output($claims, [
            'brand_name' => 'Brand', 'items_sold' => 'Items Sold', 'quantity' => 'Quantity',
            'gross_sales' => 'Gross Sales', 'discount' => 'Discount', 'gst' => 'GST', 'net_sales' => 'Net Sales',
        ], $stmt->fetchAll(), 'brand_wise_sales.xlsx');
    }

    public function categoryWiseSales(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.view_all');
        [$from, $to] = $this->dateRange();

        $stmt = $this->pdo->prepare(
            "SELECT cat.name AS category_name,
                    COUNT(DISTINCT ii.item_id) AS items_sold,
                    " . self::SALES_AGGREGATE_SQL . "
             FROM invoice_items ii
             JOIN invoices inv ON inv.id = ii.invoice_id
             JOIN items i ON i.id = ii.item_id
             JOIN categories cat ON cat.id = i.category_id
             WHERE inv.branch_id = :b AND inv.status = 'completed' AND inv.invoice_date BETWEEN :from AND :to
             GROUP BY cat.id, cat.name
             ORDER BY net_sales DESC"
        );
        $stmt->execute(['b' => $this->resolveBranchId($claims), 'from' => $from, 'to' => $to]);

        $this->output($claims, [
            'category_name' => 'Category', 'items_sold' => 'Items Sold', 'quantity' => 'Quantity',
            'gross_sales' => 'Gross Sales', 'discount' => 'Discount', 'gst' => 'GST', 'net_sales' => 'Net Sales',
        ], $stmt->fetchAll(), 'category_wise_sales.xlsx');
    }

    public function brandCategoryWiseSales(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.view_all');
        [$from, $to] = $this->dateRange();

        $stmt = $this->pdo->prepare(
            "SELECT b.name AS brand_name, cat.name AS category_name,
                    COUNT(DISTINCT ii.item_id) AS items_sold,
                    " . self::SALES_AGGREGATE_SQL . "
             FROM invoice_items ii
             JOIN invoices inv ON inv.id = ii.invoice_id
             JOIN items i ON i.id = ii.item_id
             JOIN brands b ON b.id = i.brand_id
             JOIN categories cat ON cat.id = i.category_id
             WHERE inv.branch_id = :b AND inv.status = 'completed' AND inv.invoice_date BETWEEN :from AND :to
             GROUP BY b.id, b.name, cat.id, cat.name
             ORDER BY net_sales DESC"
        );
        $stmt->execute(['b' => $this->resolveBranchId($claims), 'from' => $from, 'to' => $to]);

        $this->output($claims, [
            'brand_name' => 'Brand', 'category_name' => 'Category', 'items_sold' => 'Items Sold', 'quantity' => 'Quantity',
            'gross_sales' => 'Gross Sales', 'discount' => 'Discount', 'gst' => 'GST', 'net_sales' => 'Net Sales',
        ], $stmt->fetchAll(), 'brand_category_wise_sales.xlsx');
    }

    /** Credit Outstanding & Limit Check — customers over credit_limit, sorted by days overdue. */
    public function creditOutstanding(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'credit.view_shopwide_outstanding');

        $stmt = $this->pdo->prepare(
            "SELECT c.ledger_name AS customer_name, c.phone, c.credit_limit,
                    COALESCE(SUM(i.balance_due), 0) AS total_outstanding,
                    MIN(i.invoice_date) AS oldest_unpaid_date,
                    DATEDIFF(CURDATE(), MIN(i.invoice_date)) AS days_overdue
             FROM customers c
             JOIN invoices i ON i.customer_id = c.id AND i.status = 'completed' AND i.balance_due > 0.009
             WHERE c.branch_id = :b
             GROUP BY c.id, c.ledger_name, c.phone, c.credit_limit
             ORDER BY days_overdue DESC"
        );
        $stmt->execute(['b' => $this->resolveBranchId($claims)]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $r['over_limit'] = (float) $r['total_outstanding'] > (float) $r['credit_limit'] ? 'Yes' : 'No';
        }

        $this->output($claims, [
            'customer_name' => 'Customer', 'phone' => 'Phone', 'credit_limit' => 'Credit Limit',
            'total_outstanding' => 'Outstanding', 'days_overdue' => 'Days Overdue', 'over_limit' => 'Over Limit?',
        ], $rows, 'credit_outstanding.xlsx');
    }

    public function expenseIncome(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.view_all');
        [$from, $to] = $this->dateRange();
        $branchId = $this->resolveBranchId($claims);

        $stmt = $this->pdo->prepare(
            "SELECT 'Expense' AS type, e.expense_no AS ref_no, ec.name AS category, e.amount, e.description, e.expense_date AS ref_date
             FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id
             WHERE e.branch_id = :b AND e.expense_date BETWEEN :from AND :to
             UNION ALL
             SELECT 'Income' AS type, oi.receipt_no AS ref_no, 'Other Income' AS category, oi.amount, oi.description, oi.income_date AS ref_date
             FROM other_income oi
             WHERE oi.branch_id = :b2 AND oi.income_date BETWEEN :from2 AND :to2
             ORDER BY ref_date
             LIMIT " . self::LIST_REPORT_ROW_CAP
        );
        $stmt->execute(['b' => $branchId, 'from' => $from, 'to' => $to, 'b2' => $branchId, 'from2' => $from, 'to2' => $to]);

        $this->output($claims, [
            'type' => 'Type', 'ref_no' => 'Reference #', 'category' => 'Category',
            'amount' => 'Amount', 'description' => 'Description', 'ref_date' => 'Date',
        ], $stmt->fetchAll(), 'expense_income.xlsx');
    }

    /**
     * Gross Profitability — Revenue (taxable value, tax excluded per rule 5)
     * minus COGS minus Expenses. COGS uses each item's *current* cost_price
     * as an approximation — invoice_items doesn't snapshot cost_price, only
     * the sale rate, so a cost-price change shifts this report retroactively.
     * See README assumptions.
     */
    public function profitReport(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.view_profit');
        [$from, $to] = $this->dateRange();
        $branchId = $this->resolveBranchId($claims);

        $scalar = function (string $sql, array $params) {
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            return (float) $stmt->fetchColumn();
        };

        $revenue = $scalar(
            "SELECT COALESCE(SUM(taxable_value),0) FROM invoices
             WHERE branch_id = :b AND status = 'completed' AND invoice_date BETWEEN :from AND :to",
            ['b' => $branchId, 'from' => $from, 'to' => $to]
        );
        $cogs = $scalar(
            "SELECT COALESCE(SUM(ii.qty * i.cost_price),0)
             FROM invoice_items ii
             JOIN invoices inv ON inv.id = ii.invoice_id
             JOIN items i ON i.id = ii.item_id
             WHERE inv.branch_id = :b AND inv.status = 'completed' AND inv.invoice_date BETWEEN :from AND :to",
            ['b' => $branchId, 'from' => $from, 'to' => $to]
        );
        $expenses = $scalar(
            "SELECT COALESCE(SUM(amount),0) FROM expenses WHERE branch_id = :b AND expense_date BETWEEN :from AND :to",
            ['b' => $branchId, 'from' => $from, 'to' => $to]
        );

        $result = [
            'revenue' => round($revenue, 2),
            'cogs' => round($cogs, 2),
            'gross_profit' => round($revenue - $cogs, 2),
            'expenses' => round($expenses, 2),
            'net_profit' => round($revenue - $cogs - $expenses, 2),
            'from' => $from,
            'to' => $to,
        ];

        // Single-object response — export wraps it as the one row a P&L
        // summary actually is, without changing the normal JSON shape above.
        if (!empty($_GET['export'])) {
            PermissionMiddleware::require($claims, 'reports.export_excel');
            TableExporter::export([
                'revenue' => 'Revenue (ex-tax)', 'cogs' => 'COGS', 'gross_profit' => 'Gross Profit',
                'expenses' => 'Expenses', 'net_profit' => 'Net Profit', 'from' => 'From', 'to' => 'To',
            ], [$result], 'profit.xlsx');
        }

        Response::json($result);
    }

    /**
     * Invoice-wise Profit/Loss — the "B" mode alongside profitReport()'s
     * date-wise summary ("A" mode), same Reports > Profits section, same
     * reports.view_profit permission. One row per invoice line (item-level
     * detail), invoice-level fields (paid/credit/customer) repeated on every
     * line of that invoice — the standard flattened shape every other report
     * in this file already uses (see SALES_AGGREGATE_SQL), not a nested
     * per-invoice structure.
     *
     * Profit is NOT paid_amount minus cost — a credit invoice's profit is
     * recognized at the completed sale (rule 23/H), same as revenue; later
     * collecting the credit doesn't touch this report at all (collections
     * only move paid_amount/balance_due on the invoice, and this query reads
     * qty/rate/discount/line_total straight from invoice_items, none of
     * which a payment collection ever writes to). GST is excluded from
     * profit (line_total is post-discount, pre-tax) — the same rule 5 basis
     * profitReport() already uses. COGS uses each item's *current*
     * cost_price, the same documented approximation profitReport() uses
     * (invoice_items has no cost snapshot) — see README assumptions.
     */
    public function invoiceWiseProfitReport(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.view_profit');
        [$from, $to] = $this->dateRange();
        $branchId = $this->resolveBranchId($claims);

        $stmt = $this->pdo->prepare(
            "SELECT
                inv.invoice_no, inv.invoice_date, COALESCE(c.ledger_name, 'Walk-in') AS customer_name,
                i.item_name, ii.qty,
                i.cost_price AS cost_price,
                ROUND(ii.qty * i.cost_price, 2) AS cost_amount,
                ii.rate AS selling_price,
                ROUND(ii.qty * ii.rate, 2) AS gross_amount,
                ii.discount_amount AS discount,
                ii.tax_amount AS gst,
                ii.line_total AS taxable_amount,
                ROUND(ii.line_total + ii.tax_amount + ii.cess_amount, 2) AS net_amount,
                inv.paid_amount AS invoice_paid_amount,
                inv.balance_due AS invoice_credit_amount,
                ROUND(ii.line_total - (ii.qty * i.cost_price), 2) AS profit_loss
             FROM invoice_items ii
             JOIN invoices inv ON inv.id = ii.invoice_id
             JOIN items i ON i.id = ii.item_id
             LEFT JOIN customers c ON c.id = inv.customer_id
             WHERE inv.branch_id = :b AND inv.status = 'completed' AND inv.invoice_date BETWEEN :from AND :to
             ORDER BY inv.invoice_date, inv.id, ii.id
             LIMIT " . self::LIST_REPORT_ROW_CAP
        );
        $stmt->execute(['b' => $branchId, 'from' => $from, 'to' => $to]);
        $rows = $stmt->fetchAll();

        $this->output($claims, [
            'invoice_no' => 'Invoice #', 'invoice_date' => 'Date', 'customer_name' => 'Customer',
            'item_name' => 'Item', 'qty' => 'Qty',
            'cost_price' => 'Cost Price', 'cost_amount' => 'Cost Amount',
            'selling_price' => 'Selling Price', 'gross_amount' => 'Gross Amount',
            'discount' => 'Discount', 'gst' => 'GST', 'net_amount' => 'Net Amount',
            'invoice_paid_amount' => 'Paid Amount', 'invoice_credit_amount' => 'Credit Amount',
            'profit_loss' => 'Profit / Loss',
        ], $rows, 'invoice_wise_profit.xlsx');
    }

private function parseFinancialSummaryDateRange(): array
    {
        $preset = $_GET['preset'] ?? null;
        $from = $_GET['from'] ?? null;
        $to = $_GET['to'] ?? null;

        if ($preset === 'this_week') {
            $from = date('Y-m-d', strtotime('monday this week'));
            $to = date('Y-m-d');
        } elseif ($preset === 'this_month') {
            $from = date('Y-m-01');
            $to = date('Y-m-d');
        } else {
            if (empty($from)) {
                $from = date('Y-m-01');
            }
            if (empty($to)) {
                $to = date('Y-m-d');
            }
        }

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $to)) {
            Response::error("Invalid date format for 'from' or 'to'. Expected YYYY-MM-DD.", 422);
        }

        [$y1, $m1, $d1] = explode('-', (string) $from);
        [$y2, $m2, $d2] = explode('-', (string) $to);
        if (!checkdate((int) $m1, (int) $d1, (int) $y1) || !checkdate((int) $m2, (int) $d2, (int) $y2)) {
            Response::error("Invalid calendar date in 'from' or 'to'.", 422);
        }

        if ($from > $to) {
            Response::error("Invalid date range: 'from' date must be less than or equal to 'to' date.", 422);
        }

        $diffDays = (strtotime((string) $to) - strtotime((string) $from)) / 86400;
        if ($diffDays > 1826) {
            Response::error("Date range cannot exceed 5 years.", 422);
        }

        return [$from, $to, $preset ?? 'custom'];
    }

    public function financialSummary(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $canViewFinancials = in_array('dashboard.view_financial_summary', (array) ($claims['permissions'] ?? []), true)
            || in_array('reports.view_all', (array) ($claims['permissions'] ?? []), true)
            || in_array('*', (array) ($claims['permissions'] ?? []), true);
        if (!$canViewFinancials) {
            Response::error('Forbidden: insufficient permissions to view financial summary', 403);
        }

        $canViewCost = in_array('purchases.view_purchase_cost', (array) ($claims['permissions'] ?? []), true)
            || in_array('*', (array) ($claims['permissions'] ?? []), true);
        $canViewProfit = in_array('reports.view_profit', (array) ($claims['permissions'] ?? []), true)
            || in_array('*', (array) ($claims['permissions'] ?? []), true);

        [$from, $to, $preset] = $this->parseFinancialSummaryDateRange();
        $branchId = $this->resolveBranchId($claims);
        $warnings = [];

        // 1. Invoices (Completed)
        $stmt = $this->pdo->prepare(
            "SELECT
                COALESCE(SUM(CASE WHEN taxable_value > 0 THEN taxable_value ELSE grand_total END), 0) AS revenue,
                COALESCE(SUM(grand_total), 0) AS gross_sales,
                COALESCE(SUM(paid_amount), 0) AS cash_sales,
                COALESCE(SUM(balance_due), 0) AS credit_sales,
                COALESCE(SUM(cgst_amount + sgst_amount + igst_amount + cess_amount), 0) AS tax_collected,
                COUNT(*) AS invoice_count
             FROM invoices
             WHERE branch_id = :b AND status = 'completed' AND invoice_date BETWEEN :from AND :to"
        );
        $stmt->execute(['b' => $branchId, 'from' => $from, 'to' => $to]);
        $invData = $stmt->fetch();

        // 2. Sales Returns
        $stmt = $this->pdo->prepare(
            "SELECT COALESCE(SUM(return_total), 0) AS returns_total, COUNT(*) AS returns_count
             FROM sales_returns
             WHERE branch_id = :b AND status = 'approved' AND DATE(created_at) BETWEEN :from AND :to"
        );
        $stmt->execute(['b' => $branchId, 'from' => $from, 'to' => $to]);
        $salesReturnsData = $stmt->fetch();

        $grossSales = (string) ($invData['gross_sales'] ?? '0');
        $returnsTotal = (string) ($salesReturnsData['returns_total'] ?? '0');
        $netSales = bcsub($grossSales, $returnsTotal, 2);
        if (bccomp($netSales, '0', 2) < 0) {
            $netSales = '0.00';
        }

        // 3. Operating Expenses & Extra Income
        $stmt = $this->pdo->prepare("SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE branch_id = :b AND expense_date BETWEEN :from AND :to");
        $stmt->execute(['b' => $branchId, 'from' => $from, 'to' => $to]);
        $operatingExpenses = (string) $stmt->fetchColumn();

        $stmt = $this->pdo->prepare("SELECT COALESCE(SUM(amount), 0) FROM other_income WHERE branch_id = :b AND income_date BETWEEN :from AND :to");
        $stmt->execute(['b' => $branchId, 'from' => $from, 'to' => $to]);
        $extraIncome = (string) $stmt->fetchColumn();

        // 4. Collections
        $stmt = $this->pdo->prepare("SELECT COALESCE(SUM(amount), 0) FROM customer_collections WHERE branch_id = :b AND DATE(collected_at) BETWEEN :from AND :to");
        $stmt->execute(['b' => $branchId, 'from' => $from, 'to' => $to]);
        $collections = (string) $stmt->fetchColumn();

        // 5. Customer & Supplier Outstandings
        $stmt = $this->pdo->prepare("SELECT COALESCE(SUM(balance_due), 0) FROM invoices WHERE branch_id = :b AND status = 'completed'");
        $stmt->execute(['b' => $branchId]);
        $customerOutstanding = (string) $stmt->fetchColumn();

        $stmt = $this->pdo->prepare("SELECT COALESCE(SUM(pending_balance), 0) FROM purchases WHERE branch_id = :b AND status = 'active'");
        $stmt->execute(['b' => $branchId]);
        $supplierOutstanding = (string) $stmt->fetchColumn();

        // 6. Inventory Valuation
        $inventoryValuation = '0.00';
        if ($canViewCost) {
            $stmt = $this->pdo->prepare(
                "SELECT COALESCE(SUM(sl.quantity_on_hand * i.cost_price), 0)
                 FROM stock_ledger sl JOIN items i ON i.id = sl.item_id
                 WHERE sl.owner_type = 'branch' AND sl.owner_id = :b"
            );
            $stmt->execute(['b' => $branchId]);
            $inventoryValuation = (string) $stmt->fetchColumn();
        }

        // 7. Low Stock Count
        $stmt = $this->pdo->prepare(
            "SELECT COUNT(*) FROM (
                SELECT i.id
                FROM items i
                LEFT JOIN stock_ledger sl ON sl.item_id = i.id AND sl.owner_type = 'branch' AND sl.owner_id = :b
                WHERE i.is_active = 1
                GROUP BY i.id, i.min_stock_threshold
                HAVING COALESCE(SUM(sl.quantity_on_hand), 0) <= i.min_stock_threshold
            ) t"
        );
        $stmt->execute(['b' => $branchId]);
        $lowStockCount = (int) $stmt->fetchColumn();

        // 8. Profit Card (COGS & Margins)
        $profitCard = null;
        if ($canViewProfit) {
            $stmt = $this->pdo->prepare(
                "SELECT
                    COALESCE(SUM(ii.qty * COALESCE(i.cost_price, 0)), 0) AS sold_cogs,
                    COALESCE(SUM(CASE WHEN i.cost_price IS NULL OR i.cost_price <= 0 THEN 1 ELSE 0 END), 0) AS missing_cost_lines
                 FROM invoice_items ii
                 JOIN invoices inv ON inv.id = ii.invoice_id
                 LEFT JOIN items i ON i.id = ii.item_id
                 WHERE inv.branch_id = :b AND inv.status = 'completed' AND inv.invoice_date BETWEEN :from AND :to"
            );
            $stmt->execute(['b' => $branchId, 'from' => $from, 'to' => $to]);
            $cogsRow = $stmt->fetch();
            $soldCogs = (string) ($cogsRow['sold_cogs'] ?? '0');
            $missingCostLines = (int) ($cogsRow['missing_cost_lines'] ?? 0);

            // Return COGS reversal
            $stmt = $this->pdo->prepare(
                "SELECT COALESCE(SUM(sri.qty * COALESCE(i.cost_price, 0)), 0) AS return_cogs
                 FROM sales_return_items sri
                 JOIN sales_returns sr ON sr.id = sri.sales_return_id
                 LEFT JOIN items i ON i.id = sri.item_id
                 WHERE sr.branch_id = :b AND sr.status = 'approved' AND DATE(sr.created_at) BETWEEN :from AND :to"
            );
            $stmt->execute(['b' => $branchId, 'from' => $from, 'to' => $to]);
            $returnCogs = (string) $stmt->fetchColumn();

            $netCogs = bcsub($soldCogs, $returnCogs, 2);
            if (bccomp($netCogs, '0', 2) < 0) {
                $netCogs = '0.00';
            }

            $revenue = (string) ($invData['revenue'] ?? '0');
            $grossProfit = bcsub($revenue, $netCogs, 2);
            $netProfit = bcsub($grossProfit, $operatingExpenses, 2);

            $marginPct = '0.00';
            if (bccomp($revenue, '0', 2) > 0) {
                $marginPct = bcmul(bcdiv($grossProfit, $revenue, 4), '100', 2);
            }

            if ($missingCostLines > 0) {
                $warnings[] = "Cost missing on {$missingCostLines} sale item line(s); profit is marked as an estimate based on current available cost.";
            }

            $profitCard = [
                'revenue' => number_format((float) $revenue, 2, '.', ''),
                'cogs' => number_format((float) $netCogs, 2, '.', ''),
                'gross_profit' => number_format((float) $grossProfit, 2, '.', ''),
                'expenses' => number_format((float) $operatingExpenses, 2, '.', ''),
                'net_profit' => number_format((float) $netProfit, 2, '.', ''),
                'margin_percent' => number_format((float) $marginPct, 2, '.', ''),
                'missing_cost_lines' => $missingCostLines,
                'is_estimate' => $missingCostLines > 0,
            ];
        }

        // 9. Product Loss Card
        $stmt = $this->pdo->prepare(
            "SELECT
                COUNT(*) AS record_count,
                COALESCE(SUM(sa.qty), 0) AS total_qty,
                COALESCE(SUM(sa.qty * COALESCE(i.cost_price, 0)), 0) AS total_value,
                COALESCE(SUM(CASE WHEN i.cost_price IS NULL OR i.cost_price <= 0 THEN 1 ELSE 0 END), 0) AS missing_cost_records
             FROM stock_adjustments sa
             LEFT JOIN items i ON i.id = sa.item_id
             WHERE sa.owner_type = 'branch' AND sa.owner_id = :b
               AND sa.adjustment_type = 'deduction'
               AND sa.reason IN ('damage', 'spoilage')
               AND DATE(sa.created_at) BETWEEN :from AND :to"
        );
        $stmt->execute(['b' => $branchId, 'from' => $from, 'to' => $to]);
        $lossData = $stmt->fetch();
        $missingLossRecords = (int) ($lossData['missing_cost_records'] ?? 0);
        if ($missingLossRecords > 0) {
            $warnings[] = "Cost missing on {$missingLossRecords} product loss record(s).";
        }
        $productLossCard = [
            'loss_qty' => number_format((float) ($lossData['total_qty'] ?? 0), 2, '.', ''),
            'loss_value' => $canViewCost ? number_format((float) ($lossData['total_value'] ?? 0), 2, '.', '') : null,
            'record_count' => (int) ($lossData['record_count'] ?? 0),
            'missing_cost_records' => $missingLossRecords,
        ];

        // 10. Stock Purchase Card
        $stmt = $this->pdo->prepare(
            "SELECT
                COUNT(p.id) AS purchase_count,
                COALESCE(SUM(p.grand_total), 0) AS purchase_total,
                COALESCE(SUM(pi_agg.qty), 0) AS purchase_qty
             FROM purchases p
             LEFT JOIN (
                 SELECT purchase_id, SUM(qty) AS qty FROM purchase_items GROUP BY purchase_id
             ) pi_agg ON pi_agg.purchase_id = p.id
             WHERE p.branch_id = :b AND p.status = 'active' AND p.purchase_date BETWEEN :from AND :to"
        );
        $stmt->execute(['b' => $branchId, 'from' => $from, 'to' => $to]);
        $purchData = $stmt->fetch();

        $stmt = $this->pdo->prepare(
            "SELECT COUNT(*) AS returns_count, COALESCE(SUM(return_total), 0) AS returns_total
             FROM purchase_returns
             WHERE branch_id = :b AND DATE(created_at) BETWEEN :from AND :to"
        );
        $stmt->execute(['b' => $branchId, 'from' => $from, 'to' => $to]);
        $purchReturnsData = $stmt->fetch();

        $purchGross = (string) ($purchData['purchase_total'] ?? '0');
        $purchRet = (string) ($purchReturnsData['returns_total'] ?? '0');
        $netPurchased = bcsub($purchGross, $purchRet, 2);
        if (bccomp($netPurchased, '0', 2) < 0) {
            $netPurchased = '0.00';
        }

        $stockPurchaseCard = [
            'purchase_count' => (int) ($purchData['purchase_count'] ?? 0),
            'purchase_qty' => number_format((float) ($purchData['purchase_qty'] ?? 0), 2, '.', ''),
            'purchase_total' => $canViewCost ? number_format((float) $purchGross, 2, '.', '') : null,
            'returns_count' => (int) ($purchReturnsData['returns_count'] ?? 0),
            'returns_total' => $canViewCost ? number_format((float) $purchRet, 2, '.', '') : null,
            'net_purchased' => $canViewCost ? number_format((float) $netPurchased, 2, '.', '') : null,
        ];

        // 11. Stock Adjustment Card
        $stmt = $this->pdo->prepare(
            "SELECT
                COUNT(*) AS total_adjustments,
                COALESCE(SUM(CASE WHEN adjustment_type = 'addition' THEN qty ELSE 0 END), 0) AS addition_qty,
                COALESCE(SUM(CASE WHEN adjustment_type = 'deduction' THEN qty ELSE 0 END), 0) AS deduction_qty,
                COALESCE(SUM(CASE WHEN adjustment_type = 'deduction' AND reason IN ('damage', 'spoilage') THEN qty ELSE 0 END), 0) AS loss_qty
             FROM stock_adjustments
             WHERE owner_type = 'branch' AND owner_id = :b AND DATE(created_at) BETWEEN :from AND :to"
        );
        $stmt->execute(['b' => $branchId, 'from' => $from, 'to' => $to]);
        $adjData = $stmt->fetch();

        $addQty = (float) ($adjData['addition_qty'] ?? 0);
        $dedQty = (float) ($adjData['deduction_qty'] ?? 0);
        $lossQty = (float) ($adjData['loss_qty'] ?? 0);
        $nonLossDedQty = $dedQty - $lossQty;
        $netAdjQty = $addQty - $dedQty;

        $stockAdjustmentCard = [
            'total_adjustments' => (int) ($adjData['total_adjustments'] ?? 0),
            'addition_qty' => number_format($addQty, 2, '.', ''),
            'deduction_qty' => number_format($dedQty, 2, '.', ''),
            'loss_qty' => number_format($lossQty, 2, '.', ''),
            'non_loss_deduction_qty' => number_format($nonLossDedQty, 2, '.', ''),
            'net_adjustment_qty' => number_format($netAdjQty, 2, '.', ''),
            'loss_label' => 'counted in Product Loss',
        ];

        // 12. Order Management Card
        $stmt = $this->pdo->prepare(
            "SELECT
                COUNT(*) AS total_orders,
                COALESCE(SUM(CASE WHEN cp.status != 'cancelled' THEN cpi_agg.total_amt ELSE 0 END), 0) AS active_orders_value,
                COALESCE(SUM(CASE WHEN cp.status = 'cancelled' THEN cpi_agg.total_amt ELSE 0 END), 0) AS cancelled_orders_value,
                COALESCE(SUM(CASE WHEN cp.status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_count,
                COALESCE(SUM(CASE WHEN cp.status = 'confirmed' THEN 1 ELSE 0 END), 0) AS confirmed_count,
                COALESCE(SUM(CASE WHEN cp.status = 'processing' THEN 1 ELSE 0 END), 0) AS processing_count,
                COALESCE(SUM(CASE WHEN cp.status = 'ready' THEN 1 ELSE 0 END), 0) AS ready_count,
                COALESCE(SUM(CASE WHEN cp.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_count,
                COALESCE(SUM(CASE WHEN cp.status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled_count
             FROM customer_prebookings cp
             LEFT JOIN (
                 SELECT prebooking_id, SUM(qty * rate * (1 + tax_percent / 100)) AS total_amt
                 FROM customer_prebooking_items
                 GROUP BY prebooking_id
             ) cpi_agg ON cpi_agg.prebooking_id = cp.id
             WHERE cp.branch_id = :b AND DATE(cp.created_at) BETWEEN :from AND :to"
        );
        $stmt->execute(['b' => $branchId, 'from' => $from, 'to' => $to]);
        $ordData = $stmt->fetch();

        $orderManagementCard = [
            'total_orders' => (int) ($ordData['total_orders'] ?? 0),
            'total_value' => number_format((float) ($ordData['active_orders_value'] ?? 0), 2, '.', ''),
            'cancelled_orders_value' => number_format((float) ($ordData['cancelled_orders_value'] ?? 0), 2, '.', ''),
            'pending_count' => (int) ($ordData['pending_count'] ?? 0),
            'confirmed_count' => (int) ($ordData['confirmed_count'] ?? 0),
            'processing_count' => (int) ($ordData['processing_count'] ?? 0),
            'ready_count' => (int) ($ordData['ready_count'] ?? 0),
            'completed_count' => (int) ($ordData['completed_count'] ?? 0),
            'cancelled_count' => (int) ($ordData['cancelled_count'] ?? 0),
        ];

        // Has Data check: are there any records in this period?
        $hasData = ((int) ($invData['invoice_count'] ?? 0) > 0)
            || ((int) ($purchData['purchase_count'] ?? 0) > 0)
            || ((int) ($adjData['total_adjustments'] ?? 0) > 0)
            || ((int) ($ordData['total_orders'] ?? 0) > 0)
            || (bccomp($operatingExpenses, '0', 2) > 0)
            || (bccomp($extraIncome, '0', 2) > 0);

        Response::json([
            'range' => [
                'from' => $from,
                'to' => $to,
                'preset' => $preset,
                'timezone' => date_default_timezone_get() ?: 'Asia/Kolkata',
            ],
            'cards' => [
                'total_sales_revenue' => number_format((float) $netSales, 2, '.', ''),
                'cash_sales' => number_format((float) ($invData['cash_sales'] ?? 0), 2, '.', ''),
                'credit_sales' => number_format((float) ($invData['credit_sales'] ?? 0), 2, '.', ''),
                'total_purchases' => $canViewCost ? number_format((float) $netPurchased, 2, '.', '') : null,
                'inventory_valuation' => $canViewCost ? number_format((float) $inventoryValuation, 2, '.', '') : null,
                'customer_net_outstanding' => number_format((float) $customerOutstanding, 2, '.', ''),
                'supplier_net_outstanding' => number_format((float) $supplierOutstanding, 2, '.', ''),
                'employee_collections_today' => number_format((float) $collections, 2, '.', ''),
                'operating_expenses_today' => number_format((float) $operatingExpenses, 2, '.', ''),
                'extra_income_today' => number_format((float) $extraIncome, 2, '.', ''),
                'low_stock_count' => $lowStockCount,
                // The 5 new cards
                'profit' => $profitCard,
                'product_loss' => $productLossCard,
                'stock_purchase' => $stockPurchaseCard,
                'stock_adjustment' => $stockAdjustmentCard,
                'order_management' => $orderManagementCard,
            ],
            'meta' => [
                'generated_at' => date('Y-m-d H:i:s'),
                'has_data' => $hasData,
                'warnings' => array_values(array_unique($warnings)),
            ],
        ]);
    }

public function profitDetail(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.view_profit');
        [$from, $to, $preset] = $this->parseFinancialSummaryDateRange();
        $branchId = $this->resolveBranchId($claims);

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int) ($_GET['limit'] ?? 10)));
        $offset = ($page - 1) * $limit;
        $search = trim((string) ($_GET['search'] ?? ''));

        $where = "inv.branch_id = :b AND inv.status = 'completed' AND inv.invoice_date BETWEEN :from AND :to";
        $params = ['b' => $branchId, 'from' => $from, 'to' => $to];

        if ($search !== '') {
            $where .= " AND (inv.invoice_no LIKE :s OR c.ledger_name LIKE :s OR i.item_name LIKE :s OR i.item_code LIKE :s)";
            $params['s'] = "%$search%";
        }

        // Count total rows
        $stmtCount = $this->pdo->prepare(
            "SELECT COUNT(*) FROM invoice_items ii
             JOIN invoices inv ON inv.id = ii.invoice_id
             LEFT JOIN items i ON i.id = ii.item_id
             LEFT JOIN customers c ON c.id = inv.customer_id
             WHERE $where"
        );
        $stmtCount->execute($params);
        $totalRows = (int) $stmtCount->fetchColumn();

        // Totals across entire filtered range
        $stmtTotals = $this->pdo->prepare(
            "SELECT
                COALESCE(SUM(ii.qty), 0) AS total_sold_qty,
                COALESCE(SUM(ii.line_total), 0) AS total_revenue,
                COALESCE(SUM(ii.qty * COALESCE(i.cost_price, 0)), 0) AS total_cogs,
                COALESCE(SUM(ii.line_total - (ii.qty * COALESCE(i.cost_price, 0))), 0) AS total_gross_profit,
                COALESCE(SUM(CASE WHEN i.cost_price IS NULL OR i.cost_price <= 0 THEN 1 ELSE 0 END), 0) AS missing_cost_lines
             FROM invoice_items ii
             JOIN invoices inv ON inv.id = ii.invoice_id
             LEFT JOIN items i ON i.id = ii.item_id
             LEFT JOIN customers c ON c.id = inv.customer_id
             WHERE $where"
        );
        $stmtTotals->execute($params);
        $tot = $stmtTotals->fetch();

        // Period expenses
        $stmtExp = $this->pdo->prepare("SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE branch_id = :b AND expense_date BETWEEN :from AND :to");
        $stmtExp->execute(['b' => $branchId, 'from' => $from, 'to' => $to]);
        $totalExpenses = (string) $stmtExp->fetchColumn();

        $grossProfit = (string) ($tot['total_gross_profit'] ?? '0');
        $netProfit = bcsub($grossProfit, $totalExpenses, 2);

        $sortWhitelist = [
            'invoice_date' => 'inv.invoice_date',
            'invoice_no' => 'inv.invoice_no',
            'customer_name' => 'c.ledger_name',
            'item_name' => 'i.item_name',
            'qty' => 'ii.qty',
            'selling_price' => 'ii.rate',
            'cost_price' => 'i.cost_price',
            'line_revenue' => 'ii.line_total',
            'profit' => '(ii.line_total - (ii.qty * COALESCE(i.cost_price, 0)))',
        ];
        $sortBy = $sortWhitelist[$_GET['sort_by'] ?? ''] ?? 'inv.invoice_date';
        $order = strtolower($_GET['order'] ?? 'desc') === 'asc' ? 'ASC' : 'DESC';

        // Fetch paginated rows
        $sql = "SELECT inv.invoice_no, inv.invoice_date, COALESCE(c.ledger_name, 'Walk-in') AS customer_name,
                       i.item_name, i.item_code, ii.qty,
                       COALESCE(i.cost_price, 0) AS cost_price,
                       ROUND(ii.qty * COALESCE(i.cost_price, 0), 2) AS line_cogs,
                       ii.rate AS selling_price,
                       ii.discount_amount AS discount,
                       ii.tax_amount AS tax,
                       ii.line_total AS line_revenue,
                       ROUND(ii.line_total - (ii.qty * COALESCE(i.cost_price, 0)), 2) AS profit,
                       CASE WHEN (i.cost_price IS NULL OR i.cost_price <= 0) THEN 'Missing' ELSE 'Available' END AS cost_status
                FROM invoice_items ii
                JOIN invoices inv ON inv.id = ii.invoice_id
                LEFT JOIN items i ON i.id = ii.item_id
                LEFT JOIN customers c ON c.id = inv.customer_id
                WHERE $where
                ORDER BY $sortBy $order, inv.id DESC, ii.id DESC
                LIMIT $limit OFFSET $offset";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $columns = [
            'invoice_no' => 'Invoice #',
            'invoice_date' => 'Date',
            'customer_name' => 'Customer',
            'item_name' => 'Item',
            'qty' => 'Sold Qty',
            'selling_price' => 'Selling Price',
            'cost_price' => 'Cost Price',
            'line_revenue' => 'Revenue',
            'line_cogs' => 'COGS',
            'profit' => 'Profit / Loss',
            'cost_status' => 'Cost Status',
        ];

        if (!empty($_GET['export'])) {
            PermissionMiddleware::require($claims, 'reports.export_excel');
            TableExporter::export($columns, $rows, 'profit_detail.xlsx');
        }

        $warnings = [];
        if ((int) ($tot['missing_cost_lines'] ?? 0) > 0) {
            $warnings[] = "Cost is missing on {$tot['missing_cost_lines']} item line(s). Profit figures are marked as estimates.";
        }

        Response::json([
            'columns' => $columns,
            'rows' => $rows,
            'totals' => [
                'total_sold_qty' => number_format((float) ($tot['total_sold_qty'] ?? 0), 2, '.', ''),
                'total_revenue' => number_format((float) ($tot['total_revenue'] ?? 0), 2, '.', ''),
                'total_cogs' => number_format((float) ($tot['total_cogs'] ?? 0), 2, '.', ''),
                'total_gross_profit' => number_format((float) $grossProfit, 2, '.', ''),
                'total_expenses' => number_format((float) $totalExpenses, 2, '.', ''),
                'net_profit' => number_format((float) $netProfit, 2, '.', ''),
            ],
            'meta' => [
                'page' => $page,
                'per_page' => $limit,
                'total_rows' => $totalRows,
                'total_pages' => (int) ceil($totalRows / $limit),
                'warnings' => $warnings,
            ],
        ]);
    }

    public function productLossDetail(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $canViewFinancials = in_array('dashboard.view_financial_summary', (array) ($claims['permissions'] ?? []), true)
            || in_array('reports.view_all', (array) ($claims['permissions'] ?? []), true)
            || in_array('*', (array) ($claims['permissions'] ?? []), true);
        if (!$canViewFinancials) {
            Response::error('Forbidden: insufficient permissions', 403);
        }
        $canViewCost = in_array('purchases.view_purchase_cost', (array) ($claims['permissions'] ?? []), true)
            || in_array('*', (array) ($claims['permissions'] ?? []), true);

        [$from, $to, $preset] = $this->parseFinancialSummaryDateRange();
        $branchId = $this->resolveBranchId($claims);

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int) ($_GET['limit'] ?? 10)));
        $offset = ($page - 1) * $limit;
        $search = trim((string) ($_GET['search'] ?? ''));

        $where = "sa.owner_type = 'branch' AND sa.owner_id = :b
                  AND sa.adjustment_type = 'deduction' AND sa.reason IN ('damage', 'spoilage')
                  AND DATE(sa.created_at) BETWEEN :from AND :to";
        $params = ['b' => $branchId, 'from' => $from, 'to' => $to];

        if ($search !== '') {
            $where .= " AND (sa.id LIKE :s OR i.item_name LIKE :s OR i.item_code LIKE :s OR sa.remarks LIKE :s)";
            $params['s'] = "%$search%";
        }

        $stmtCount = $this->pdo->prepare("SELECT COUNT(*) FROM stock_adjustments sa LEFT JOIN items i ON i.id = sa.item_id WHERE $where");
        $stmtCount->execute($params);
        $totalRows = (int) $stmtCount->fetchColumn();

        $stmtTotals = $this->pdo->prepare(
            "SELECT
                COALESCE(SUM(sa.qty), 0) AS total_loss_qty,
                COALESCE(SUM(sa.qty * COALESCE(i.cost_price, 0)), 0) AS total_loss_value,
                COALESCE(SUM(CASE WHEN i.cost_price IS NULL OR i.cost_price <= 0 THEN 1 ELSE 0 END), 0) AS missing_cost_records
             FROM stock_adjustments sa
             LEFT JOIN items i ON i.id = sa.item_id
             WHERE $where"
        );
        $stmtTotals->execute($params);
        $tot = $stmtTotals->fetch();

        $sortWhitelist = [
            'date' => 'sa.created_at',
            'item_name' => 'i.item_name',
            'qty' => 'sa.qty',
            'unit_cost' => 'i.cost_price',
            'loss_value' => '(sa.qty * COALESCE(i.cost_price, 0))',
            'reason' => 'sa.reason',
        ];
        $sortBy = $sortWhitelist[$_GET['sort_by'] ?? ''] ?? 'sa.created_at';
        $order = strtolower($_GET['order'] ?? 'desc') === 'asc' ? 'ASC' : 'DESC';

        $sql = "SELECT sa.id AS ref_no, DATE(sa.created_at) AS date, i.item_name, i.item_code,
                       sa.reason, sa.qty,
                       " . ($canViewCost ? "COALESCE(i.cost_price, 0) AS unit_cost, ROUND(sa.qty * COALESCE(i.cost_price, 0), 2) AS loss_value," : "NULL AS unit_cost, NULL AS loss_value,") . "
                       CASE WHEN (i.cost_price IS NULL OR i.cost_price <= 0) THEN 'Missing' ELSE 'Available' END AS cost_status,
                       sa.remarks AS notes, COALESCE(u.name, 'System') AS created_by
                FROM stock_adjustments sa
                LEFT JOIN items i ON i.id = sa.item_id
                LEFT JOIN users u ON u.id = sa.created_by
                WHERE $where
                ORDER BY $sortBy $order, sa.id DESC
                LIMIT $limit OFFSET $offset";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $columns = [
            'ref_no' => 'Ref #',
            'date' => 'Date',
            'item_name' => 'Product Name',
            'item_code' => 'SKU / Code',
            'reason' => 'Reason',
            'qty' => 'Loss Qty',
        ];
        if ($canViewCost) {
            $columns['unit_cost'] = 'Unit Cost';
            $columns['loss_value'] = 'Loss Value';
        }
        $columns['cost_status'] = 'Cost Status';
        $columns['notes'] = 'Remarks';
        $columns['created_by'] = 'Recorded By';

        if (!empty($_GET['export'])) {
            PermissionMiddleware::require($claims, 'reports.export_excel');
            TableExporter::export($columns, $rows, 'product_loss_detail.xlsx');
        }

        $warnings = [];
        if ((int) ($tot['missing_cost_records'] ?? 0) > 0) {
            $warnings[] = "Cost is missing on {$tot['missing_cost_records']} loss record(s).";
        }

        Response::json([
            'columns' => $columns,
            'rows' => $rows,
            'totals' => [
                'total_loss_qty' => number_format((float) ($tot['total_loss_qty'] ?? 0), 2, '.', ''),
                'total_loss_value' => $canViewCost ? number_format((float) ($tot['total_loss_value'] ?? 0), 2, '.', '') : null,
                'total_records' => $totalRows,
            ],
            'meta' => [
                'page' => $page,
                'per_page' => $limit,
                'total_rows' => $totalRows,
                'total_pages' => (int) ceil($totalRows / $limit),
                'warnings' => $warnings,
            ],
        ]);
    }

    public function stockPurchaseDetail(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $canViewFinancials = in_array('dashboard.view_financial_summary', (array) ($claims['permissions'] ?? []), true)
            || in_array('reports.view_all', (array) ($claims['permissions'] ?? []), true)
            || in_array('*', (array) ($claims['permissions'] ?? []), true);
        if (!$canViewFinancials) {
            Response::error('Forbidden: insufficient permissions', 403);
        }
        $canViewCost = in_array('purchases.view_purchase_cost', (array) ($claims['permissions'] ?? []), true)
            || in_array('*', (array) ($claims['permissions'] ?? []), true);

        [$from, $to, $preset] = $this->parseFinancialSummaryDateRange();
        $branchId = $this->resolveBranchId($claims);

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int) ($_GET['limit'] ?? 10)));
        $offset = ($page - 1) * $limit;
        $search = trim((string) ($_GET['search'] ?? ''));

        $subquery = "
            SELECT p.id, p.grn_no AS ref_no, p.purchase_date AS date, 'Purchase' AS type,
                   s.name AS supplier_name, COALESCE(pi_agg.items_count, 0) AS items_count,
                   p.subtotal, p.tax_total, p.grand_total AS total_amount, p.paid_amount,
                   p.pending_balance, p.status
            FROM purchases p
            LEFT JOIN suppliers s ON s.id = p.supplier_id
            LEFT JOIN (SELECT purchase_id, COUNT(*) AS items_count FROM purchase_items GROUP BY purchase_id) pi_agg ON pi_agg.purchase_id = p.id
            WHERE p.branch_id = :b1 AND p.status = 'active' AND p.purchase_date BETWEEN :from1 AND :to1
            UNION ALL
            SELECT pr.id, pr.return_no AS ref_no, DATE(pr.created_at) AS date, 'Purchase Return' AS type,
                   s.name AS supplier_name, 1 AS items_count,
                   pr.return_total AS subtotal, 0.00 AS tax_total, -pr.return_total AS total_amount,
                   pr.refund_amount AS paid_amount, pr.balance_amount AS pending_balance, 'completed' AS status
            FROM purchase_returns pr
            LEFT JOIN suppliers s ON s.id = pr.supplier_id
            WHERE pr.branch_id = :b2 AND DATE(pr.created_at) BETWEEN :from2 AND :to2
        ";

        $where = "1=1";
        $params = [
            'b1' => $branchId, 'from1' => $from, 'to1' => $to,
            'b2' => $branchId, 'from2' => $from, 'to2' => $to,
        ];

        if ($search !== '') {
            $where .= " AND (c.ref_no LIKE :s OR c.supplier_name LIKE :s OR c.type LIKE :s)";
            $params['s'] = "%$search%";
        }

        $stmtCount = $this->pdo->prepare("SELECT COUNT(*) FROM ($subquery) c WHERE $where");
        $stmtCount->execute($params);
        $totalRows = (int) $stmtCount->fetchColumn();

        $stmtTotals = $this->pdo->prepare(
            "SELECT
                COALESCE(SUM(CASE WHEN c.type = 'Purchase' THEN c.total_amount ELSE 0 END), 0) AS total_purchases_amount,
                COALESCE(SUM(CASE WHEN c.type = 'Purchase Return' THEN -c.total_amount ELSE 0 END), 0) AS total_returns_amount,
                COALESCE(SUM(c.total_amount), 0) AS net_purchase_amount
             FROM ($subquery) c WHERE $where"
        );
        $stmtTotals->execute($params);
        $tot = $stmtTotals->fetch();

        $sortWhitelist = [
            'date' => 'c.date',
            'ref_no' => 'c.ref_no',
            'supplier_name' => 'c.supplier_name',
            'type' => 'c.type',
            'total_amount' => 'c.total_amount',
            'paid_amount' => 'c.paid_amount',
            'pending_balance' => 'c.pending_balance',
        ];
        $sortBy = $sortWhitelist[$_GET['sort_by'] ?? ''] ?? 'c.date';
        $order = strtolower($_GET['order'] ?? 'desc') === 'asc' ? 'ASC' : 'DESC';

        $sql = "SELECT c.id, c.ref_no, c.date, c.type, c.supplier_name, c.items_count,
                       " . ($canViewCost ? "c.subtotal, c.tax_total, c.total_amount, c.paid_amount, c.pending_balance," : "NULL AS subtotal, NULL AS tax_total, NULL AS total_amount, NULL AS paid_amount, NULL AS pending_balance,") . "
                       c.status
                FROM ($subquery) c
                WHERE $where
                ORDER BY $sortBy $order, c.id DESC
                LIMIT $limit OFFSET $offset";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $columns = [
            'ref_no' => 'Bill / Return #',
            'date' => 'Date',
            'type' => 'Type',
            'supplier_name' => 'Supplier',
            'items_count' => 'Items Count',
        ];
        if ($canViewCost) {
            $columns['subtotal'] = 'Subtotal';
            $columns['tax_total'] = 'Tax';
            $columns['total_amount'] = 'Net Total';
            $columns['paid_amount'] = 'Paid';
            $columns['pending_balance'] = 'Pending Balance';
        }
        $columns['status'] = 'Status';

        if (!empty($_GET['export'])) {
            PermissionMiddleware::require($claims, 'reports.export_excel');
            TableExporter::export($columns, $rows, 'stock_purchase_detail.xlsx');
        }

        Response::json([
            'columns' => $columns,
            'rows' => $rows,
            'totals' => [
                'total_purchases_amount' => $canViewCost ? number_format((float) ($tot['total_purchases_amount'] ?? 0), 2, '.', '') : null,
                'total_returns_amount' => $canViewCost ? number_format((float) ($tot['total_returns_amount'] ?? 0), 2, '.', '') : null,
                'net_purchase_amount' => $canViewCost ? number_format((float) ($tot['net_purchase_amount'] ?? 0), 2, '.', '') : null,
                'total_records' => $totalRows,
            ],
            'meta' => [
                'page' => $page,
                'per_page' => $limit,
                'total_rows' => $totalRows,
                'total_pages' => (int) ceil($totalRows / $limit),
                'warnings' => [],
            ],
        ]);
    }

    public function stockAdjustmentDetail(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $canViewFinancials = in_array('dashboard.view_financial_summary', (array) ($claims['permissions'] ?? []), true)
            || in_array('reports.view_all', (array) ($claims['permissions'] ?? []), true)
            || in_array('*', (array) ($claims['permissions'] ?? []), true);
        if (!$canViewFinancials) {
            Response::error('Forbidden: insufficient permissions', 403);
        }

        [$from, $to, $preset] = $this->parseFinancialSummaryDateRange();
        $branchId = $this->resolveBranchId($claims);

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int) ($_GET['limit'] ?? 10)));
        $offset = ($page - 1) * $limit;
        $search = trim((string) ($_GET['search'] ?? ''));

        $where = "sa.owner_type = 'branch' AND sa.owner_id = :b AND DATE(sa.created_at) BETWEEN :from AND :to";
        $params = ['b' => $branchId, 'from' => $from, 'to' => $to];

        if ($search !== '') {
            $where .= " AND (sa.id LIKE :s OR i.item_name LIKE :s OR i.item_code LIKE :s OR sa.reason LIKE :s OR sa.remarks LIKE :s)";
            $params['s'] = "%$search%";
        }

        $stmtCount = $this->pdo->prepare("SELECT COUNT(*) FROM stock_adjustments sa LEFT JOIN items i ON i.id = sa.item_id WHERE $where");
        $stmtCount->execute($params);
        $totalRows = (int) $stmtCount->fetchColumn();

        $stmtTotals = $this->pdo->prepare(
            "SELECT
                COALESCE(SUM(CASE WHEN sa.adjustment_type = 'addition' THEN sa.qty ELSE 0 END), 0) AS total_addition_qty,
                COALESCE(SUM(CASE WHEN sa.adjustment_type = 'deduction' THEN sa.qty ELSE 0 END), 0) AS total_deduction_qty,
                COALESCE(SUM(CASE WHEN sa.adjustment_type = 'deduction' AND sa.reason IN ('damage', 'spoilage') THEN sa.qty ELSE 0 END), 0) AS total_loss_qty
             FROM stock_adjustments sa
             WHERE $where"
        );
        $stmtTotals->execute($params);
        $tot = $stmtTotals->fetch();

        $sortWhitelist = [
            'date' => 'sa.created_at',
            'item_name' => 'i.item_name',
            'adjustment_type' => 'sa.adjustment_type',
            'reason' => 'sa.reason',
            'qty' => 'sa.qty',
        ];
        $sortBy = $sortWhitelist[$_GET['sort_by'] ?? ''] ?? 'sa.created_at';
        $order = strtolower($_GET['order'] ?? 'desc') === 'asc' ? 'ASC' : 'DESC';

        $sql = "SELECT sa.id AS ref_no, DATE(sa.created_at) AS date, i.item_name, i.item_code,
                       sa.adjustment_type, sa.reason, sa.qty,
                       CASE WHEN sa.adjustment_type = 'deduction' AND sa.reason IN ('damage', 'spoilage') THEN 'Counted in Product Loss' ELSE 'Stock Adjustment' END AS double_count_label,
                       sa.remarks AS notes, COALESCE(u.name, 'System') AS created_by
                FROM stock_adjustments sa
                LEFT JOIN items i ON i.id = sa.item_id
                LEFT JOIN users u ON u.id = sa.created_by
                WHERE $where
                ORDER BY $sortBy $order, sa.id DESC
                LIMIT $limit OFFSET $offset";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $columns = [
            'ref_no' => 'Ref #',
            'date' => 'Date',
            'item_name' => 'Product Name',
            'item_code' => 'SKU / Code',
            'adjustment_type' => 'Type',
            'reason' => 'Reason',
            'qty' => 'Quantity',
            'double_count_label' => 'Accounting Classification',
            'notes' => 'Remarks',
            'created_by' => 'Recorded By',
        ];

        if (!empty($_GET['export'])) {
            PermissionMiddleware::require($claims, 'reports.export_excel');
            TableExporter::export($columns, $rows, 'stock_adjustment_detail.xlsx');
        }

        Response::json([
            'columns' => $columns,
            'rows' => $rows,
            'totals' => [
                'total_addition_qty' => number_format((float) ($tot['total_addition_qty'] ?? 0), 2, '.', ''),
                'total_deduction_qty' => number_format((float) ($tot['total_deduction_qty'] ?? 0), 2, '.', ''),
                'total_loss_qty' => number_format((float) ($tot['total_loss_qty'] ?? 0), 2, '.', ''),
                'total_records' => $totalRows,
            ],
            'meta' => [
                'page' => $page,
                'per_page' => $limit,
                'total_rows' => $totalRows,
                'total_pages' => (int) ceil($totalRows / $limit),
                'warnings' => [],
            ],
        ]);
    }

    public function orderManagementDetail(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $canViewFinancials = in_array('dashboard.view_financial_summary', (array) ($claims['permissions'] ?? []), true)
            || in_array('reports.view_all', (array) ($claims['permissions'] ?? []), true)
            || in_array('orders.view_prebooking', (array) ($claims['permissions'] ?? []), true)
            || in_array('*', (array) ($claims['permissions'] ?? []), true);
        if (!$canViewFinancials) {
            Response::error('Forbidden: insufficient permissions', 403);
        }

        [$from, $to, $preset] = $this->parseFinancialSummaryDateRange();
        $branchId = $this->resolveBranchId($claims);

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int) ($_GET['limit'] ?? 10)));
        $offset = ($page - 1) * $limit;
        $search = trim((string) ($_GET['search'] ?? ''));

        $where = "cp.branch_id = :b AND DATE(cp.created_at) BETWEEN :from AND :to";
        $params = ['b' => $branchId, 'from' => $from, 'to' => $to];

        if ($search !== '') {
            $where .= " AND (cp.prebooking_no LIKE :s OR c.ledger_name LIKE :s OR c.phone LIKE :s OR cp.status LIKE :s)";
            $params['s'] = "%$search%";
        }

        $stmtCount = $this->pdo->prepare("SELECT COUNT(*) FROM customer_prebookings cp LEFT JOIN customers c ON c.id = cp.customer_id WHERE $where");
        $stmtCount->execute($params);
        $totalRows = (int) $stmtCount->fetchColumn();

        $stmtTotals = $this->pdo->prepare(
            "SELECT
                COUNT(*) AS total_orders_count,
                COALESCE(SUM(CASE WHEN cp.status != 'cancelled' THEN cpi_agg.total_amt ELSE 0 END), 0) AS active_orders_value,
                COALESCE(SUM(CASE WHEN cp.status = 'cancelled' THEN cpi_agg.total_amt ELSE 0 END), 0) AS cancelled_orders_value
             FROM customer_prebookings cp
             LEFT JOIN (
                 SELECT prebooking_id, SUM(qty * rate * (1 + tax_percent / 100)) AS total_amt
                 FROM customer_prebooking_items
                 GROUP BY prebooking_id
             ) cpi_agg ON cpi_agg.prebooking_id = cp.id
             WHERE $where"
        );
        $stmtTotals->execute($params);
        $tot = $stmtTotals->fetch();

        $sortWhitelist = [
            'booking_date' => 'cp.created_at',
            'booking_no' => 'cp.prebooking_no',
            'customer_name' => 'c.ledger_name',
            'status' => 'cp.status',
            'total_amount' => 'cpi_agg.total_amt',
            'item_count' => 'cpi_agg.item_count',
        ];
        $sortBy = $sortWhitelist[$_GET['sort_by'] ?? ''] ?? 'cp.created_at';
        $order = strtolower($_GET['order'] ?? 'desc') === 'asc' ? 'ASC' : 'DESC';

        $sql = "SELECT cp.id, cp.prebooking_no AS booking_no, DATE(cp.created_at) AS booking_date,
                       c.ledger_name AS customer_name, c.phone AS customer_phone,
                       cp.booking_source, cp.status,
                       CASE WHEN cp.status = 'cancelled' THEN 'Excluded (Cancelled)' ELSE 'Included in Total' END AS financial_inclusion,
                       COALESCE(cpi_agg.item_count, 0) AS item_count,
                       COALESCE(cpi_agg.total_amt, 0) AS total_amount
                FROM customer_prebookings cp
                LEFT JOIN customers c ON c.id = cp.customer_id
                LEFT JOIN (
                    SELECT prebooking_id, COUNT(*) AS item_count,
                           SUM(qty * rate * (1 + tax_percent / 100)) AS total_amt
                    FROM customer_prebooking_items
                    GROUP BY prebooking_id
                ) cpi_agg ON cpi_agg.prebooking_id = cp.id
                WHERE $where
                ORDER BY $sortBy $order, cp.id DESC
                LIMIT $limit OFFSET $offset";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $columns = [
            'booking_no' => 'Booking #',
            'booking_date' => 'Booking Date',
            'customer_name' => 'Customer',
            'customer_phone' => 'Phone',
            'booking_source' => 'Source',
            'item_count' => 'Items Count',
            'total_amount' => 'Estimated Total',
            'status' => 'Order Status',
            'financial_inclusion' => 'Financial Inclusion',
        ];

        if (!empty($_GET['export'])) {
            PermissionMiddleware::require($claims, 'reports.export_excel');
            TableExporter::export($columns, $rows, 'order_management_detail.xlsx');
        }

        Response::json([
            'columns' => $columns,
            'rows' => $rows,
            'totals' => [
                'total_orders_count' => (int) ($tot['total_orders_count'] ?? 0),
                'active_orders_value' => number_format((float) ($tot['active_orders_value'] ?? 0), 2, '.', ''),
                'cancelled_orders_value' => number_format((float) ($tot['cancelled_orders_value'] ?? 0), 2, '.', ''),
            ],
            'meta' => [
                'page' => $page,
                'per_page' => $limit,
                'total_rows' => $totalRows,
                'total_pages' => (int) ceil($totalRows / $limit),
                'warnings' => [],
            ],
        ]);
    }

    public function totalSalesDetail(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $canViewFinancials = in_array('dashboard.view_financial_summary', (array) ($claims['permissions'] ?? []), true)
            || in_array('reports.view_all', (array) ($claims['permissions'] ?? []), true)
            || in_array('*', (array) ($claims['permissions'] ?? []), true);
        if (!$canViewFinancials) {
            Response::error('Forbidden: insufficient permissions', 403);
        }

        [$from, $to, $preset] = $this->parseFinancialSummaryDateRange();
        $branchId = $this->resolveBranchId($claims);

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int) ($_GET['limit'] ?? 10)));
        $offset = ($page - 1) * $limit;
        $search = trim((string) ($_GET['search'] ?? ''));

        $where = "i.branch_id = :b AND i.status = 'completed' AND i.invoice_date BETWEEN :from AND :to";
        $params = ['b' => $branchId, 'from' => $from, 'to' => $to];

        if ($search !== '') {
            $where .= " AND (i.invoice_no LIKE :s OR c.ledger_name LIKE :s OR i.payment_status LIKE :s)";
            $params['s'] = "%$search%";
        }

        $stmtCount = $this->pdo->prepare("SELECT COUNT(*) FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id WHERE $where");
        $stmtCount->execute($params);
        $totalRows = (int) $stmtCount->fetchColumn();

        $stmtTotals = $this->pdo->prepare(
            "SELECT
                COUNT(*) AS total_invoices_count,
                COALESCE(SUM(i.grand_total), 0) AS total_grand_total,
                COALESCE(SUM(i.cgst_amount + i.sgst_amount + i.igst_amount + i.cess_amount), 0) AS total_tax,
                COALESCE(SUM(i.paid_amount), 0) AS total_paid_amount,
                COALESCE(SUM(i.balance_due), 0) AS total_balance_due
             FROM invoices i
             LEFT JOIN customers c ON c.id = i.customer_id
             WHERE $where"
        );
        $stmtTotals->execute($params);
        $tot = $stmtTotals->fetch();

        $sortWhitelist = [
            'invoice_date' => 'i.invoice_date',
            'invoice_no' => 'i.invoice_no',
            'customer_name' => 'c.ledger_name',
            'items_count' => 'ii_agg.items_count',
            'grand_total' => 'i.grand_total',
            'paid_amount' => 'i.paid_amount',
            'balance_due' => 'i.balance_due',
            'payment_status' => 'i.payment_status',
        ];
        $sortBy = $sortWhitelist[$_GET['sort_by'] ?? ''] ?? 'i.invoice_date';
        $order = strtolower($_GET['order'] ?? 'desc') === 'asc' ? 'ASC' : 'DESC';

        $sql = "SELECT i.id, i.invoice_no, i.invoice_date, COALESCE(c.ledger_name, 'Walk-in') AS customer_name,
                       COALESCE(ii_agg.items_count, 0) AS items_count,
                       i.subtotal, i.discount_amount, (i.cgst_amount + i.sgst_amount + i.igst_amount + i.cess_amount) AS tax_amount,
                       i.round_off, i.grand_total, i.paid_amount, i.balance_due, i.payment_status, i.status
                FROM invoices i
                LEFT JOIN customers c ON c.id = i.customer_id
                LEFT JOIN (
                    SELECT invoice_id, COUNT(*) AS items_count FROM invoice_items GROUP BY invoice_id
                ) ii_agg ON ii_agg.invoice_id = i.id
                WHERE $where
                ORDER BY $sortBy $order, i.id DESC
                LIMIT $limit OFFSET $offset";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $columns = [
            'invoice_no' => 'Invoice #',
            'invoice_date' => 'Date',
            'customer_name' => 'Customer',
            'items_count' => 'Items Count',
            'subtotal' => 'Subtotal',
            'discount_amount' => 'Discount',
            'tax_amount' => 'Tax',
            'round_off' => 'Round Off',
            'grand_total' => 'Grand Total',
            'paid_amount' => 'Paid Amount',
            'balance_due' => 'Balance Due',
            'payment_status' => 'Payment Status',
        ];

        if (!empty($_GET['export'])) {
            PermissionMiddleware::require($claims, 'reports.export_excel');
            TableExporter::export($columns, $rows, 'total_sales_detail.xlsx');
        }

        Response::json([
            'columns' => $columns,
            'rows' => $rows,
            'totals' => [
                'total_invoices_count' => (int) ($tot['total_invoices_count'] ?? 0),
                'total_grand_total' => number_format((float) ($tot['total_grand_total'] ?? 0), 2, '.', ''),
                'total_tax' => number_format((float) ($tot['total_tax'] ?? 0), 2, '.', ''),
                'total_paid_amount' => number_format((float) ($tot['total_paid_amount'] ?? 0), 2, '.', ''),
                'total_balance_due' => number_format((float) ($tot['total_balance_due'] ?? 0), 2, '.', ''),
            ],
            'meta' => [
                'page' => $page,
                'per_page' => $limit,
                'total_rows' => $totalRows,
                'total_pages' => (int) ceil($totalRows / $limit),
                'warnings' => [],
            ],
        ]);
    }
}
