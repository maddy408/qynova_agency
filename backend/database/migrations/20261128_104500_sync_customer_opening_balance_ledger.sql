-- Migration: Backfill customer opening balance into credit_transactions if not already recorded.
-- Ensures all customers with opening balances have an append-only ledger transaction row.

INSERT INTO credit_transactions (customer_id, transaction_type, amount, invoice_id, balance_before, balance_after, notes, created_by, created_at)
SELECT 
    c.id AS customer_id,
    'sale_credit' AS transaction_type,
    c.opening_balance AS amount,
    NULL AS invoice_id,
    0.00 AS balance_before,
    c.opening_balance AS balance_after,
    'Opening balance' AS notes,
    COALESCE((SELECT id FROM users WHERE branch_id = c.branch_id ORDER BY id ASC LIMIT 1), 1) AS created_by,
    c.created_at
FROM customers c
WHERE c.opening_balance > 0.009
  AND NOT EXISTS (
      SELECT 1 FROM credit_transactions ct WHERE ct.customer_id = c.id
  );
