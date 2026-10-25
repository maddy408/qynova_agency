-- Migration: Change customers.pricing_type to VARCHAR(50) to support dynamic/custom pricing types seamlessly
ALTER TABLE customers
  MODIFY COLUMN pricing_type VARCHAR(50) NOT NULL DEFAULT 'normal';
