<?php

declare(strict_types=1);

$autoload = file_exists(__DIR__ . '/../vendor/autoload.php') ? __DIR__ . '/../vendor/autoload.php' : __DIR__ . '/vendor/autoload.php';
require_once $autoload;

$dbConfig = file_exists(__DIR__ . '/../config/database.php') ? __DIR__ . '/../config/database.php' : __DIR__ . '/config/database.php';
require_once $dbConfig;

use App\Controllers\AuthController;
use App\Controllers\BranchController;
use App\Controllers\BranchScopedCrudController;
use App\Controllers\CashHandoverController;
use App\Controllers\CollectionController;
use App\Controllers\CrudController;
use App\Controllers\CustomerController;
use App\Controllers\CustomerPrebookingController;
use App\Controllers\DashboardController;
use App\Controllers\InvoiceController;
use App\Controllers\ItemController;
use App\Controllers\ReportsController;
use App\Controllers\SettingsController;
use App\Controllers\PurchaseController;
use App\Controllers\PurchaseRequestController;
use App\Controllers\PurchaseReturnController;
use App\Controllers\SalesReturnController;
use App\Controllers\StockAdjustmentController;
use App\Controllers\StockHubController;
use App\Controllers\SupplierPaymentController;
use App\Controllers\UserController;
use App\Controllers\VanStockController;
use App\Helpers\Response;
use App\Helpers\Router;
use App\Middleware\CorsMiddleware;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;

CorsMiddleware::handle();

$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/';

// Strip a /pos-system/backend/public prefix if the app is served from a
// sub-path under XAMPP's htdocs rather than its own vhost root.
$scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
if ($scriptDir !== '' && str_starts_with($uri, $scriptDir)) {
    $uri = substr($uri, strlen($scriptDir)) ?: '/';
}
if (!str_starts_with($uri, '/api') && $uri !== '/') {
    $uri = '/api' . (str_starts_with($uri, '/') ? $uri : '/' . $uri);
}

$pdo = get_pdo();
$router = new Router();

// ---------------------------------------------------------------
// Auth
// ---------------------------------------------------------------
$router->post('/api/auth/login', fn () => (new AuthController())->login());
$router->get('/api/auth/me', fn () => (new AuthController())->me());

// Phase-1 self-check endpoint only.
$router->get('/api/staff/accounts', function () {
    $claims = JwtAuthMiddleware::authenticate();
    PermissionMiddleware::require($claims, 'staff.manage_accounts');
    Response::json(['message' => 'You have staff.manage_accounts — this would list staff accounts.']);
});

// ---------------------------------------------------------------
// Catalog — global lookup tables (section 4.3)
// ---------------------------------------------------------------
$categories = new CrudController($pdo, 'categories', ['name', 'parent_id'], 'catalog.manage_items');
$router->get('/api/categories', fn () => $categories->index());
$router->post('/api/categories', fn () => $categories->store());
$router->put('/api/categories/{id}', fn ($id) => $categories->update($id));
$router->delete('/api/categories/{id}', fn ($id) => $categories->destroy($id));
$router->get('/api/categories/{id}/brands', function ($id) use ($pdo) {
    JwtAuthMiddleware::authenticate();
    $stmt = $pdo->prepare('SELECT brand_id FROM category_brands WHERE category_id = :id');
    $stmt->execute(['id' => $id]);
    Response::json(['category_id' => (int) $id, 'brand_ids' => array_map('intval', array_column($stmt->fetchAll(), 'brand_id'))]);
});
$router->put('/api/categories/{id}/brands', function ($id) use ($pdo) {
    $claims = JwtAuthMiddleware::authenticate();
    PermissionMiddleware::require($claims, 'catalog.manage_items');
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM category_brands WHERE category_id = :id')->execute(['id' => $id]);
    $stmt = $pdo->prepare('INSERT INTO category_brands (category_id, brand_id) VALUES (:c, :b)');
    foreach (array_unique(array_map('intval', $body['brand_ids'] ?? [])) as $brandId) {
        $stmt->execute(['c' => $id, 'b' => $brandId]);
    }
    $pdo->commit();
    Response::json(['category_id' => (int) $id, 'brand_ids' => $body['brand_ids'] ?? []]);
});

$brands = new CrudController($pdo, 'brands', ['name', 'code'], 'catalog.manage_items', 'BRD');
$router->get('/api/brands', fn () => $brands->index());
$router->post('/api/brands', fn () => $brands->store());
$router->put('/api/brands/{id}', fn ($id) => $brands->update($id));
$router->delete('/api/brands/{id}', fn ($id) => $brands->destroy($id));

$productLines = new CrudController($pdo, 'product_lines', ['branch_id', 'name', 'code'], 'catalog.manage_items', 'PRD');
$router->get('/api/product-lines', fn () => $productLines->index());
$router->post('/api/product-lines', fn () => $productLines->store());
$router->put('/api/product-lines/{id}', fn ($id) => $productLines->update($id));
$router->delete('/api/product-lines/{id}', fn ($id) => $productLines->destroy($id));

$taxCodes = new CrudController(
    $pdo, 'tax_codes',
    ['code', 'name', 'gst_percent', 'cgst_percent', 'sgst_percent', 'igst_percent', 'cess_percent'],
    'catalog.manage_items'
);
$router->get('/api/tax-codes', fn () => $taxCodes->index());
$router->post('/api/tax-codes', fn () => $taxCodes->store());
$router->put('/api/tax-codes/{id}', fn ($id) => $taxCodes->update($id));
$router->delete('/api/tax-codes/{id}', fn ($id) => $taxCodes->destroy($id));

$stockUnits = new CrudController($pdo, 'stock_units', ['name', 'short_code', 'is_decimal'], 'catalog.manage_items');
$router->get('/api/stock-units', fn () => $stockUnits->index());
$router->post('/api/stock-units', fn () => $stockUnits->store());
$router->put('/api/stock-units/{id}', fn ($id) => $stockUnits->update($id));
$router->delete('/api/stock-units/{id}', fn ($id) => $stockUnits->destroy($id));

// ---------------------------------------------------------------
// Items — dedicated controller (unit conversions + Excel import/export)
// ---------------------------------------------------------------
$itemController = new ItemController($pdo);
$router->get('/api/items/export', fn () => $itemController->exportExcel());
$router->get('/api/items/import/template', fn () => $itemController->importTemplate());
$router->post('/api/items/import/preview', fn () => $itemController->importPreview());
$router->post('/api/items/import/commit', fn () => $itemController->importCommit());
$router->get('/api/items/pricing', fn () => $itemController->pricingList());
$router->put('/api/items/pricing', fn () => $itemController->pricingBulkUpdate());
$router->get('/api/items', fn () => $itemController->index());
$router->post('/api/items', fn () => $itemController->store());
$router->get('/api/items/{id}', fn ($id) => $itemController->show($id));
$router->put('/api/items/{id}', fn ($id) => $itemController->update($id));
$router->delete('/api/items/{id}', fn ($id) => $itemController->destroy($id));
$router->post('/api/items/{id}/image', fn ($id) => $itemController->uploadImage($id));
$router->delete('/api/items/{id}/image', fn ($id) => $itemController->removeImage($id));
$router->post('/api/items/image-search', fn () => $itemController->imageSearch());
$router->get('/api/items/{id}/previous-week-price', fn ($id) => $itemController->previousWeekPrice($id));
$router->get('/api/pos/products/{id}/previous-week-price', fn ($id) => $itemController->previousWeekPrice($id));

// ---------------------------------------------------------------
// Parties — branch-scoped (section 4.2)
// ---------------------------------------------------------------
$routes = new BranchScopedCrudController($pdo, 'routes', ['branch_id', 'name'], 'parties.manage_customers');
$router->get('/api/routes', fn () => $routes->index());
$router->post('/api/routes', fn () => $routes->store());
$router->put('/api/routes/{id}', fn ($id) => $routes->update($id));
$router->delete('/api/routes/{id}', fn ($id) => $routes->destroy($id));

// Which suppliers serve a given route — used to filter the supplier
// dropdown on a Purchase Request by Branch + Route (section: supplier
// mapping). Same ad-hoc-pair-endpoint pattern as /categories/{id}/brands.
$router->get('/api/routes/{id}/suppliers', function ($id) use ($pdo) {
    JwtAuthMiddleware::authenticate();
    $stmt = $pdo->prepare('SELECT supplier_id FROM supplier_routes WHERE route_id = :id');
    $stmt->execute(['id' => $id]);
    Response::json(['route_id' => (int) $id, 'supplier_ids' => array_map('intval', array_column($stmt->fetchAll(), 'supplier_id'))]);
});
$router->put('/api/routes/{id}/suppliers', function ($id) use ($pdo) {
    $claims = JwtAuthMiddleware::authenticate();
    PermissionMiddleware::require($claims, 'parties.manage_suppliers');
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM supplier_routes WHERE route_id = :id')->execute(['id' => $id]);
    $stmt = $pdo->prepare('INSERT INTO supplier_routes (route_id, supplier_id) VALUES (:r, :s)');
    foreach (array_unique(array_map('intval', $body['supplier_ids'] ?? [])) as $supplierId) {
        $stmt->execute(['r' => $id, 's' => $supplierId]);
    }
    $pdo->commit();
    Response::json(['route_id' => (int) $id, 'supplier_ids' => $body['supplier_ids'] ?? []]);
});

// Cities hang off a route, not a branch directly — plain CrudController.
$cities = new CrudController($pdo, 'cities', ['route_id', 'name'], 'parties.manage_customers');
$router->get('/api/cities', fn () => $cities->index());
$router->post('/api/cities', fn () => $cities->store());
$router->put('/api/cities/{id}', fn ($id) => $cities->update($id));
$router->delete('/api/cities/{id}', fn ($id) => $cities->destroy($id));

$customers = new BranchScopedCrudController(
    $pdo, 'customers',
    ['branch_id', 'city_id', 'route_id', 'ledger_name', 'print_name', 'customer_group', 'phone', 'gstin', 'address',
     'doj', 'dob', 'pricing_type', 'credit_limit', 'opening_balance', 'is_local_customer', 'status'],
    'parties.manage_customers',
    onCreated: function ($id, $saved, $claims) use ($pdo) {
        // opening_balance is just a number on the row until it's actually
        // posted to the ledger — without this, "previous amount" never
        // shows up as real outstanding credit anywhere (section: opening
        // balance must behave like a real balance, not a decorative field).
        $amount = (float) ($saved['opening_balance'] ?? 0);
        if ($amount > 0.009) {
            (new \App\Services\CreditLedgerService($pdo))->record(
                $id, 'sale_credit', $amount, null, 'Opening balance', (int) $claims['sub']
            );
        }
    }
);
$router->get('/api/customers', fn () => $customers->index());
$router->post('/api/customers', fn () => $customers->store());
$router->put('/api/customers/{id}', fn ($id) => $customers->update($id));
$router->delete('/api/customers/{id}', fn ($id) => $customers->destroy($id));

$customerImport = new CustomerController($pdo);
$router->get('/api/customers/export', fn () => $customerImport->exportExcel());
$router->get('/api/customers/import/template', fn () => $customerImport->importTemplate());
$router->post('/api/customers/import/preview', fn () => $customerImport->importPreview());
$router->post('/api/customers/import/commit', fn () => $customerImport->importCommit());

$suppliers = new BranchScopedCrudController(
    $pdo, 'suppliers',
    ['branch_id', 'name', 'phone', 'address', 'gstin', 'opening_balance', 'status'],
    'parties.manage_suppliers',
    onCreated: function ($id, $saved, $claims) use ($pdo) {
        $amount = (float) ($saved['opening_balance'] ?? 0);
        if ($amount > 0.009) {
            (new \App\Services\SupplierLedgerService($pdo))->record(
                $id, 'purchase_credit', $amount, null, null, 'Opening balance', (int) $claims['sub']
            );
        }
    }
);
$router->get('/api/suppliers', fn () => $suppliers->index());
$router->post('/api/suppliers', fn () => $suppliers->store());
$router->put('/api/suppliers/{id}', fn ($id) => $suppliers->update($id));
$router->delete('/api/suppliers/{id}', fn ($id) => $suppliers->destroy($id));

// Opening balance / payable / paid / outstanding breakdown per supplier —
// the ledger's own running balance, never re-derived client-side.
$router->get('/api/suppliers/balances', function () use ($pdo) {
    $claims = \App\Middleware\JwtAuthMiddleware::authenticate();
    $canSwitch = in_array('branches.switch_context', (array) ($claims['permissions'] ?? []), true);
    $branchId = ($canSwitch && isset($_GET['branch_id'])) ? (int) $_GET['branch_id'] : (int) ($claims['branch_id'] ?? 0);
    \App\Helpers\Response::json((new \App\Services\SupplierLedgerService($pdo))->summaryForBranch($branchId));
});

// ---------------------------------------------------------------
// Invoices / POS billing (Phase 3)
// ---------------------------------------------------------------
$invoiceController = new InvoiceController($pdo);
$router->get('/api/invoices', fn () => $invoiceController->index());
$router->post('/api/invoices', fn () => $invoiceController->store());
$router->get('/api/invoices/{id}', fn ($id) => $invoiceController->show($id));
$router->put('/api/invoices/{id}', fn ($id) => $invoiceController->update($id));
$router->delete('/api/invoices/{id}', fn ($id) => $invoiceController->destroy($id));
$router->post('/api/invoices/{id}/complete', fn ($id) => $invoiceController->complete($id));
$router->put('/api/invoices/{id}/edit', fn ($id) => $invoiceController->editCompleted($id));
$router->post('/api/invoices/{id}/cancel', fn ($id) => $invoiceController->cancel($id));
$router->post('/api/invoices/{id}/delete', fn ($id) => $invoiceController->deleteCompleted($id));
$router->get('/api/invoices/{id}/print', fn ($id) => $invoiceController->print($id));
$router->put('/api/invoices/{id}/transport', fn ($id) => $invoiceController->updateTransportDetails($id));
$router->post('/api/invoices/{id}/einvoice/generate', fn ($id) => $invoiceController->generateEInvoice($id));
$router->post('/api/invoices/{id}/einvoice/cancel', fn ($id) => $invoiceController->cancelEInvoice($id));
$router->post('/api/invoices/{id}/ewaybill/generate', fn ($id) => $invoiceController->generateEWayBill($id));
$router->post('/api/invoices/{id}/ewaybill/cancel', fn ($id) => $invoiceController->cancelEWayBill($id));
$router->get('/api/invoices/{id}/returnable-items', fn ($id) => $invoiceController->returnableItems($id));

// ---------------------------------------------------------------
// Purchasing & Inventory Ops (Phase 4)
// ---------------------------------------------------------------
$purchaseRequests = new PurchaseRequestController($pdo);
$router->get('/api/purchase-requests', fn () => $purchaseRequests->index());
$router->post('/api/purchase-requests', fn () => $purchaseRequests->store());
$router->get('/api/purchase-requests/{id}', fn ($id) => $purchaseRequests->show($id));
$router->post('/api/purchase-requests/{id}/cancel', fn ($id) => $purchaseRequests->cancel($id));
$router->post('/api/purchase-requests/{id}/approve', fn ($id) => $purchaseRequests->approve($id));

// ---------------------------------------------------------------
// Customer Pre-Booking (Order Management) — permanent request record,
// distinct from a POS Hold Bill: no stock, payment, or invoice effect.
// ---------------------------------------------------------------
$customerPrebookings = new CustomerPrebookingController($pdo);
$router->get('/api/customer-prebookings/export', fn () => $customerPrebookings->exportExcel());
$router->get('/api/customer-prebookings', fn () => $customerPrebookings->index());
$router->post('/api/customer-prebookings', fn () => $customerPrebookings->store());
$router->get('/api/customer-prebookings/{id}', fn ($id) => $customerPrebookings->show($id));
$router->put('/api/customer-prebookings/{id}', fn ($id) => $customerPrebookings->update($id));
$router->put('/api/customer-prebookings/{id}/status', fn ($id) => $customerPrebookings->updateStatus($id));
$router->post('/api/customer-prebookings/{id}/cancel', fn ($id) => $customerPrebookings->cancel($id));

$purchases = new PurchaseController($pdo);
$router->get('/api/purchases', fn () => $purchases->index());
$router->post('/api/purchases', fn () => $purchases->store());
$router->get('/api/purchases/{id}', fn ($id) => $purchases->show($id));
$router->get('/api/purchases/{id}/returnable-items', fn ($id) => $purchases->returnableItems($id));
$router->put('/api/purchases/{id}', fn ($id) => $purchases->update($id));
$router->delete('/api/purchases/{id}', fn ($id) => $purchases->destroy($id));

$supplierPayments = new SupplierPaymentController($pdo);
$router->get('/api/supplier-payments', fn () => $supplierPayments->index());
$router->post('/api/supplier-payments', fn () => $supplierPayments->store());
$router->get('/api/suppliers/{id}/unpaid-grns', fn ($id) => $supplierPayments->unpaidGrns($id));

$stockAdjustments = new StockAdjustmentController($pdo);
$router->get('/api/stock-adjustments', fn () => $stockAdjustments->index());
$router->post('/api/stock-adjustments', fn () => $stockAdjustments->store());

$vanStock = new VanStockController($pdo);
$router->post('/api/van-stock/issue', fn () => $vanStock->issue());
$router->post('/api/van-stock/return', fn () => $vanStock->returnStock());
$router->get('/api/van-stock/issues', fn () => $vanStock->issues());
$router->get('/api/van-stock/issues/{id}', fn ($id) => $vanStock->showIssue($id));
$router->get('/api/van-stock/{employeeId}', fn ($employeeId) => $vanStock->pending($employeeId));

$stockHub = new StockHubController($pdo);
$router->get('/api/stock-hub', fn () => $stockHub->index());
$router->get('/api/stock-hub/low-stock', fn () => $stockHub->lowStock());

$users = new UserController($pdo);
$router->get('/api/users', fn () => $users->index());
$router->post('/api/users', fn () => $users->store());
$router->get('/api/users/{id}', fn ($id) => $users->show($id));
$router->put('/api/users/{id}', fn ($id) => $users->update($id));
$router->get('/api/users/{id}/permissions', fn ($id) => $users->permissions($id));
$router->put('/api/users/{id}/permissions', fn ($id) => $users->setPermissions($id));

$router->get('/api/roles', function () use ($pdo) {
    JwtAuthMiddleware::authenticate();
    Response::json($pdo->query('SELECT id, name FROM roles ORDER BY name')->fetchAll());
});
$router->get('/api/permissions', function () use ($pdo) {
    JwtAuthMiddleware::authenticate();
    Response::json($pdo->query('SELECT id, module, code, label, description FROM permissions ORDER BY module, code')->fetchAll());
});

// ---------------------------------------------------------------
// Post-sale: returns, collections, cash handover, expenses (Phase 5)
// ---------------------------------------------------------------
$salesReturns = new SalesReturnController($pdo);
$router->get('/api/sales-returns', fn () => $salesReturns->index());
$router->post('/api/sales-returns', fn () => $salesReturns->store());
$router->get('/api/sales-returns/{id}', fn ($id) => $salesReturns->show($id));
$router->post('/api/sales-returns/{id}/approve', fn ($id) => $salesReturns->approve($id));
$router->post('/api/sales-returns/{id}/reject', fn ($id) => $salesReturns->reject($id));

$purchaseReturns = new PurchaseReturnController($pdo);
$router->get('/api/purchase-returns', fn () => $purchaseReturns->index());
$router->post('/api/purchase-returns', fn () => $purchaseReturns->store());
$router->get('/api/purchase-returns/{id}', fn ($id) => $purchaseReturns->show($id));

$collections = new CollectionController($pdo);
$router->get('/api/collections', fn () => $collections->index());
$router->get('/api/collections/pending', fn () => $collections->pending());
$router->post('/api/collections', fn () => $collections->store());
$router->get('/api/customers/{id}/unpaid-invoices', fn ($id) => $collections->unpaidInvoices($id));

$cashHandovers = new CashHandoverController($pdo);
$router->get('/api/cash-handovers', fn () => $cashHandovers->index());
$router->get('/api/cash-handovers/pending', fn () => $cashHandovers->pending());
$router->post('/api/cash-handovers', fn () => $cashHandovers->store());
$router->post('/api/cash-handovers/{id}/verify', fn ($id) => $cashHandovers->verify($id));

$expenseCategories = new CrudController($pdo, 'expense_categories', ['name'], 'expenses.manage');
$router->get('/api/expense-categories', fn () => $expenseCategories->index());
$router->post('/api/expense-categories', fn () => $expenseCategories->store());

$expenses = new BranchScopedCrudController(
    $pdo, 'expenses',
    ['branch_id', 'category_id', 'amount', 'payment_mode', 'description', 'expense_date', 'created_by', 'expense_no'],
    'expenses.manage', 'id', 'EXP', 'expense_no',
    [
        'created_by' => fn ($claims) => (int) $claims['sub'],
        'expense_date' => fn () => date('Y-m-d'),
    ]
);
$router->get('/api/expenses', fn () => $expenses->index());
$router->post('/api/expenses', fn () => $expenses->store());
$router->delete('/api/expenses/{id}', fn ($id) => $expenses->destroy($id));

$otherIncome = new BranchScopedCrudController(
    $pdo, 'other_income',
    ['branch_id', 'amount', 'payment_mode', 'description', 'income_date', 'created_by', 'receipt_no'],
    'expenses.manage', 'id', 'INC', 'receipt_no',
    [
        'created_by' => fn ($claims) => (int) $claims['sub'],
        'income_date' => fn () => date('Y-m-d'),
    ]
);
$router->get('/api/other-income', fn () => $otherIncome->index());
$router->post('/api/other-income', fn () => $otherIncome->store());
$router->delete('/api/other-income/{id}', fn ($id) => $otherIncome->destroy($id));

// ---------------------------------------------------------------
// Dashboard, Reports, Settings (Phase 6)
// ---------------------------------------------------------------
$dashboard = new DashboardController($pdo);
$router->get('/api/dashboard/summary', fn () => $dashboard->summary());

$reports = new ReportsController($pdo);
$router->get('/api/reports/gst-register', fn () => $reports->gstRegister());
$router->get('/api/reports/non-gst-register', fn () => $reports->nonGstRegister());
$router->get('/api/reports/purchase-register', fn () => $reports->purchaseRegister());
$router->get('/api/reports/item-wise-sales', fn () => $reports->itemWiseSales());
$router->get('/api/reports/credit-outstanding', fn () => $reports->creditOutstanding());
$router->get('/api/reports/expense-income', fn () => $reports->expenseIncome());
$router->get('/api/reports/profit', fn () => $reports->profitReport());
$router->get('/api/reports/profit/invoice-wise', fn () => $reports->invoiceWiseProfitReport());
$router->get('/api/reports/branch-wise-sales', fn () => $reports->branchWiseSales());
$router->get('/api/reports/route-wise-sales', fn () => $reports->routeWiseSales());
$router->get('/api/reports/customer-wise-sales', fn () => $reports->customerWiseSales());
$router->get('/api/reports/supplier-wise-sales', fn () => $reports->supplierWiseSales());
$router->get('/api/reports/brand-wise-sales', fn () => $reports->brandWiseSales());
$router->get('/api/reports/category-wise-sales', fn () => $reports->categoryWiseSales());
$router->get('/api/reports/financial-summary', fn () => $reports->financialSummary());
$router->get('/api/reports/financial-summary/profit-detail', fn () => $reports->profitDetail());
$router->get('/api/reports/financial-summary/product-loss-detail', fn () => $reports->productLossDetail());
$router->get('/api/reports/financial-summary/stock-purchase-detail', fn () => $reports->stockPurchaseDetail());
$router->get('/api/reports/financial-summary/stock-adjustment-detail', fn () => $reports->stockAdjustmentDetail());
$router->get('/api/reports/financial-summary/order-management-detail', fn () => $reports->orderManagementDetail());
$router->get('/api/reports/financial-summary/total-sales-detail', fn () => $reports->totalSalesDetail());
$router->get('/api/reports/brand-category-wise-sales', fn () => $reports->brandCategoryWiseSales());

$branches = new BranchController($pdo);
$router->get('/api/branches', fn () => $branches->index());
$router->post('/api/branches', fn () => $branches->store());
$router->get('/api/branches/{id}', fn ($id) => $branches->show($id));
$router->put('/api/branches/{id}', fn ($id) => $branches->update($id));

$settings = new SettingsController($pdo);
$router->get('/api/settings/branch', fn () => $settings->branchProfile());
$router->put('/api/settings/branch', fn () => $settings->updateBranchProfile());
$router->get('/api/settings/print', fn () => $settings->printSettings());
$router->put('/api/settings/print', fn () => $settings->updatePrintSettings());
$router->get('/api/settings/free-qty', fn () => $settings->freeQtySettings());
$router->put('/api/settings/free-qty', fn () => $settings->updateFreeQtySettings());
$router->get('/api/settings/sequences', fn () => $settings->sequences());
$router->put('/api/settings/sequences/{id}', fn ($id) => $settings->updateSequence($id));
$router->get('/api/settings/pos-popup', fn () => $settings->posPopupSettings());
$router->put('/api/settings/pos-popup', fn () => $settings->updatePosPopupSettings());

try {
    $router->dispatch($method, $uri);
} catch (\Throwable $e) {
    $cfgPath = file_exists(__DIR__ . '/../config/config.php') ? __DIR__ . '/../config/config.php' : __DIR__ . '/config/config.php';
    $config = require $cfgPath;
    Response::json([
        'error' => 'Server error',
        'detail' => $config['app']['debug'] ? $e->getMessage() : null,
    ], 500);
}
