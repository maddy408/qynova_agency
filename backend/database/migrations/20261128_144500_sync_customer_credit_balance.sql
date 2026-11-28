-- Migration: 20261128_144500_sync_customer_credit_balance.sql
-- Purpose: Sync customer credit balance, opening balance, and ensure initial credit ledger transactions

-- 1. Sync opening_balance from credit_limit for existing customers who have credit_limit set but opening_balance was 0
UPDATE customers 
SET opening_balance = credit_limit 
WHERE (opening_balance IS NULL OR opening_balance <= 0.009) 
  AND credit_limit > 0.009;

-- 2. Insert initial credit_transactions entry for any customer with positive balance who doesn't yet have a ledger entry
INSERT INTO credit_transactions (customer_id, transaction_type, amount, invoice_id, balance_before, balance_after, notes, created_by, created_at)
SELECT 
    c.id AS customer_id,
    'sale_credit' AS transaction_type,
    c.opening_balance AS amount,
    NULL AS invoice_id,
    0.00 AS balance_before,
    c.opening_balance AS balance_after,
    'Opening balance / initial credit' AS notes,
    1 AS created_by,
    c.created_at
FROM customers c
WHERE c.opening_balance > 0.009
  AND NOT EXISTS (
      SELECT 1 FROM credit_transactions ct WHERE ct.customer_id = c.id
  );
