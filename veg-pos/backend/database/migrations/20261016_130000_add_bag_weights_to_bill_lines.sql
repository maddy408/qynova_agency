-- Add bag_weights column to bill_lines to support weight-splitting across individual bags
ALTER TABLE bill_lines ADD COLUMN bag_weights TEXT NULL DEFAULT NULL AFTER bag_count;
