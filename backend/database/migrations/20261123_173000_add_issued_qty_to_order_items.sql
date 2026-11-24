-- Add issued_qty to customer_prebooking_items and purchase_request_items for van stock order linking
ALTER TABLE customer_prebooking_items ADD COLUMN issued_qty DECIMAL(12,3) NOT NULL DEFAULT 0.000 AFTER qty;
ALTER TABLE purchase_request_items ADD COLUMN issued_qty DECIMAL(12,3) NOT NULL DEFAULT 0.000 AFTER qty;
