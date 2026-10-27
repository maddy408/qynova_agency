-- =====================================================================
-- AJ Agency POS / Distributor Billing System — Complete Database Schema
-- Consolidated from schema.sql + schema_phase2.sql .. schema_phase15.sql
-- (the exact, already-applied migration sequence for this project,
-- concatenated in order — nothing rewritten, nothing invented).
--
-- Usage (fresh database):
--   mysql -u root -p pos_system < schema.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Source: schema.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- POS / Distributor Billing System — Phase 1 Schema (Auth + Permissions)
-- MariaDB/MySQL-safe (targets XAMPP's bundled MariaDB)
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- company (1 row today; future multi-tenant SaaS use)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- branches (invoice-branding fields, per spec section 3.1)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  branch_name VARCHAR(150) NOT NULL,
  print_name VARCHAR(150) NOT NULL,
  logo_path VARCHAR(255) NULL,
  gstin VARCHAR(20) NULL,
  pan_number VARCHAR(20) NULL,
  address_line1 VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  pincode VARCHAR(10) NULL,
  phone VARCHAR(20) NULL,
  support_email VARCHAR(150) NULL,
  is_main_branch TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_branches_company FOREIGN KEY (company_id) REFERENCES company(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- roles (branch_id NULL = system-wide role template)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NULL,
  name VARCHAR(50) NOT NULL,
  is_system_role TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_roles_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- permissions (registry — module + unique code + human label)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  module VARCHAR(50) NOT NULL,
  code VARCHAR(100) NOT NULL,
  label VARCHAR(150) NOT NULL,
  description VARCHAR(255) NULL,
  UNIQUE KEY uq_permissions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- role_permissions (what a role grants by default)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NULL,
  role_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT fk_users_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- user_permissions (per-employee override on top of their role)
-- is_granted = 1 explicit allow, 0 explicit deny — either overrides the role
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  is_granted TINYINT(1) NOT NULL,
  granted_by INT UNSIGNED NULL,
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, permission_id),
  CONSTRAINT fk_up_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_up_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_up_granted_by FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- login_log (audit)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_log (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  email_attempted VARCHAR(150) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  success TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_login_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- Source: schema_phase2.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- POS / Distributor Billing System — Phase 2 Schema (Catalog & Parties)
-- Run AFTER schema.sql + seed.sql (Phase 1). MariaDB/MySQL-safe.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Catalog — shared/global across all branches (section 3.2 of spec)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  parent_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS brands (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_brands_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_lines (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NULL,
  code VARCHAR(20) NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_product_lines_code (code),
  CONSTRAINT fk_product_lines_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tax_codes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  gst_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  cgst_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  sgst_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  igst_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  cess_percent DECIMAL(5,2) NULL,
  UNIQUE KEY uq_tax_codes_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_units (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  short_code VARCHAR(10) NOT NULL,
  is_decimal TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_stock_units_short_code (short_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_code VARCHAR(20) NULL,
  item_name VARCHAR(150) NOT NULL,
  category_id INT UNSIGNED NULL,
  brand_id INT UNSIGNED NULL,
  product_line_id INT UNSIGNED NULL,
  hsn_code VARCHAR(20) NULL,
  barcode VARCHAR(50) NULL,
  base_unit_id INT UNSIGNED NOT NULL,
  secondary_unit_id INT UNSIGNED NULL,
  conversion_factor DECIMAL(10,3) NULL,
  purchase_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  wholesale_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  retail_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  mrp DECIMAL(12,2) NOT NULL DEFAULT 0,
  min_stock_threshold DECIMAL(12,3) NOT NULL DEFAULT 0,
  tax_code_id INT UNSIGNED NULL,
  image VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_items_item_code (item_code),
  UNIQUE KEY uq_items_barcode (barcode),
  CONSTRAINT fk_items_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_items_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL,
  CONSTRAINT fk_items_product_line FOREIGN KEY (product_line_id) REFERENCES product_lines(id) ON DELETE SET NULL,
  CONSTRAINT fk_items_base_unit FOREIGN KEY (base_unit_id) REFERENCES stock_units(id),
  CONSTRAINT fk_items_secondary_unit FOREIGN KEY (secondary_unit_id) REFERENCES stock_units(id) ON DELETE SET NULL,
  CONSTRAINT fk_items_tax_code FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS item_unit_conversions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id INT UNSIGNED NOT NULL,
  unit_id INT UNSIGNED NOT NULL,
  conversion_to_base DECIMAL(10,3) NOT NULL,
  is_purchase_unit TINYINT(1) NOT NULL DEFAULT 0,
  is_sale_unit TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_item_unit (item_id, unit_id),
  CONSTRAINT fk_iuc_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  CONSTRAINT fk_iuc_unit FOREIGN KEY (unit_id) REFERENCES stock_units(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Party masters — branch-scoped (section 4.2 of spec)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS routes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_routes_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cities (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  route_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cities_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NOT NULL,
  city_id INT UNSIGNED NULL,
  route_id INT UNSIGNED NULL,
  ledger_name VARCHAR(150) NOT NULL,
  print_name VARCHAR(150) NULL,
  customer_group VARCHAR(100) NULL,
  phone VARCHAR(20) NULL,
  gstin VARCHAR(20) NULL,
  address VARCHAR(255) NULL,
  doj DATE NULL,
  dob DATE NULL,
  pricing_type VARCHAR(50) NOT NULL DEFAULT 'normal',
  credit_limit DECIMAL(12,2) NOT NULL DEFAULT 0,
  opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_local_customer TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_customers_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_customers_city FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE SET NULL,
  CONSTRAINT fk_customers_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS suppliers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(20) NULL,
  address VARCHAR(255) NULL,
  gstin VARCHAR(20) NULL,
  opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_suppliers_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- Source: schema_phase3.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- POS / Distributor Billing System — Phase 3 Schema (Core Billing)
-- Run AFTER schema.sql, seed.sql, schema_phase2.sql, seed_phase2.sql.
-- MariaDB/MySQL-safe.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Stock ledger — single source of truth for quantity on hand, plus the
-- full audit trail of every change (section 4.4 of spec).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_ledger (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id INT UNSIGNED NOT NULL,
  owner_type ENUM('warehouse','branch','employee') NOT NULL,
  owner_id INT UNSIGNED NOT NULL,
  quantity_on_hand DECIMAL(14,3) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_stock_ledger_owner (item_id, owner_type, owner_id),
  CONSTRAINT fk_stock_ledger_item FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_movements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id INT UNSIGNED NOT NULL,
  owner_type ENUM('warehouse','branch','employee') NOT NULL,
  owner_id INT UNSIGNED NOT NULL,
  movement_type ENUM('purchase','sale','sale_return','purchase_return','adjustment',
                      'issue_to_salesman','salesman_return','opening_stock','damage') NOT NULL,
  qty_change DECIMAL(14,3) NOT NULL,
  qty_before DECIMAL(14,3) NOT NULL,
  qty_after DECIMAL(14,3) NOT NULL,
  reference_table VARCHAR(50) NULL,
  reference_id INT UNSIGNED NULL,
  reason VARCHAR(255) NULL,
  remarks VARCHAR(255) NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_movements_item FOREIGN KEY (item_id) REFERENCES items(id),
  CONSTRAINT fk_stock_movements_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_stock_movements_item_owner (item_id, owner_type, owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Invoice numbering — atomic per-branch, per-series counter (section 4.19).
-- Locked with SELECT ... FOR UPDATE at completion time, never at hold time.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoice_sequences (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NOT NULL,
  series ENUM('gst','non_gst') NOT NULL,
  prefix VARCHAR(10) NOT NULL,
  current_number INT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_invoice_sequences (branch_id, series),
  CONSTRAINT fk_invoice_sequences_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Invoices — single table for both Hold Bill and completed sale
-- (amendment 4.8a). status='held' rows are invisible to every report
-- and never touch stock/credit; status flips to 'completed' atomically.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoices (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_no VARCHAR(30) NULL,
  branch_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NULL,
  employee_id INT UNSIGNED NOT NULL,
  bill_type ENUM('gst','non_gst') NOT NULL,
  invoice_format ENUM('local','outstation') NOT NULL DEFAULT 'local',
  invoice_date DATE NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  taxable_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  cgst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  sgst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  igst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  cess_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  round_off DECIMAL(6,2) NOT NULL DEFAULT 0,
  grand_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  balance_due DECIMAL(12,2) GENERATED ALWAYS AS (grand_total - paid_amount) STORED,
  payment_status ENUM('paid','partial','credit','cancelled','returned') NULL,
  status ENUM('held','completed','cancelled','returned') NOT NULL DEFAULT 'held',
  vehicle_no VARCHAR(20) NULL,
  customer_outstanding_after DECIMAL(12,2) NULL,
  irn VARCHAR(100) NULL,
  ack_no VARCHAR(50) NULL,
  ack_date DATE NULL,
  einvoice_status ENUM('not_generated','generated','failed','cancelled') NOT NULL DEFAULT 'not_generated',
  einvoice_qr_code TEXT NULL,
  einvoice_error VARCHAR(500) NULL,
  einvoice_raw_response TEXT NULL,
  eway_bill_status ENUM('not_generated','generated','failed','cancelled') NOT NULL DEFAULT 'not_generated',
  eway_bill_no VARCHAR(20) NULL,
  eway_bill_date TIMESTAMP NULL,
  eway_bill_valid_until TIMESTAMP NULL,
  eway_bill_error VARCHAR(500) NULL,
  eway_bill_raw_response TEXT NULL,
  transporter_name VARCHAR(150) NULL,
  transporter_gstin VARCHAR(20) NULL,
  transport_distance_km INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- invoice_no is unique PER BRANCH, not globally: each branch has its own
  -- independent INV-/EST- sequence starting at 000001 (section 4.19), so
  -- "INV-2026-000001" legitimately exists once per branch, distinguished by
  -- that branch's own letterhead/GSTIN on the printed invoice.
  UNIQUE KEY uq_invoices_branch_invoice_no (branch_id, invoice_no),
  CONSTRAINT fk_invoices_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_invoices_employee FOREIGN KEY (employee_id) REFERENCES users(id),
  KEY idx_invoices_branch_status (branch_id, status),
  KEY idx_invoices_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoice_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT UNSIGNED NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  unit_id INT UNSIGNED NOT NULL,
  item_name_snapshot VARCHAR(150) NOT NULL,
  hsn_snapshot VARCHAR(20) NULL,
  qty DECIMAL(12,3) NOT NULL,
  free_qty DECIMAL(12,3) NOT NULL DEFAULT 0,
  rate DECIMAL(12,2) NOT NULL,
  mrp DECIMAL(12,2) NULL,
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  cess_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_invoice_items_item FOREIGN KEY (item_id) REFERENCES items(id),
  CONSTRAINT fk_invoice_items_unit FOREIGN KEY (unit_id) REFERENCES stock_units(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoice_payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT UNSIGNED NOT NULL,
  payment_method ENUM('cash','upi','card','credit','other') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reference_no VARCHAR(50) NULL,
  paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_invoice_payments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Customer credit ledger — append-only (section 4.10). Current
-- outstanding is always the latest balance_after row for that customer,
-- never a mutated running-total column.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS credit_transactions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  transaction_type ENUM('sale_credit','payment_received','credit_reversal') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  invoice_id INT UNSIGNED NULL,
  balance_before DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  notes VARCHAR(255) NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_credit_transactions_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_credit_transactions_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
  KEY idx_credit_transactions_customer (customer_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- Source: schema_phase4.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- POS / Distributor Billing System — Phase 4 Schema (Purchasing & Inventory Ops)
-- Run AFTER schema.sql..seed_phase3.sql. MariaDB/MySQL-safe.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Purchase requests / indents (section 4.5)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS purchase_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_no VARCHAR(30) NULL,
  supplier_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  status ENUM('open','partially_received','converted_to_grn','cancelled') NOT NULL DEFAULT 'open',
  notes VARCHAR(255) NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_purchase_requests_no (request_no),
  CONSTRAINT fk_pr_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_pr_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_pr_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_request_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_request_id INT UNSIGNED NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_pri_request FOREIGN KEY (purchase_request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_pri_item FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- GRN / purchases (section 4.5 + 4.13 refinement)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS purchases (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  grn_no VARCHAR(30) NULL,
  purchase_request_id INT UNSIGNED NULL,
  supplier_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  supplier_invoice_no VARCHAR(50) NULL,
  purchase_date DATE NOT NULL,
  payment_mode ENUM('cash','credit','bank_transfer','upi') NOT NULL DEFAULT 'credit',
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  grand_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  pending_balance DECIMAL(12,2) GENERATED ALWAYS AS (grand_total - paid_amount) STORED,
  status ENUM('active','cancelled') NOT NULL DEFAULT 'active',
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_purchases_grn_no (grn_no),
  CONSTRAINT fk_purchases_request FOREIGN KEY (purchase_request_id) REFERENCES purchase_requests(id) ON DELETE SET NULL,
  CONSTRAINT fk_purchases_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_purchases_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_purchases_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_id INT UNSIGNED NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  free_qty DECIMAL(12,3) NOT NULL DEFAULT 0,
  rate DECIMAL(12,2) NOT NULL,
  tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_purchase_items_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  CONSTRAINT fk_purchase_items_item FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Supplier ledger + payments (section 4.14) — append-only, mirrors
-- credit_transactions on the customer side.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS supplier_ledger_transactions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT UNSIGNED NOT NULL,
  transaction_type ENUM('purchase_credit','payment_made','debit_note_adjustment') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  purchase_id INT UNSIGNED NULL,
  payment_id INT UNSIGNED NULL,
  balance_before DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  notes VARCHAR(255) NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_slt_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_slt_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL,
  KEY idx_slt_supplier (supplier_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supplier_payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_code VARCHAR(30) NULL,
  supplier_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_mode ENUM('cash','bank_transfer','upi','cheque') NOT NULL,
  reference_no VARCHAR(50) NULL,
  notes VARCHAR(255) NULL,
  paid_by INT UNSIGNED NOT NULL,
  paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_supplier_payments_code (payment_code),
  CONSTRAINT fk_sp_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_sp_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_sp_user FOREIGN KEY (paid_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  supplier_payment_id INT UNSIGNED NOT NULL,
  purchase_id INT UNSIGNED NOT NULL,
  allocated_amount DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_spa_payment FOREIGN KEY (supplier_payment_id) REFERENCES supplier_payments(id) ON DELETE CASCADE,
  CONSTRAINT fk_spa_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Stock adjustments (section 4.4)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id INT UNSIGNED NOT NULL,
  owner_type ENUM('warehouse','branch','employee') NOT NULL,
  owner_id INT UNSIGNED NOT NULL,
  adjustment_type ENUM('addition','deduction') NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  reason ENUM('damage','spoilage','count_correction','other') NOT NULL,
  remarks VARCHAR(255) NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_adj_item FOREIGN KEY (item_id) REFERENCES items(id),
  CONSTRAINT fk_stock_adj_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Van / salesman stock (section 4.7)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_issue_notes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  issue_no VARCHAR(30) NULL,
  branch_id INT UNSIGNED NOT NULL,
  employee_id INT UNSIGNED NOT NULL,
  route_id INT UNSIGNED NULL,
  issued_by INT UNSIGNED NOT NULL,
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes VARCHAR(255) NULL,
  UNIQUE KEY uq_stock_issue_no (issue_no),
  CONSTRAINT fk_sin_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_sin_employee FOREIGN KEY (employee_id) REFERENCES users(id),
  CONSTRAINT fk_sin_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL,
  CONSTRAINT fk_sin_issued_by FOREIGN KEY (issued_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_issue_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  issue_id INT UNSIGNED NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  CONSTRAINT fk_sii_issue FOREIGN KEY (issue_id) REFERENCES stock_issue_notes(id) ON DELETE CASCADE,
  CONSTRAINT fk_sii_item FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_return_notes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  return_no VARCHAR(30) NULL,
  issue_id INT UNSIGNED NULL,
  branch_id INT UNSIGNED NOT NULL,
  employee_id INT UNSIGNED NOT NULL,
  returned_by INT UNSIGNED NOT NULL,
  returned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes VARCHAR(255) NULL,
  UNIQUE KEY uq_stock_return_no (return_no),
  CONSTRAINT fk_srn_issue FOREIGN KEY (issue_id) REFERENCES stock_issue_notes(id) ON DELETE SET NULL,
  CONSTRAINT fk_srn_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_srn_employee FOREIGN KEY (employee_id) REFERENCES users(id),
  CONSTRAINT fk_srn_returned_by FOREIGN KEY (returned_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_return_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  return_id INT UNSIGNED NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  CONSTRAINT fk_sri_return FOREIGN KEY (return_id) REFERENCES stock_return_notes(id) ON DELETE CASCADE,
  CONSTRAINT fk_sri_item FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- Source: schema_phase5.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- POS / Distributor Billing System — Phase 5 Schema (Post-sale)
-- Run AFTER schema.sql..schema_phase4.sql. MariaDB/MySQL-safe.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Sales returns (section 4.9) — with or without the original invoice.
-- An untraceable (no invoice_id) return needs admin approval before it
-- touches stock/credit; status default depends on who created it
-- (see SalesReturnModel).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sales_returns (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  return_no VARCHAR(30) NULL,
  invoice_id INT UNSIGNED NULL,
  customer_id INT UNSIGNED NULL,
  branch_id INT UNSIGNED NOT NULL,
  reason VARCHAR(255) NULL,
  refund_action ENUM('credit_note','cash_refund') NOT NULL DEFAULT 'credit_note',
  requires_admin_approval TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('pending_approval','approved','rejected') NOT NULL DEFAULT 'approved',
  approved_by INT UNSIGNED NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sales_returns_no (return_no),
  CONSTRAINT fk_sr_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
  CONSTRAINT fk_sr_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_sr_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_sr_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sr_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sales_return_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sales_return_id INT UNSIGNED NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  rate DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_srit_return FOREIGN KEY (sales_return_id) REFERENCES sales_returns(id) ON DELETE CASCADE,
  CONSTRAINT fk_srit_item FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Purchase returns (section 4.9) — supplier-side mirror.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS purchase_returns (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  return_no VARCHAR(30) NULL,
  purchase_id INT UNSIGNED NULL,
  supplier_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  reason VARCHAR(255) NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_purchase_returns_no (return_no),
  CONSTRAINT fk_pret_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL,
  CONSTRAINT fk_pret_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_pret_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_pret_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_return_id INT UNSIGNED NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  rate DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_preti_return FOREIGN KEY (purchase_return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE,
  CONSTRAINT fk_preti_item FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Customer collections — FIFO oldest-bill auto-deduction (section 4.15).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customer_collections (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  receipt_no VARCHAR(30) NULL,
  customer_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method ENUM('cash','upi','card','other') NOT NULL,
  collected_by INT UNSIGNED NOT NULL,
  route_id INT UNSIGNED NULL,
  collected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_customer_collections_no (receipt_no),
  CONSTRAINT fk_cc_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_cc_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_cc_collected_by FOREIGN KEY (collected_by) REFERENCES users(id),
  CONSTRAINT fk_cc_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS collection_allocations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  collection_id INT UNSIGNED NOT NULL,
  invoice_id INT UNSIGNED NOT NULL,
  allocated_amount DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_ca_collection FOREIGN KEY (collection_id) REFERENCES customer_collections(id) ON DELETE CASCADE,
  CONSTRAINT fk_ca_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Cash handover & reconciliation (section 4.16).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cash_handovers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  handover_no VARCHAR(30) NULL,
  employee_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  handover_date DATE NOT NULL,
  system_cash_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  system_digital_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  submitted_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  verified_amount DECIMAL(12,2) NULL,
  discrepancy DECIMAL(12,2) GENERATED ALWAYS AS (verified_amount - submitted_amount) STORED,
  status ENUM('pending','verified','discrepancy_flagged') NOT NULL DEFAULT 'pending',
  verified_by INT UNSIGNED NULL,
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cash_handovers_no (handover_no),
  CONSTRAINT fk_ch_employee FOREIGN KEY (employee_id) REFERENCES users(id),
  CONSTRAINT fk_ch_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_ch_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cash_handover_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  handover_id INT UNSIGNED NOT NULL,
  collection_id INT UNSIGNED NOT NULL,
  CONSTRAINT fk_chi_handover FOREIGN KEY (handover_id) REFERENCES cash_handovers(id) ON DELETE CASCADE,
  CONSTRAINT fk_chi_collection FOREIGN KEY (collection_id) REFERENCES customer_collections(id),
  UNIQUE KEY uq_chi_collection (collection_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Expenses & other income (section 4.17) — branch-wise.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS expense_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_expense_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS expenses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  expense_no VARCHAR(30) NULL,
  branch_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_mode ENUM('cash','upi','card','bank_transfer') NOT NULL DEFAULT 'cash',
  description VARCHAR(255) NULL,
  expense_date DATE NOT NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_expenses_no (expense_no),
  CONSTRAINT fk_exp_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_exp_category FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_exp_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS other_income (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  receipt_no VARCHAR(30) NULL,
  branch_id INT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_mode ENUM('cash','upi','card','bank_transfer') NOT NULL DEFAULT 'cash',
  description VARCHAR(255) NOT NULL,
  income_date DATE NOT NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_other_income_no (receipt_no),
  CONSTRAINT fk_oi_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_oi_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- Source: schema_phase6.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- POS / Distributor Billing System — Phase 6 Schema (Reports & Admin)
-- Run AFTER schema.sql..schema_phase5.sql. MariaDB/MySQL-safe.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Per-branch print/settings (section 4.19) — thermal/A4 printer profile,
-- bank/UPI details for the invoice footer, terms & conditions.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS branch_print_settings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NOT NULL,
  printer_type ENUM('thermal_58','thermal_80','a4') NOT NULL DEFAULT 'a4',
  invoice_footer_note VARCHAR(255) NULL,
  default_print_copies TINYINT UNSIGNED NOT NULL DEFAULT 1,
  bank_account_no VARCHAR(30) NULL,
  bank_name VARCHAR(100) NULL,
  upi_id VARCHAR(100) NULL,
  terms_and_conditions TEXT NULL,
  show_upi_qr_on_thermal TINYINT(1) NOT NULL DEFAULT 0,
  allow_local_free_qty TINYINT(1) NOT NULL DEFAULT 1,
  allow_distance_free_qty TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_branch_print_settings_branch (branch_id),
  CONSTRAINT fk_bps_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- Source: schema_phase7.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- POS / Distributor Billing System — Phase 7 Schema (Polish)
-- Run AFTER schema.sql..schema_phase6.sql. MariaDB/MySQL-safe.
--
-- Found via load-testing 5,000 seeded invoices (see
-- backend/database/seed_load_test.php): the reports/item-wise-sales and
-- reports/gst-register queries filter invoices by branch_id + status +
-- invoice_date together, but only had an index on (branch_id, status) —
-- the date range fell back to a table scan across every one of that
-- branch's completed invoices before filtering by date. This composite
-- index lets the optimizer satisfy the whole WHERE clause from the index.
-- =====================================================================

ALTER TABLE invoices ADD INDEX idx_invoices_branch_status_date (branch_id, status, invoice_date);

-- ---------------------------------------------------------------------
-- Bug fix found after adding multi-branch support: invoice_no was
-- globally UNIQUE, but each branch has its own independent INV-/EST-
-- sequence starting at 000001 (section 4.19) — so a second branch's
-- first invoice ("INV-2026-000001") collided with the first branch's.
-- invoice_no must be unique per branch, not globally; the branch's own
-- letterhead/GSTIN on the printed invoice is what actually disambiguates
-- two branches sharing the same number. schema_phase3.sql now creates
-- the composite constraint directly for a fresh install — this ALTER is
-- only for a database that already ran the old schema_phase3.sql.
-- ---------------------------------------------------------------------

-- Skipped on a fresh install (this consolidated file): the CREATE TABLE
-- for `invoices` above already defines uq_invoices_branch_invoice_no
-- directly, so uq_invoices_invoice_no never existed to drop. The original
-- two-line ALTER (DROP old global key / ADD the branch-scoped key) is
-- preserved as-is in migrations/schema_phase7.sql for the historical
-- record of a database that was actually running the pre-fix schema.

-- ---------------------------------------------------------------------
-- Source: schema_phase8.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- AJ Agency POS — Phase 8 Schema (branch mapping, category-brand mapping,
-- item-supplier mapping). Run AFTER schema.sql..schema_phase7.sql.
-- MySQL 8 / MariaDB-safe.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Item <-> Branch mapping. Deliberate departure from the earlier
-- "items are fully global" decision (Phase 1/2), per explicit client
-- request: an item only sells at branches it's mapped to. An item with
-- zero mapped branches is available nowhere — the app must not silently
-- fall back to "everywhere" when this table is empty for an item.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS item_branches (
  item_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (item_id, branch_id),
  CONSTRAINT fk_item_branches_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  CONSTRAINT fk_item_branches_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Category <-> Brand mapping — which brands are valid under a category,
-- used to filter the Brand dropdown when a Category is picked on the
-- item form (section 8 of the request).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS category_brands (
  category_id INT UNSIGNED NOT NULL,
  brand_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (category_id, brand_id),
  CONSTRAINT fk_category_brands_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  CONSTRAINT fk_category_brands_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Item -> Supplier mapping (master-data level, distinct from which
-- supplier a given GRN was actually bought from).
-- ---------------------------------------------------------------------

ALTER TABLE items ADD COLUMN supplier_id INT UNSIGNED NULL AFTER product_line_id;
ALTER TABLE items ADD CONSTRAINT fk_items_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- Backward compatibility: every item that already existed before this
-- migration must stay sellable everywhere it already was — an item with
-- zero item_branches rows is available NOWHERE going forward, so without
-- this backfill every existing item would silently vanish from every
-- branch's POS screen the moment this migration runs.
-- ---------------------------------------------------------------------
INSERT IGNORE INTO item_branches (item_id, branch_id)
  SELECT i.id, b.id FROM items i CROSS JOIN branches b;

-- ---------------------------------------------------------------------
-- Source: schema_phase9.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- Phase 9 — Invoice cancellation (Cancel + rebill only; no recalculating
-- edit of a completed invoice). Adds an audit trail on the invoice row
-- and the permission that gates it.
-- =====================================================================

ALTER TABLE invoices
  ADD COLUMN cancelled_by INT UNSIGNED NULL AFTER status,
  ADD COLUMN cancelled_at TIMESTAMP NULL AFTER cancelled_by,
  ADD COLUMN cancel_reason VARCHAR(255) NULL AFTER cancelled_at,
  ADD CONSTRAINT fk_invoices_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id);

INSERT INTO permissions (module, code, label, description) VALUES
('pos', 'pos.cancel_completed_invoice', 'Cancel a completed invoice', 'Void a completed bill, reversing its stock and credit effects')
ON DUPLICATE KEY UPDATE label = VALUES(label), module = VALUES(module), description = VALUES(description);

-- Grant to Super Admin (1) and Admin (2) by default, same as every other
-- permission those two roles hold in seed.sql.
INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
  WHERE r.id IN (1, 2) AND p.code = 'pos.cancel_completed_invoice'
ON DUPLICATE KEY UPDATE role_id = role_id;

-- =====================================================================
-- Phase 9b — Invoice edit (in-place edit of a COMPLETED invoice). Reverses
-- the old stock effect, applies the new one, and adjusts only the delta on
-- the customer's credit ledger; invoice_payments and invoice_no are never
-- touched. Adds an audit trail mirroring cancelled_by/cancelled_at.
-- =====================================================================

ALTER TABLE invoices
  ADD COLUMN edited_by INT UNSIGNED NULL AFTER cancel_reason,
  ADD COLUMN edited_at TIMESTAMP NULL AFTER edited_by,
  ADD CONSTRAINT fk_invoices_edited_by FOREIGN KEY (edited_by) REFERENCES users(id);

INSERT INTO permissions (module, code, label, description) VALUES
('pos', 'pos.edit_completed_invoice', 'Edit a completed invoice', 'Change items/qty/rate/discount on a completed bill, with stock and credit corrected automatically')
ON DUPLICATE KEY UPDATE label = VALUES(label), module = VALUES(module), description = VALUES(description);

INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
  WHERE r.id IN (1, 2) AND p.code = 'pos.edit_completed_invoice'
ON DUPLICATE KEY UPDATE role_id = role_id;

-- ---------------------------------------------------------------------
-- Source: schema_phase10.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- Phase 10 — Order Management: Customer Pre-Booking + Supplier Purchase
-- Request upgrade (branch/route/supplier mapping + approval workflow).
--
-- A pre-booking/request is a permanent record of intent — never touches
-- stock, payments, or GRN/invoice tables until explicitly converted by a
-- separate, later action (create GRN / go bill the customer).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Customer Pre-Booking (new — no equivalent existed before this).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_prebookings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  prebooking_no VARCHAR(30) NULL,
  customer_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  route_id INT UNSIGNED NULL,
  employee_id INT UNSIGNED NULL,
  booking_source ENUM('salesman','phone','whatsapp','walk_in','direct') NOT NULL DEFAULT 'direct',
  status ENUM('pending','confirmed','processing','ready','completed','cancelled') NOT NULL DEFAULT 'pending',
  notes VARCHAR(255) NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_customer_prebookings_no (prebooking_no),
  CONSTRAINT fk_cpb_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_cpb_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_cpb_route FOREIGN KEY (route_id) REFERENCES routes(id),
  CONSTRAINT fk_cpb_employee FOREIGN KEY (employee_id) REFERENCES users(id),
  CONSTRAINT fk_cpb_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  KEY idx_cpb_branch_status (branch_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customer_prebooking_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  prebooking_id INT UNSIGNED NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_cpbi_prebooking FOREIGN KEY (prebooking_id) REFERENCES customer_prebookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_cpbi_item FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO permissions (module, code, label, description) VALUES
('orders', 'orders.view_prebooking', 'View customer pre-bookings', 'See the customer pre-booking register'),
('orders', 'orders.manage_prebooking_status', 'Manage pre-booking status', 'Confirm/process/cancel a customer pre-booking')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
  WHERE r.id IN (1, 2) AND p.code IN ('orders.view_prebooking', 'orders.manage_prebooking_status')
ON DUPLICATE KEY UPDATE role_id = role_id;

-- Every role that can already create a pre-booking should be able to view
-- the register it just wrote to.
INSERT INTO role_permissions (role_id, permission_id)
  SELECT rp.role_id, p.id FROM role_permissions rp
  JOIN permissions src ON src.id = rp.permission_id AND src.code = 'orders.create_prebooking'
  JOIN permissions p ON p.code = 'orders.view_prebooking'
ON DUPLICATE KEY UPDATE permission_id = VALUES(permission_id);

-- ---------------------------------------------------------------------
-- Supplier Purchase Request upgrade: branch/route/supplier mapping +
-- an explicit approval step before a GRN can be created from it.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_routes (
  supplier_id INT UNSIGNED NOT NULL,
  route_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (supplier_id, route_id),
  CONSTRAINT fk_sr_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  CONSTRAINT fk_sr_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE purchase_requests
  ADD COLUMN route_id INT UNSIGNED NULL AFTER branch_id,
  ADD CONSTRAINT fk_pr_route FOREIGN KEY (route_id) REFERENCES routes(id),
  MODIFY COLUMN status ENUM('open','approved','partially_received','converted_to_grn','cancelled') NOT NULL DEFAULT 'open',
  ADD COLUMN approved_by INT UNSIGNED NULL AFTER created_by,
  ADD COLUMN approved_at TIMESTAMP NULL AFTER approved_by,
  ADD CONSTRAINT fk_pr_approved_by FOREIGN KEY (approved_by) REFERENCES users(id);

INSERT INTO permissions (module, code, label, description) VALUES
('orders', 'orders.approve_purchase_request', 'Approve purchase requests', 'Approve a supplier purchase request before it can be turned into a GRN')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
  WHERE r.id IN (1, 2) AND p.code = 'orders.approve_purchase_request'
ON DUPLICATE KEY UPDATE role_id = role_id;

-- ---------------------------------------------------------------------
-- Source: schema_phase11.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- Phase 11 — Stock Purchase: per-line MRP/unit/discount + purchase edit.
--
-- Mirrors invoice_items' own convention (unit_id, mrp, discount_percent,
-- discount_amount) onto purchase_items instead of inventing a new one —
-- the two tables become structurally parallel, matching how sales and
-- purchases already share the same stock_ledger / StockLedgerService.
-- =====================================================================

ALTER TABLE purchase_items
  ADD COLUMN unit_id INT UNSIGNED NULL AFTER item_id,
  ADD COLUMN mrp DECIMAL(12,2) NULL AFTER rate,
  ADD COLUMN discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER mrp,
  ADD COLUMN discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER discount_percent;

-- Backfill existing rows with the item's own base unit so unit_id can be
-- made NOT NULL going forward without losing any existing GRN data.
UPDATE purchase_items pi
  JOIN items i ON i.id = pi.item_id
  SET pi.unit_id = i.base_unit_id
  WHERE pi.unit_id IS NULL;

ALTER TABLE purchase_items
  MODIFY COLUMN unit_id INT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_purchase_items_unit FOREIGN KEY (unit_id) REFERENCES stock_units(id);

-- Purchase edit — reverses the old stock/supplier-ledger effect and
-- reapplies the new one, mirroring InvoiceModel::editCompleted(). Kept as
-- its own permission (distinct from create/delete) for a clean audit trail.
INSERT INTO permissions (module, code, label, description) VALUES
('purchases', 'purchases.edit_grn', 'Edit a GRN', 'Change items/qty/rate/discount on an existing GRN, with stock and supplier balance corrected automatically')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
  WHERE r.id IN (1, 2) AND p.code = 'purchases.edit_grn'
ON DUPLICATE KEY UPDATE role_id = role_id;

-- ---------------------------------------------------------------------
-- Source: schema_phase12.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- Phase 12 — NET_SRATE / NET_PURRATE as first-class item pricing fields,
-- with independent secondary-unit pricing (S-MRP/S-NET_SRATE/S-NET_PURRATE).
--
-- These are genuinely new business fields, distinct from the existing
-- retail_price/purchase_price columns (kept untouched — nothing currently
-- reading them is removed). net_srate/net_purrate are left NULL for
-- existing items on purpose: every place that reads them for pricing
-- falls back to retail_price/purchase_price explicitly in code (never a
-- silent one-time backfill), per the safe-fallback requirement.
-- =====================================================================

ALTER TABLE items
  ADD COLUMN net_srate DECIMAL(12,2) NULL AFTER mrp,
  ADD COLUMN net_purrate DECIMAL(12,2) NULL AFTER net_srate,
  ADD COLUMN secondary_mrp DECIMAL(12,2) NULL AFTER net_purrate,
  ADD COLUMN secondary_net_srate DECIMAL(12,2) NULL AFTER secondary_mrp,
  ADD COLUMN secondary_net_purrate DECIMAL(12,2) NULL AFTER secondary_net_srate;

-- ---------------------------------------------------------------------
-- Source: schema_phase14.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- Phase 14 — Retail Price / Wholesale Price as an independent, optional
-- pricing layer on top of the normal Item Master price (NET_SRATE).
--
-- Naming note: the `items` table already has legacy `retail_price` and
-- `wholesale_price` columns. `retail_price` is load-bearing — it's the
-- fallback NET_SRATE for items that predate Phase 12 (see
-- ItemModel::resolveUnitPricing) — so it means something completely
-- different from "this item's Retail-mode selling price" and reusing it
-- would silently corrupt that fallback for older items the moment someone
-- configures a Retail price. `wholesale_price` is currently inert (never
-- read for pricing), but for symmetry and to avoid any future ambiguity
-- both new tiers get their own clearly-named columns instead.
--
-- These are NULL by default: an unconfigured item keeps billing exactly as
-- before (Normal mode using NET_SRATE) — see ItemModel::resolveSellingPrice.
-- =====================================================================

ALTER TABLE items
  ADD COLUMN retail_selling_price DECIMAL(12,2) NULL AFTER secondary_net_purrate,
  ADD COLUMN wholesale_selling_price DECIMAL(12,2) NULL AFTER retail_selling_price;

-- price_type is invoice-level, exactly like the existing bill_type column —
-- the billing screen's pricing-mode selector applies to the whole cart, not
-- per line, so it's snapshotted once per invoice, same precedent as bill_type.
ALTER TABLE invoices
  ADD COLUMN price_type ENUM('normal','retail','wholesale') NOT NULL DEFAULT 'normal' AFTER bill_type;

-- ---------------------------------------------------------------------
-- Source: schema_phase15.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- Phase 15 — Return refund amounts + original-line linkage.
--
-- Sales/purchase returns previously had no way to record what was
-- actually refunded/paid back — refund_action was a label with no money
-- behind it (cash_refund did nothing at all; credit_note posted the full
-- line-item total, never a partial amount). This adds:
--   - return_total / refund_amount / balance_amount (generated) on both
--     header tables, mirroring invoices.grand_total/paid_amount/balance_due.
--   - a nullable FK from each return line back to the original
--     invoice_items / purchase_items row it was returned against, so
--     "how much of this line has already been returned" can be computed
--     with SUM(...) instead of a separately-maintained counter (same
--     derive-don't-duplicate approach as stock_ledger vs stock_movements).
--     NULL for untraceable sales returns (no invoice_id at all).
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE sales_returns
  ADD COLUMN return_total DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER refund_action,
  ADD COLUMN refund_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER return_total,
  ADD COLUMN balance_amount DECIMAL(12,2) GENERATED ALWAYS AS (return_total - refund_amount) STORED AFTER refund_amount;

ALTER TABLE sales_return_items
  ADD COLUMN invoice_item_id INT UNSIGNED NULL AFTER item_id,
  ADD CONSTRAINT fk_srit_invoice_item FOREIGN KEY (invoice_item_id) REFERENCES invoice_items(id) ON DELETE SET NULL;

ALTER TABLE purchase_returns
  ADD COLUMN return_total DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER reason,
  ADD COLUMN refund_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER return_total,
  ADD COLUMN balance_amount DECIMAL(12,2) GENERATED ALWAYS AS (return_total - refund_amount) STORED AFTER refund_amount;

ALTER TABLE purchase_return_items
  ADD COLUMN purchase_item_id INT UNSIGNED NULL AFTER item_id,
  ADD CONSTRAINT fk_prit_purchase_item FOREIGN KEY (purchase_item_id) REFERENCES purchase_items(id) ON DELETE SET NULL;

-- A cash-refund return now posts a real expense (Section: Cash Refund
-- effect). expenses.category_id is nullable, so no seed category is
-- strictly required, but a dedicated one keeps Reports > Expense/Income
-- readable instead of lumping refunds into "Uncategorized".
INSERT INTO expense_categories (name)
  SELECT 'Sales Return Refund' WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Sales Return Refund');

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- Soft-delete a completed invoice — distinct from cancel(). Hides the
-- invoice from every report/list (all of which already filter
-- status = 'completed' or exclude 'held', so adding 'deleted' to the
-- status enum costs nothing there) and frees its invoice_no so the next
-- invoice created in the same branch+series+year reuses it instead of
-- skipping ahead (business requirement: deleted-number reuse, cancelled
-- numbers are never reused). original_invoice_no preserves what the
-- number was, for audit, after invoice_no itself is cleared back to NULL
-- — the same nullable state a 'held' bill already has before completion,
-- so this isn't a new kind of row the rest of the schema has to learn
-- about. deleted_by/deleted_at/delete_reason mirror cancelled_by/
-- cancelled_at/cancel_reason exactly.
-- =====================================================================

ALTER TABLE invoices
  MODIFY COLUMN status ENUM('held','completed','cancelled','returned','deleted') NOT NULL DEFAULT 'held',
  ADD COLUMN original_invoice_no VARCHAR(30) NULL AFTER invoice_no,
  ADD COLUMN deleted_by INT UNSIGNED NULL AFTER edited_at,
  ADD COLUMN deleted_at TIMESTAMP NULL AFTER deleted_by,
  ADD COLUMN delete_reason VARCHAR(255) NULL AFTER deleted_at,
  ADD CONSTRAINT fk_invoices_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id);

INSERT INTO permissions (module, code, label, description) VALUES
('pos', 'pos.delete_completed_invoice', 'Delete a completed invoice', 'Soft-delete a completed bill (reverses its stock/credit effects, same as cancel) and frees its invoice number for reuse — unlike cancel, the number is not permanently consumed')
ON DUPLICATE KEY UPDATE label = VALUES(label), module = VALUES(module), description = VALUES(description);

-- Grant to Super Admin (1) and Admin (2) by default, same as every other
-- permission those two roles hold in seed.sql.
INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
  WHERE r.id IN (1, 2) AND p.code = 'pos.delete_completed_invoice'
ON DUPLICATE KEY UPDATE role_id = role_id;

-- =====================================================================
-- Orders <-> Van Stock integration — link a van-stock issue back to the
-- customer pre-booking or purchase request it fulfills, and track how
-- much of each order line has already been issued so partial fulfillment
-- and "don't double-issue the same quantity" can be enforced. All four
-- columns are nullable or default to 0, so every existing row and every
-- existing code path (a plain van-stock issue with no order behind it)
-- is completely unaffected — this is purely additive.
-- =====================================================================

ALTER TABLE customer_prebooking_items
  ADD COLUMN issued_qty DECIMAL(12,3) NOT NULL DEFAULT 0 AFTER tax_percent;

ALTER TABLE purchase_request_items
  ADD COLUMN issued_qty DECIMAL(12,3) NOT NULL DEFAULT 0 AFTER rate;

ALTER TABLE stock_issue_notes
  ADD COLUMN source_type ENUM('customer_prebooking','purchase_request') NULL AFTER route_id,
  ADD COLUMN source_id INT UNSIGNED NULL AFTER source_type,
  ADD INDEX idx_issue_source (source_type, source_id);

