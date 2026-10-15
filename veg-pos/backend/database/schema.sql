-- Wholesale vegetable commission shop — schema
-- Charset utf8mb4 throughout so Tamil text stores/prints correctly.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    pin_hash VARCHAR(255) NULL,
    role ENUM('admin','manager','staff') NOT NULL DEFAULT 'staff',
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payment_methods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name_ta VARCHAR(50) NOT NULL,
    name_en VARCHAR(50) NOT NULL,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name_ta VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    unit VARCHAR(20) NOT NULL DEFAULT 'kg',
    default_rate DECIMAL(10,2) NULL,
    is_charge_item TINYINT(1) NOT NULL DEFAULT 0,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS parties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) NULL,
    place VARCHAR(150) NULL,
    type ENUM('customer','supplier','both') NOT NULL DEFAULT 'customer',
    opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One unified running ledger per party. amount > 0 = party owes the shop more
-- (receivable); amount < 0 = the shop owes the party more (payable). The
-- balance is always SUM(amount) up to a point in time — never stored
-- redundantly, so it can never drift as long as every write goes through a
-- DB transaction alongside its source row.
CREATE TABLE IF NOT EXISTS ledger_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    party_id INT NOT NULL,
    entry_date DATE NOT NULL,
    ref_type ENUM('bill','purchase','payment','opening','adjustment') NOT NULL,
    ref_id INT NULL,
    amount DECIMAL(12,2) NOT NULL,
    description VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (party_id) REFERENCES parties(id),
    INDEX idx_ledger_party_date (party_id, entry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bill_sequences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    series_key VARCHAR(30) NOT NULL UNIQUE,
    prefix VARCHAR(10) NOT NULL,
    next_number INT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bill_no VARCHAR(20) NOT NULL,
    series_key VARCHAR(30) NOT NULL,
    location_type ENUM('local','distant') NOT NULL DEFAULT 'local',
    bill_type ENUM('normal','commission','quick') NOT NULL DEFAULT 'normal',
    party_id INT NULL,
    walkin_name VARCHAR(150) NULL,
    bill_date DATE NOT NULL,
    items_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_percent DECIMAL(5,2) NULL,
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    previous_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    commission_percent DECIMAL(5,2) NULL,
    commission_mode ENUM('percentage','fixed') NOT NULL DEFAULT 'percentage',
    commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    patthu_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    cooli_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    vadagai_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    other_deduction_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
    grand_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    payment_method_id INT NULL,
    balance_due DECIMAL(12,2) NOT NULL DEFAULT 0,
    status ENUM('active','cancelled') NOT NULL DEFAULT 'active',
    notes VARCHAR(255) NULL,
    created_by INT NULL,
    updated_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_bill_series_no (series_key, bill_no),
    FOREIGN KEY (party_id) REFERENCES parties(id),
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id),
    INDEX idx_bills_date (bill_date),
    INDEX idx_bills_party (party_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bill_lines (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bill_id INT NOT NULL,
    item_id INT NULL,
    item_name_ta VARCHAR(100) NOT NULL,
    item_name_en VARCHAR(100) NOT NULL,
    unit VARCHAR(20) NOT NULL DEFAULT 'kg',
    is_charge_item TINYINT(1) NOT NULL DEFAULT 0,
    rate DECIMAL(10,2) NOT NULL DEFAULT 0,
    nos DECIMAL(10,2) NOT NULL DEFAULT 0,
    weight DECIMAL(10,2) NOT NULL DEFAULT 0,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    line_order INT NOT NULL DEFAULT 0,
    bag_count INT NULL DEFAULT NULL,
    FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS held_bills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    label VARCHAR(100) NULL,
    cart_json LONGTEXT NOT NULL,
    location_type ENUM('local','distant') NOT NULL DEFAULT 'local',
    bill_type ENUM('normal','commission','quick') NOT NULL DEFAULT 'normal',
    party_id INT NULL,
    created_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_no VARCHAR(20) NOT NULL UNIQUE,
    party_id INT NOT NULL,
    purchase_date DATE NOT NULL,
    items_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    payment_method_id INT NULL,
    balance_due DECIMAL(12,2) NOT NULL DEFAULT 0,
    status ENUM('active','cancelled') NOT NULL DEFAULT 'active',
    created_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (party_id) REFERENCES parties(id),
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_lines (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_id INT NOT NULL,
    item_id INT NULL,
    item_name_ta VARCHAR(100) NOT NULL,
    item_name_en VARCHAR(100) NOT NULL,
    nos DECIMAL(10,2) NOT NULL DEFAULT 0,
    weight DECIMAL(10,2) NOT NULL DEFAULT 0,
    rate DECIMAL(10,2) NOT NULL DEFAULT 0,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    line_order INT NOT NULL DEFAULT 0,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One receipt table for both directions: 'in' = party pays the shop
-- (customer collection), 'out' = the shop pays the party (supplier/
-- commission-farmer payment). Keeping one table/allocation structure avoids
-- duplicating the FIFO/manual/on-account allocation logic for both flows.
CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    receipt_no VARCHAR(20) NOT NULL UNIQUE,
    direction ENUM('in','out') NOT NULL DEFAULT 'in',
    party_id INT NOT NULL,
    payment_date DATE NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method_id INT NULL,
    allocation_mode ENUM('auto','manual','on_account') NOT NULL DEFAULT 'on_account',
    notes VARCHAR(255) NULL,
    status ENUM('active','cancelled') NOT NULL DEFAULT 'active',
    created_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (party_id) REFERENCES parties(id),
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payment_allocations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT NOT NULL,
    bill_id INT NULL,
    purchase_id INT NULL,
    amount DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
    FOREIGN KEY (bill_id) REFERENCES bills(id),
    FOREIGN KEY (purchase_id) REFERENCES purchases(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
    `key` VARCHAR(100) NOT NULL PRIMARY KEY,
    `value` LONGTEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    username VARCHAR(50) NULL,
    action VARCHAR(30) NOT NULL,
    entity_type VARCHAR(30) NOT NULL,
    entity_id INT NULL,
    details LONGTEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
