<?php

declare(strict_types=1);

namespace App\Services;

use PDO;

/**
 * Append-only customer credit ledger (section 4.10 / rule 6). Never mutate a
 * running balance column — current outstanding is always the latest
 * balance_after row for that customer. Locks the customer row first so two
 * concurrent transactions for the same customer can't compute the same
 * "balance_before" and race.
 */
class CreditLedgerService
{
    public function __construct(private PDO $pdo)
    {
    }

    public function currentOutstanding(int $customerId): float
    {
        $stmt = $this->pdo->prepare(
            'SELECT balance_after FROM credit_transactions
             WHERE customer_id = :customer_id ORDER BY id DESC LIMIT 1'
        );
        $stmt->execute(['customer_id' => $customerId]);
        $row = $stmt->fetch();
        if ($row) {
            return (float) $row['balance_after'];
        }

        // Fallback to customer's opening balance or credit limit if no ledger entries yet
        $custStmt = $this->pdo->prepare(
            'SELECT opening_balance, credit_limit FROM customers WHERE id = :customer_id'
        );
        $custStmt->execute(['customer_id' => $customerId]);
        $cust = $custStmt->fetch();
        if ($cust) {
            $ob = (float) ($cust['opening_balance'] ?? 0);
            if ($ob > 0.009) {
                return $ob;
            }
            $cl = (float) ($cust['credit_limit'] ?? 0);
            if ($cl > 0.009) {
                return $cl;
            }
        }

        return 0.0;
    }

    public function record(
        int $customerId,
        string $type,
        float $amount,
        ?int $invoiceId,
        ?string $notes,
        ?int $createdBy
    ): float {
        // Serialize concurrent writers for this customer.
        $this->pdo->prepare('SELECT id FROM customers WHERE id = :id FOR UPDATE')
            ->execute(['id' => $customerId]);

        $balanceBefore = $this->currentOutstanding($customerId);
        // sale_credit increases what the customer owes; payment_received and
        // credit_reversal (e.g. a sales return against a credit sale) both reduce it.
        $reducesBalance = in_array($type, ['payment_received', 'credit_reversal'], true);
        $signedAmount = $reducesBalance ? -abs($amount) : abs($amount);
        $balanceAfter = round($balanceBefore + $signedAmount, 2);

        $this->pdo->prepare(
            'INSERT INTO credit_transactions
                (customer_id, transaction_type, amount, invoice_id, balance_before, balance_after, notes, created_by)
             VALUES
                (:customer_id, :type, :amount, :invoice_id, :balance_before, :balance_after, :notes, :created_by)'
        )->execute([
            'customer_id' => $customerId,
            'type' => $type,
            'amount' => abs($amount),
            'invoice_id' => $invoiceId,
            'balance_before' => $balanceBefore,
            'balance_after' => $balanceAfter,
            'notes' => $notes,
            'created_by' => $createdBy,
        ]);

        return $balanceAfter;
    }
}
