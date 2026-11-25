-- Add is_active column to stock_units
ALTER TABLE stock_units ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER is_decimal;
