<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\CodeGenerator;
use App\Helpers\Response;
use App\Helpers\ValidationException;
use App\Middleware\AuthMiddleware;
use App\Services\AuditLogger;
use App\Services\LedgerService;
use PDO;

class BillController
{
    public function __construct(private PDO $pdo)
    {
    }

    public function index(): void
    {
        AuthMiddleware::authenticate();
        $sql = 'SELECT b.*, p.name AS party_name, pm.name_ta AS payment_method_name
                FROM bills b
                LEFT JOIN parties p ON p.id = b.party_id
                LEFT JOIN payment_methods pm ON pm.id = b.payment_method_id
                WHERE 1=1';
        $params = [];

        foreach (['location_type', 'bill_type'] as $f) {
            if (!empty($_GET[$f])) {
                $sql .= " AND b.$f = :$f";
                $params[$f] = $_GET[$f];
            }
        }
        if (!empty($_GET['party_id'])) {
            $sql .= ' AND b.party_id = :party_id';
            $params['party_id'] = $_GET['party_id'];
        }
        if (!empty($_GET['bill_no'])) {
            $sql .= ' AND b.bill_no LIKE :bill_no';
            $params['bill_no'] = '%' . $_GET['bill_no'] . '%';
        }
        if (!empty($_GET['from'])) {
            $sql .= ' AND b.bill_date >= :from';
            $params['from'] = $_GET['from'];
        }
        if (!empty($_GET['to'])) {
            $sql .= ' AND b.bill_date <= :to';
            $params['to'] = $_GET['to'];
        }
        if (!empty($_GET['status'])) {
            $sql .= ' AND b.status = :status';
            $params['status'] = $_GET['status'];
        } else {
            $sql .= " AND b.status != 'cancelled'";
        }
        if (!empty($_GET['payment_status'])) {
            if ($_GET['payment_status'] === 'paid') {
                $sql .= ' AND b.balance_due <= 0.009';
            } elseif ($_GET['payment_status'] === 'unpaid') {
                $sql .= ' AND b.paid_amount <= 0.009 AND b.balance_due > 0.009';
            } elseif ($_GET['payment_status'] === 'partial') {
                $sql .= ' AND b.paid_amount > 0.009 AND b.balance_due > 0.009';
            }
        }

        $sql .= ' ORDER BY b.bill_date DESC, b.id DESC LIMIT 500';

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        Response::json($stmt->fetchAll());
    }

    public function show(string $id): void
    {
        AuthMiddleware::authenticate();
        $bill = $this->fetchBillWithLines((int) $id);
        if (!$bill) {
            Response::error('Bill not found', 404);
        }
        Response::json($bill);
    }

    public function store(): void
    {
        $claims = AuthMiddleware::authenticate();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $this->pdo->beginTransaction();
        try {
            $billId = $this->createBill($body, $claims);
            $this->pdo->commit();
            Response::json($this->fetchBillWithLines($billId), 201);
        } catch (ValidationException $e) {
            $this->pdo->rollBack();
            Response::error($e->getMessage(), 422);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Failed to save bill: ' . $e->getMessage(), 500);
        }
    }

    public function update(string $id): void
    {
        $claims = AuthMiddleware::authenticate();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $stmt = $this->pdo->prepare("SELECT * FROM bills WHERE id = :id AND status != 'cancelled'");
        $stmt->execute(['id' => $id]);
        $existing = $stmt->fetch();
        if (!$existing) {
            Response::error('Bill not found', 404);
        }

        $this->pdo->beginTransaction();
        try {
            LedgerService::reverse($this->pdo, 'bill', (int) $id);
            $this->pdo->prepare('DELETE FROM bill_lines WHERE bill_id = :id')->execute(['id' => $id]);

            $this->applyBillFields((int) $id, $body, $claims, $existing['bill_no'], $existing['series_key'], $existing['location_type'], $existing['bill_type']);

            AuditLogger::log($this->pdo, $claims, 'update', 'bill', (int) $id, ['bill_no' => $existing['bill_no']]);
            $this->pdo->commit();
            Response::json($this->fetchBillWithLines((int) $id));
        } catch (ValidationException $e) {
            $this->pdo->rollBack();
            Response::error($e->getMessage(), 422);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Failed to update bill: ' . $e->getMessage(), 500);
        }
    }

    public function destroy(string $id): void
    {
        $claims = AuthMiddleware::authenticate();
        AuthMiddleware::requireRole($claims, ['admin', 'manager']);

        $stmt = $this->pdo->prepare("SELECT * FROM bills WHERE id = :id AND status != 'cancelled'");
        $stmt->execute(['id' => $id]);
        $bill = $stmt->fetch();
        if (!$bill) {
            Response::error('Bill not found', 404);
        }

        $this->pdo->beginTransaction();
        try {
            LedgerService::reverse($this->pdo, 'bill', (int) $id);
            $this->pdo->prepare("UPDATE bills SET status = 'cancelled' WHERE id = :id")->execute(['id' => $id]);
            AuditLogger::log($this->pdo, $claims, 'delete', 'bill', (int) $id, ['bill_no' => $bill['bill_no']]);
            $this->pdo->commit();
            Response::json(['ok' => true]);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Failed to delete bill: ' . $e->getMessage(), 500);
        }
    }

    public function print(string $id): void
    {
        AuthMiddleware::authenticate();
        $bill = $this->fetchBillWithLines((int) $id);
        if (!$bill) {
            Response::error('Bill not found', 404);
        }

        $settingsStmt = $this->pdo->query('SELECT `key`, `value` FROM settings');
        $settings = [];
        foreach ($settingsStmt->fetchAll() as $row) {
            $settings[$row['key']] = $row['value'];
        }

        Response::json(['bill' => $bill, 'settings' => $settings]);
    }

    /**
     * @param array<string, mixed> $body
     * @param array<string, mixed> $claims
     */
    private function createBill(array $body, array $claims): int
    {
        $locationType = $body['location_type'] ?? 'local';
        $billType = $body['bill_type'] ?? 'normal';

        $seriesKey = match (true) {
            $billType === 'quick' => 'QUICK',
            $billType === 'commission' && $locationType === 'distant' => 'DISTANT-COMMISSION',
            $billType === 'commission' => 'LOCAL-COMMISSION',
            $locationType === 'distant' => 'DISTANT-NORMAL',
            default => 'LOCAL-NORMAL',
        };

        $billNo = CodeGenerator::nextBillNumber($this->pdo, $seriesKey);

        $stmt = $this->pdo->prepare(
            'INSERT INTO bills (bill_no, series_key, location_type, bill_type, party_id, walkin_name, bill_date,
                created_by, updated_by)
             VALUES (:bill_no, :series_key, :location_type, :bill_type, :party_id, :walkin_name, :bill_date, :created_by, :updated_by)'
        );
        $stmt->execute([
            'bill_no' => $billNo,
            'series_key' => $seriesKey,
            'location_type' => $locationType,
            'bill_type' => $billType,
            'party_id' => $body['party_id'] ?? null,
            'walkin_name' => $body['walkin_name'] ?? null,
            'bill_date' => $body['bill_date'] ?? date('Y-m-d'),
            'created_by' => $claims['uid'],
            'updated_by' => $claims['uid'],
        ]);
        $billId = (int) $this->pdo->lastInsertId();

        $this->applyBillFields($billId, $body, $claims, $billNo, $seriesKey, $locationType, $billType);

        AuditLogger::log($this->pdo, $claims, 'create', 'bill', $billId, ['bill_no' => $billNo]);

        return $billId;
    }

    /**
     * Writes lines + computed totals + the ledger effect for a (re)created
     * bill row. Shared by create and update so the math never diverges.
     *
     * @param array<string, mixed> $body
     * @param array<string, mixed> $claims
     */
    private function applyBillFields(int $billId, array $body, array $claims, string $billNo, string $seriesKey, string $locationType, string $billType): void
    {
        $lines = $body['lines'] ?? [];
        $itemsTotal = 0.0;
        $order = 0;
        $insertLine = $this->pdo->prepare(
            'INSERT INTO bill_lines (bill_id, item_id, item_name_ta, item_name_en, unit, is_charge_item, rate, nos, weight, amount, line_order, bag_count)
             VALUES (:bill_id, :item_id, :item_name_ta, :item_name_en, :unit, :is_charge_item, :rate, :nos, :weight, :amount, :line_order, :bag_count)'
        );

        foreach ($lines as $line) {
            $isCharge = !empty($line['is_charge_item']);
            $rate = (float) ($line['rate'] ?? 0);
            $nos = (float) ($line['nos'] ?? 0);
            $weight = (float) ($line['weight'] ?? 0);
            if ($rate < 0 || $nos < 0 || $weight < 0) {
                throw new ValidationException('Item rate/quantity cannot be negative');
            }
            $amount = round($isCharge ? $rate * $nos : $rate * $weight, 2);
            $itemsTotal += $amount;

            $bagCount = null;
            if (isset($line['bag_count']) && $line['bag_count'] !== '' && $line['bag_count'] !== null) {
                $bagCount = (int) $line['bag_count'];
            } elseif (isset($line['nos']) && $line['nos'] !== '' && $line['nos'] !== null && (float) $line['nos'] > 0) {
                $bagCount = (int) $line['nos'];
            }

            $insertLine->execute([
                'bill_id' => $billId,
                'item_id' => $line['item_id'] ?? null,
                'item_name_ta' => $line['item_name_ta'] ?? '',
                'item_name_en' => $line['item_name_en'] ?? '',
                'unit' => $line['unit'] ?? 'kg',
                'is_charge_item' => $isCharge ? 1 : 0,
                'rate' => $rate,
                'nos' => $nos,
                'weight' => $weight,
                'amount' => $amount,
                'line_order' => $order++,
                'bag_count' => $bagCount,
            ]);
        }
        $itemsTotal = round($itemsTotal, 2);

        $partyId = $body['party_id'] ?? null;
        $paidAmount = round((float) ($body['paid_amount'] ?? 0), 2);
        $paymentMethodId = $body['payment_method_id'] ?? null;

        $previousBalance = $partyId ? LedgerService::balanceAsOf($this->pdo, (int) $partyId, null, $billId) : 0.0;

        if ($billType === 'commission') {
            // Commission mode is explicit (not inferred) so a bill can be
            // edited back and forth between modes without ever double
            // counting: whichever mode is active supplies the ONE
            // commission_amount used below — the other mode's field is
            // still persisted (so the UI can restore it) but never applied.
            $commissionMode = ($body['commission_mode'] ?? 'percentage') === 'fixed' ? 'fixed' : 'percentage';
            $grossTotal = $itemsTotal;

            if ($commissionMode === 'percentage') {
                $commissionPercent = (float) ($body['commission_percent'] ?? 0);
                if ($commissionPercent < 0) {
                    throw new ValidationException('Commission percentage cannot be negative');
                }
                $commissionAmount = round($grossTotal * $commissionPercent / 100, 2);
            } else {
                $commissionPercent = null;
                $commissionAmount = round((float) ($body['commission_amount'] ?? 0), 2);
                if ($commissionAmount < 0) {
                    throw new ValidationException('Commission amount cannot be negative');
                }
            }

            $patthu = round((float) ($body['patthu_amount'] ?? 0), 2);
            $cooli = round((float) ($body['cooli_amount'] ?? 0), 2);
            $vadagai = round((float) ($body['vadagai_amount'] ?? 0), 2);
            $otherDeduction = round((float) ($body['other_deduction_amount'] ?? 0), 2);
            foreach (['patthu' => $patthu, 'cooli' => $cooli, 'vadagai' => $vadagai, 'other_deduction' => $otherDeduction] as $label => $value) {
                if ($value < 0) {
                    throw new ValidationException(ucfirst(str_replace('_', ' ', $label)) . ' cannot be negative');
                }
            }

            // Commission Side Total = Commission + Pattru + Cooli + Vadagai + Other Deductions.
            $totalDeductions = round($commissionAmount + $patthu + $cooli + $vadagai + $otherDeduction, 2);

            if ($totalDeductions > $grossTotal + 0.009) {
                throw new ValidationException(sprintf(
                    'Commission Side Total (₹%s) cannot exceed Total Item Sales (₹%s)',
                    number_format($totalDeductions, 2),
                    number_format($grossTotal, 2)
                ));
            }

            // Final Total = Total Item Sales − Commission Side Total.
            $netTotal = round($grossTotal - $totalDeductions, 2);
            $balanceDue = round($netTotal - $paidAmount, 2);

            $stmt = $this->pdo->prepare(
                'UPDATE bills SET items_total = :items_total, discount_percent = NULL, discount_amount = 0,
                    previous_balance = :previous_balance, commission_percent = :commission_percent,
                    commission_mode = :commission_mode,
                    commission_amount = :commission_amount, patthu_amount = :patthu, cooli_amount = :cooli,
                    vadagai_amount = :vadagai, other_deduction_amount = :other_deduction,
                    total_deductions = :total_deductions, grand_total = :net_total,
                    paid_amount = :paid_amount, payment_method_id = :payment_method_id, balance_due = :balance_due,
                    notes = :notes, updated_by = :updated_by
                 WHERE id = :id'
            );
            $stmt->execute([
                'id' => $billId,
                'items_total' => $grossTotal,
                'previous_balance' => $previousBalance,
                'commission_percent' => $commissionPercent,
                'commission_mode' => $commissionMode,
                'commission_amount' => $commissionAmount,
                'patthu' => $patthu,
                'cooli' => $cooli,
                'vadagai' => $vadagai,
                'other_deduction' => $otherDeduction,
                'total_deductions' => $totalDeductions,
                'net_total' => $netTotal,
                'paid_amount' => $paidAmount,
                'payment_method_id' => $paymentMethodId,
                'balance_due' => $balanceDue,
                'notes' => $body['notes'] ?? null,
                'updated_by' => $claims['uid'],
            ]);

            if ($partyId) {
                LedgerService::post($this->pdo, (int) $partyId, $body['bill_date'] ?? date('Y-m-d'), 'bill', $billId, -$balanceDue, "Commission bill {$billNo}");
            }
        } else {
            $discountPercent = isset($body['discount_percent']) ? (float) $body['discount_percent'] : null;
            if ($discountPercent !== null && $discountPercent < 0) {
                throw new ValidationException('Discount percentage cannot be negative');
            }
            $discountAmount = $discountPercent !== null
                ? round($itemsTotal * $discountPercent / 100, 2)
                : round((float) ($body['discount_amount'] ?? 0), 2);
            if ($discountAmount < 0) {
                throw new ValidationException('Discount amount cannot be negative');
            }
            $todayTotal = round($itemsTotal - $discountAmount, 2);
            $grandTotal = round($todayTotal + max(0.0, (float) $previousBalance), 2);
            $balanceDue = round(max(0.0, $todayTotal - $paidAmount), 2);

            $stmt = $this->pdo->prepare(
                'UPDATE bills SET items_total = :items_total, discount_percent = :discount_percent,
                    discount_amount = :discount_amount, previous_balance = :previous_balance,
                    commission_percent = NULL, commission_mode = \'percentage\', commission_amount = 0,
                    patthu_amount = 0, cooli_amount = 0, vadagai_amount = 0, other_deduction_amount = 0,
                    total_deductions = 0, grand_total = :grand_total, paid_amount = :paid_amount,
                    payment_method_id = :payment_method_id, balance_due = :balance_due, notes = :notes,
                    updated_by = :updated_by
                 WHERE id = :id'
            );
            $stmt->execute([
                'id' => $billId,
                'items_total' => $itemsTotal,
                'discount_percent' => $discountPercent,
                'discount_amount' => $discountAmount,
                'previous_balance' => $previousBalance,
                'grand_total' => $grandTotal,
                'paid_amount' => $paidAmount,
                'payment_method_id' => $paymentMethodId,
                'balance_due' => $balanceDue,
                'notes' => $body['notes'] ?? null,
                'updated_by' => $claims['uid'],
            ]);

            if ($partyId) {
                $netChange = round($todayTotal - $paidAmount, 2);
                LedgerService::post($this->pdo, (int) $partyId, $body['bill_date'] ?? date('Y-m-d'), 'bill', $billId, $netChange, "Bill {$billNo}");
            }
        }
    }

    private function fetchBillWithLines(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT b.*, p.name AS party_name, p.phone AS party_phone, p.place AS party_place,
                    pm.name_ta AS payment_method_name_ta, pm.name_en AS payment_method_name_en
             FROM bills b
             LEFT JOIN parties p ON p.id = b.party_id
             LEFT JOIN payment_methods pm ON pm.id = b.payment_method_id
             WHERE b.id = :id'
        );
        $stmt->execute(['id' => $id]);
        $bill = $stmt->fetch();
        if (!$bill) {
            return null;
        }

        $lines = $this->pdo->prepare('SELECT * FROM bill_lines WHERE bill_id = :id ORDER BY line_order ASC');
        $lines->execute(['id' => $id]);
        $bill['lines'] = $lines->fetchAll();

        return $bill;
    }
}
