-- Add bag_count column to bill_lines
ALTER TABLE bill_lines ADD COLUMN bag_count INT NULL DEFAULT NULL AFTER line_order;
