-- Migration: Create pricing_types table and alter customers.pricing_type to VARCHAR(100)
CREATE TABLE IF NOT EXISTS pricing_types (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(100) NOT NULL UNIQUE,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO pricing_types (name, code, is_default) VALUES
('Normal', 'normal', 1),
('Retail', 'retail', 0),
('Wholesale', 'wholesale', 0);

ALTER TABLE customers MODIFY COLUMN pricing_type VARCHAR(100) NOT NULL DEFAULT 'normal';
