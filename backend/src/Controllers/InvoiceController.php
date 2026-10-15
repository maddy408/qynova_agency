<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\NumberToWords;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Models\InvoiceModel;
use App\Services\CreditLedgerService;
use App\Services\GstEInvoiceService;
use PDO;

class InvoiceController
{
    private InvoiceModel $invoices;

    public function __construct(private PDO $pdo)
    {
        $this->invoices = new InvoiceModel($pdo);
    }

    private function resolveBranchId(array $claims): int
    {
        $canSwitch = in_array('branches.switch_context', (array) ($claims['permissions'] ?? []), true);
        if ($canSwitch && isset($_GET['branch_id'])) {
            return (int) $_GET['branch_id'];
        }
        if ($claims['branch_id'] === null) {
            Response::error('Your account has no home branch assigned', 422);
        }
        return (int) $claims['branch_id'];
    }

    public function index(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.access');
        $branchId = $this->resolveBranchId($claims);

        if (isset($_GET['page'])) {
            $page = max(1, (int) $_GET['page']);
            $limit = max(1, min(100, (int) ($_GET['limit'] ?? 10)));
            $result = $this->invoices->paginate(
                $branchId,
                $_GET['status'] ?? null,
                $page,
                $limit,
                $_GET['search'] ?? null
            );
            Response::json($result);
            return;
        }

        Response::json($this->invoices->all($branchId, $_GET['status'] ?? null));
    }


    public function show(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.access');
        $invoice = $this->requireOwnedInvoice($claims, (int) $id);
        Response::json($invoice);
    }

    /** GET /api/invoices/{id}/returnable-items — feeds Sale Return's invoice-line picker. */
    public function returnableItems(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'returns.sales_return');
        $this->requireOwnedInvoice($claims, (int) $id);
        Response::json($this->invoices->returnableItems((int) $id));
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.access');

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $branchId = $this->resolveBranchId($claims);
        [$header, $lines, $error] = $this->prepareInvoice($claims, $branchId, $body);
        if ($error) {
            Response::error($error, 422);
        }

        $id = $this->invoices->createHeld($header, $lines);
        Response::json($this->invoices->find($id), 201);
    }

    public function update(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.access');

        $existing = $this->requireOwnedInvoice($claims, (int) $id);
        if ($existing['status'] !== 'held') {
            Response::error('Only a held bill can be edited', 422);
        }

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        [$header, $lines, $error] = $this->prepareInvoice($claims, (int) $existing['branch_id'], $body);
        if ($error) {
            Response::error($error, 422);
        }

        $this->invoices->updateHeld((int) $id, $header, $lines);
        Response::json($this->invoices->find((int) $id));
    }

    public function destroy(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.void_hold_bill');

        $existing = $this->requireOwnedInvoice($claims, (int) $id);
        if ($existing['status'] !== 'held') {
            Response::error('Only a held bill can be discarded', 422);
        }

        $this->invoices->discardHeld((int) $id);
        Response::json(['deleted' => true]);
    }

    public function complete(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.access');

        $existing = $this->requireOwnedInvoice($claims, (int) $id);
        if ($existing['status'] !== 'held') {
            Response::error('Only a held bill can be completed', 422);
        }

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $payments = $body['payments'] ?? [];

        $hasCredit = array_reduce($payments, fn ($c, $p) => $c || ($p['payment_method'] ?? '') === 'credit', false);
        $sumPayments = array_sum(array_column($payments, 'amount'));
        $impliedCredit = ((float) $existing['grand_total']) - (float) $sumPayments > 0.009;

        if (($hasCredit || $impliedCredit) && $existing['customer_id'] !== null) {
            PermissionMiddleware::require($claims, 'credit.create_credit_sale');
        }

        try {
            $result = $this->invoices->complete((int) $id, $payments, (int) $claims['sub']);
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }

        Response::json($result);
    }

    /** PUT /api/invoices/{id}/edit — in-place edit of a COMPLETED invoice (distinct from update(), which is held-bill only). */
    public function editCompleted(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.edit_completed_invoice');

        $existing = $this->requireOwnedInvoice($claims, (int) $id);
        if ($existing['status'] !== 'completed') {
            Response::error('Only a completed invoice can be edited this way', 422);
        }

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        // bill_type (GST vs Non-GST) and price_type (Normal/Retail/Wholesale)
        // are both immutable once an invoice number has been assigned —
        // never take either from the request for a completed-invoice edit.
        $body['bill_type'] = $existing['bill_type'];
        $body['price_type'] = $existing['price_type'];

        [$header, $lines, $error] = $this->prepareInvoice($claims, (int) $existing['branch_id'], $body);
        if ($error) {
            Response::error($error, 422);
        }

        try {
            $result = $this->invoices->editCompleted((int) $id, $header, $lines, (int) $claims['sub']);
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }

        Response::json($result);
    }

    public function cancel(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.cancel_completed_invoice');

        $this->requireOwnedInvoice($claims, (int) $id);
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        try {
            $result = $this->invoices->cancel((int) $id, (int) $claims['sub'], $body['reason'] ?? null);
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }

        Response::json($result);
    }

    /**
     * POST /api/invoices/{id}/delete — soft-delete a completed invoice
     * (distinct from the void-a-held-bill destroy() above, and from
     * cancel()): reverses stock/credit the same way cancel does, but also
     * frees the invoice number for reuse by the next invoice in the same
     * branch+series+year (section: deleted-number reuse). A cancelled
     * invoice must go through cancel(), never this — its number stays
     * permanently consumed.
     */
    public function deleteCompleted(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.delete_completed_invoice');

        $this->requireOwnedInvoice($claims, (int) $id);
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        try {
            $result = $this->invoices->deleteInvoice((int) $id, (int) $claims['sub'], $body['reason'] ?? null);
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }

        Response::json($result);
    }

    // -------------------------------------------------------------
    // GST E-Invoice (IRN) / E-Way Bill (section 10) — see
    // App\Services\GstEInvoiceService for the honest "not configured until
    // real GSP credentials exist" behavior. These endpoints never fabricate
    // a success; they surface exactly what the service returns.
    // -------------------------------------------------------------

    /** PUT /api/invoices/{id}/transport — transporter details an E-Way Bill needs, saved before generating. */
    public function updateTransportDetails(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.manage_gst_filing');
        $this->requireOwnedInvoice($claims, (int) $id);

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $stmt = $this->pdo->prepare(
            'UPDATE invoices SET transporter_name = :name, transporter_gstin = :gstin,
                transport_distance_km = :distance, vehicle_no = :vehicle_no WHERE id = :id'
        );
        $stmt->execute([
            'name' => $body['transporter_name'] ?? null,
            'gstin' => $body['transporter_gstin'] ?? null,
            'distance' => isset($body['transport_distance_km']) ? (int) $body['transport_distance_km'] : null,
            'vehicle_no' => $body['vehicle_no'] ?? null,
            'id' => (int) $id,
        ]);
        Response::json($this->invoices->find((int) $id));
    }

    public function generateEInvoice(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.manage_gst_filing');
        $invoice = $this->requireOwnedInvoice($claims, (int) $id);
        $customer = $this->fetchCustomer($invoice['customer_id'] ?? null);

        $service = new GstEInvoiceService($this->pdo);
        $eligibility = $service->checkEinvoiceEligibility($invoice, $customer);
        if (!$eligibility['eligible']) {
            Response::error(implode(' ', $eligibility['reasons']), 422);
        }

        $branch = $this->fetchBranch((int) $invoice['branch_id']);
        $result = $service->generateEInvoice($invoice, $invoice['items'], $customer, $branch);
        $this->applyEInvoiceResult((int) $id, $result);
        Response::json(['result' => $result, 'invoice' => $this->invoices->find((int) $id)], $result['success'] ? 200 : 422);
    }

    public function cancelEInvoice(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.manage_gst_filing');
        $invoice = $this->requireOwnedInvoice($claims, (int) $id);
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $service = new GstEInvoiceService($this->pdo);
        $result = $service->cancelEInvoice($invoice, (string) ($body['reason'] ?? 'Cancelled by user'));
        if ($result['success']) {
            $this->pdo->prepare('UPDATE invoices SET einvoice_status = \'cancelled\' WHERE id = :id')->execute(['id' => (int) $id]);
        } else {
            $this->pdo->prepare('UPDATE invoices SET einvoice_error = :err WHERE id = :id')
                ->execute(['err' => substr($result['error'] ?? '', 0, 500), 'id' => (int) $id]);
        }
        Response::json(['result' => $result, 'invoice' => $this->invoices->find((int) $id)], $result['success'] ? 200 : 422);
    }

    public function generateEWayBill(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.manage_gst_filing');
        $invoice = $this->requireOwnedInvoice($claims, (int) $id);
        $customer = $this->fetchCustomer($invoice['customer_id'] ?? null);

        $service = new GstEInvoiceService($this->pdo);
        $eligibility = $service->checkEwayBillEligibility($invoice, $customer);
        if (!$eligibility['eligible']) {
            Response::error(implode(' ', $eligibility['reasons']), 422);
        }

        $branch = $this->fetchBranch((int) $invoice['branch_id']);
        $result = $service->generateEWayBill($invoice, $invoice['items'], $customer, $branch);
        $this->applyEWayBillResult((int) $id, $result);
        Response::json(['result' => $result, 'invoice' => $this->invoices->find((int) $id)], $result['success'] ? 200 : 422);
    }

    public function cancelEWayBill(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.manage_gst_filing');
        $invoice = $this->requireOwnedInvoice($claims, (int) $id);
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $service = new GstEInvoiceService($this->pdo);
        $result = $service->cancelEWayBill($invoice, (string) ($body['reason'] ?? 'Cancelled by user'));
        if ($result['success']) {
            $this->pdo->prepare('UPDATE invoices SET eway_bill_status = \'cancelled\' WHERE id = :id')->execute(['id' => (int) $id]);
        } else {
            $this->pdo->prepare('UPDATE invoices SET eway_bill_error = :err WHERE id = :id')
                ->execute(['err' => substr($result['error'] ?? '', 0, 500), 'id' => (int) $id]);
        }
        Response::json(['result' => $result, 'invoice' => $this->invoices->find((int) $id)], $result['success'] ? 200 : 422);
    }

    private function applyEInvoiceResult(int $invoiceId, array $result): void
    {
        if ($result['success']) {
            $stmt = $this->pdo->prepare(
                'UPDATE invoices SET einvoice_status = \'generated\', irn = :irn, ack_no = :ack_no,
                    ack_date = :ack_date, einvoice_qr_code = :qr, einvoice_error = NULL,
                    einvoice_raw_response = :raw WHERE id = :id'
            );
            $stmt->execute([
                'irn' => $result['irn'] ?? null,
                'ack_no' => $result['ack_no'] ?? null,
                'ack_date' => !empty($result['ack_date']) ? date('Y-m-d', strtotime($result['ack_date'])) : null,
                'qr' => $result['qr_code'] ?? null,
                'raw' => $result['raw_response'] ?? null,
                'id' => $invoiceId,
            ]);
        } else {
            $stmt = $this->pdo->prepare(
                'UPDATE invoices SET einvoice_status = \'failed\', einvoice_error = :err, einvoice_raw_response = :raw WHERE id = :id'
            );
            $stmt->execute(['err' => substr($result['error'] ?? 'Unknown error', 0, 500), 'raw' => $result['raw_response'] ?? null, 'id' => $invoiceId]);
        }
    }

    private function applyEWayBillResult(int $invoiceId, array $result): void
    {
        if ($result['success']) {
            $stmt = $this->pdo->prepare(
                'UPDATE invoices SET eway_bill_status = \'generated\', eway_bill_no = :no,
                    eway_bill_date = :date, eway_bill_valid_until = :valid, eway_bill_error = NULL,
                    eway_bill_raw_response = :raw WHERE id = :id'
            );
            $stmt->execute([
                'no' => $result['eway_bill_no'] ?? null,
                'date' => !empty($result['eway_bill_date']) ? date('Y-m-d H:i:s', strtotime($result['eway_bill_date'])) : null,
                'valid' => !empty($result['valid_until']) ? date('Y-m-d H:i:s', strtotime($result['valid_until'])) : null,
                'raw' => $result['raw_response'] ?? null,
                'id' => $invoiceId,
            ]);
        } else {
            $stmt = $this->pdo->prepare(
                'UPDATE invoices SET eway_bill_status = \'failed\', eway_bill_error = :err, eway_bill_raw_response = :raw WHERE id = :id'
            );
            $stmt->execute(['err' => substr($result['error'] ?? 'Unknown error', 0, 500), 'raw' => $result['raw_response'] ?? null, 'id' => $invoiceId]);
        }
    }

    private function fetchCustomer(?int $customerId): ?array
    {
        if ($customerId === null) {
            return null;
        }
        $stmt = $this->pdo->prepare('SELECT * FROM customers WHERE id = :id');
        $stmt->execute(['id' => $customerId]);
        return $stmt->fetch() ?: null;
    }

    private function fetchBranch(int $branchId): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM branches WHERE id = :id');
        $stmt->execute(['id' => $branchId]);
        return $stmt->fetch() ?: [];
    }

    /** GET /api/invoices/{id}/print — everything a print template needs, pre-computed. */
    public function print(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.access');
        $invoice = $this->requireOwnedInvoice($claims, (int) $id);

        $stmt = $this->pdo->prepare('SELECT * FROM branches WHERE id = :id');
        $stmt->execute(['id' => $invoice['branch_id']]);
        $branch = $stmt->fetch();

        $taxSlabs = [];
        foreach ($invoice['items'] as $item) {
            $pct = (float) $item['tax_percent'];
            $taxSlabs[$pct] ??= ['gst_percent' => $pct, 'taxable' => 0, 'cgst' => 0, 'sgst' => 0, 'cess' => 0];
            $taxSlabs[$pct]['taxable'] += (float) $item['line_total'];
            $taxSlabs[$pct]['cgst'] += round((float) $item['tax_amount'] / 2, 2);
            $taxSlabs[$pct]['sgst'] += (float) $item['tax_amount'] - round((float) $item['tax_amount'] / 2, 2);
            $taxSlabs[$pct]['cess'] += (float) $item['cess_amount'];
        }

        $outstanding = $invoice['customer_id']
            ? (new CreditLedgerService($this->pdo))->currentOutstanding((int) $invoice['customer_id'])
            : null;

        Response::json([
            'invoice' => $invoice,
            'branch' => $branch,
            'tax_slabs' => array_values($taxSlabs),
            'amount_in_words' => NumberToWords::convert((float) $invoice['grand_total']),
            'customer_outstanding' => $outstanding,
        ]);
    }

    // -------------------------------------------------------------

    private function requireOwnedInvoice(array $claims, int $id): array
    {
        $invoice = $this->invoices->find($id);
        if (!$invoice) {
            Response::error('Not found', 404);
        }

        $canSwitch = in_array('branches.switch_context', (array) ($claims['permissions'] ?? []), true);
        if (!$canSwitch && (int) $invoice['branch_id'] !== (int) $claims['branch_id']) {
            Response::error('Not found', 404);
        }

        return $invoice;
    }

    /** @return array{0: array, 1: array, 2: ?string} */
    private function prepareInvoice(array $claims, int $branchId, array $body): array
    {
        $billType = $body['bill_type'] ?? 'gst';
        if (!in_array($billType, ['gst', 'non_gst'], true)) {
            return [[], [], 'bill_type must be gst or non_gst'];
        }
        $requiredBillingPerm = $billType === 'gst' ? 'pos.gst_billing' : 'pos.non_gst_billing';
        if (!in_array($requiredBillingPerm, (array) ($claims['permissions'] ?? []), true)) {
            return [[], [], "Missing permission '{$requiredBillingPerm}'"];
        }

        // price_type (Phase 14) is independent of bill_type — it only picks
        // which rate resolveSellingPrice() returns, never whether GST applies.
        $priceType = $body['price_type'] ?? 'normal';
        if (!in_array($priceType, ['normal', 'retail', 'wholesale'], true)) {
            return [[], [], 'price_type must be normal, retail or wholesale'];
        }

        $customerId = !empty($body['customer_id']) ? (int) $body['customer_id'] : null;
        $invoiceFormat = 'local';
        if ($customerId !== null) {
            $stmt = $this->pdo->prepare('SELECT is_local_customer FROM customers WHERE id = :id AND branch_id = :branch_id');
            $stmt->execute(['id' => $customerId, 'branch_id' => $branchId]);
            $customer = $stmt->fetch();
            if (!$customer) {
                return [[], [], 'Customer not found in this branch'];
            }
            $invoiceFormat = $customer['is_local_customer'] ? 'local' : 'outstation';
        }

        $stmtSettings = $this->pdo->prepare('SELECT allow_local_free_qty, allow_distance_free_qty FROM branch_print_settings WHERE branch_id = :branch_id');
        $stmtSettings->execute(['branch_id' => $branchId]);
        $freeQtyConfig = $stmtSettings->fetch();
        $allowLocal = (int) ($freeQtyConfig['allow_local_free_qty'] ?? 1);
        $allowDistance = (int) ($freeQtyConfig['allow_distance_free_qty'] ?? 0);
        $isFreeQtyAllowed = $invoiceFormat === 'local' ? ($allowLocal === 1) : ($allowDistance === 1);

        $cartInput = $body['items'] ?? [];
        if (empty($cartInput)) {
            return [[], [], 'At least one item is required'];
        }

        $canEditPrice = in_array('pos.edit_price_at_sale', (array) ($claims['permissions'] ?? []), true);
        $canDiscount = in_array('pos.apply_discount', (array) ($claims['permissions'] ?? []), true);

        $lines = [];
        foreach ($cartInput as $line) {
            if (empty($line['item_id']) || empty($line['qty'])) {
                return [[], [], 'Each cart line needs item_id and qty'];
            }
            $stmt = $this->pdo->prepare(
                'SELECT i.*, tc.gst_percent, tc.cess_percent
                 FROM items i LEFT JOIN tax_codes tc ON tc.id = i.tax_code_id
                 WHERE i.id = :id'
            );
            $stmt->execute(['id' => (int) $line['item_id']]);
            $item = $stmt->fetch();
            if (!$item) {
                return [[], [], "Item {$line['item_id']} not found"];
            }

            if (!$canEditPrice) {
                unset($line['rate']);
            }
            if (!$canDiscount) {
                unset($line['discount_percent'], $line['discount_amount']);
            }
            if (!$isFreeQtyAllowed) {
                $line['free_qty'] = 0;
            }

            $lines[] = $this->invoices->priceLine($item, $line, $billType, $priceType);
        }

        $header = [
            'branch_id' => $branchId,
            'customer_id' => $customerId,
            'employee_id' => (int) $claims['sub'],
            'bill_type' => $billType,
            'price_type' => $priceType,
            'invoice_format' => $invoiceFormat,
            'vehicle_no' => $body['vehicle_no'] ?? null,
        ];

        return [$header, $lines, null];
    }
}
