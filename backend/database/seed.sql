-- =====================================================================
-- AJ Agency POS / Distributor Billing System — Seed / Demo Data
-- Consolidated from seed.sql + seed_phase2.sql + seed_phase3.sql +
-- seed_phase5.sql (the exact, already-applied seed sequence for this
-- project, concatenated in order — nothing rewritten, nothing invented).
--
-- Run AFTER schema.sql, against the same database:
--   mysql -u root -p pos_system < seed.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Source: seed.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- POS / Distributor Billing System — Phase 1 Seed Data
-- Run AFTER schema.sql, against the same database.
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- Company + one placeholder branch (address/GSTIN editable later in
-- Settings > Company Profile, once that screen exists in a later phase)
-- ---------------------------------------------------------------------
INSERT INTO company (id, name) VALUES (1, 'AJ Agency')
  ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO branches
  (id, company_id, branch_name, print_name, gstin, pan_number, address_line1, city, state, pincode, phone, support_email, is_main_branch, status)
VALUES
  (1, 1, 'Main Branch', 'AJ AGENCY', 'PLACEHOLDER-GSTIN', 'PLACEHOLDER-PAN',
   'Address line 1, edit in Settings', 'City', 'State', '000000', '0000000000', 'support@example.com', 1, 'active')
  ON DUPLICATE KEY UPDATE branch_name = VALUES(branch_name);

-- ---------------------------------------------------------------------
-- Permission registry (section 2.3 of spec)
-- ---------------------------------------------------------------------
INSERT INTO permissions (module, code, label, description) VALUES
('dashboard', 'dashboard.view_financial_summary', 'View financial summary', 'See revenue/profit figures on the dashboard, not just counts'),
('pos', 'pos.access', 'Access POS screen', 'Open the billing/POS screen at all'),
('pos', 'pos.apply_discount', 'Apply discount at billing', 'Add a line/bill discount while billing'),
('pos', 'pos.edit_price_at_sale', 'Edit price at sale', 'Override an item''s rate at the point of sale'),
('pos', 'pos.void_hold_bill', 'Void / discard held bill', 'Discard a held bill instead of only resuming it'),
('pos', 'pos.gst_billing', 'Create GST bills', 'Use the GST billing mode'),
('pos', 'pos.non_gst_billing', 'Create Non-GST / estimate bills', 'Use the Non-GST / estimate billing mode'),
('pos', 'pos.camera_scan_items', 'Camera scan-to-cart', 'Use the camera/photo OCR item scanner'),
('pos', 'pos.cancel_completed_invoice', 'Cancel a completed invoice', 'Void a completed bill, reversing its stock and credit effects'),
('pos', 'pos.delete_completed_invoice', 'Delete a completed invoice', 'Soft-delete a completed bill (reverses its stock/credit effects, same as cancel) and frees its invoice number for reuse — unlike cancel, the number is not permanently consumed'),
('pos', 'pos.manage_gst_filing', 'Generate E-Invoice / E-Way Bill', 'Generate or cancel a completed invoice\'s E-Invoice (IRN) and E-Way Bill filings'),
('pos', 'pos.edit_completed_invoice', 'Edit a completed invoice', 'Change items/qty/rate/discount on a completed bill, with stock and credit corrected automatically'),
('orders', 'orders.create_prebooking', 'Create pre-booking orders', 'Create customer pre-booking/sales orders'),
('orders', 'orders.create_purchase_indent', 'Create purchase indents', 'Raise a purchase request/indent to a supplier'),
('returns', 'returns.sales_return', 'Process sales returns', 'Create a sales return against/without an invoice'),
('returns', 'returns.purchase_return', 'Process purchase returns', 'Create a purchase return against a GRN'),
('returns', 'returns.approve_untraceable_return', 'Approve untraceable returns', 'Approve a sales return that has no traceable original invoice'),
('inventory', 'inventory.view_stock', 'View stock', 'View stock-on-hand across warehouse/branch/salesman'),
('inventory', 'inventory.issue_van_stock', 'Issue van/salesman stock', 'Issue stock from warehouse to a salesman'),
('inventory', 'inventory.stock_adjustment', 'Stock adjustment', 'Manually adjust stock quantity with a reason'),
('purchases', 'purchases.create_grn', 'Create GRN', 'Record a goods-received-note / purchase'),
('purchases', 'purchases.delete_grn', 'Delete GRN', 'Delete/reverse a purchase GRN'),
('purchases', 'purchases.view_purchase_cost', 'View purchase cost', 'See cost/purchase price fields on items and reports'),
('purchases', 'purchases.settle_supplier_payment', 'Settle supplier payment', 'Record a payment made to a supplier'),
('catalog', 'catalog.manage_items', 'Manage items', 'Create/edit the product catalog'),
('catalog', 'catalog.manage_price_lists', 'Manage price lists', 'Create/edit wholesale/retail/scheme price lists'),
('catalog', 'catalog.manage_price_rules', 'Manage price rules', 'Create/edit per-customer-type price overrides'),
('parties', 'parties.manage_customers', 'Manage customers', 'Create/edit customer master records'),
('parties', 'parties.manage_suppliers', 'Manage suppliers', 'Create/edit supplier master records'),
('credit', 'credit.create_credit_sale', 'Create credit sale', 'Bill a sale on customer credit'),
('credit', 'credit.collect_credit_payment', 'Collect credit payment', 'Record a customer payment against outstanding credit'),
('credit', 'credit.view_shopwide_outstanding', 'View shop-wide outstanding', 'See every customer''s outstanding, not just their own sales'),
('collections', 'collections.field_collection_entry', 'Field collection entry', 'Enter a cash/UPI collection made in the field'),
('handover', 'handover.submit_cash_handover', 'Submit cash handover', 'Hand over collected cash for reconciliation'),
('handover', 'handover.verify_reconcile', 'Verify/reconcile handover', 'Physically count and confirm a submitted cash handover'),
('expenses', 'expenses.manage', 'Manage expenses & income', 'Record branch expenses and other income'),
('reports', 'reports.view_all', 'View reports', 'Open the reports module'),
('reports', 'reports.view_profit', 'View profit reports', 'See gross-profit/P&L figures in reports'),
('reports', 'reports.view_gst_register', 'View GST sales register', 'View the GST-tagged sales register'),
('reports', 'reports.view_non_gst_register', 'View Non-GST register', 'View the internal Non-GST/estimate register'),
('reports', 'reports.export_excel', 'Export reports to Excel', 'Download any report as .xlsx'),
('staff', 'staff.manage_accounts', 'Manage staff accounts', 'Create/edit employee login accounts'),
('staff', 'staff.manage_permissions', 'Manage staff permissions', 'Toggle per-employee permission overrides'),
('settings', 'settings.manage', 'Manage settings', 'Edit company profile, printer setup, invoice sequences'),
('branches', 'branches.manage', 'Manage branches', 'Create/edit/deactivate branches'),
('branches', 'branches.switch_context', 'Switch branch context', 'See the header branch switcher and act across branches')
ON DUPLICATE KEY UPDATE label = VALUES(label), module = VALUES(module), description = VALUES(description);

-- ---------------------------------------------------------------------
-- Roles (system-wide templates, branch_id NULL)
-- ---------------------------------------------------------------------
INSERT INTO roles (id, branch_id, name, is_system_role) VALUES
  (1, NULL, 'Super Admin', 1),
  (2, NULL, 'Admin', 1),
  (3, NULL, 'Manager', 0),
  (4, NULL, 'Field Sales Executive', 0),
  (5, NULL, 'Billing Executive', 0)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ---------------------------------------------------------------------
-- Default role_permissions mapping
-- (ASSUMPTION — not fully enumerated in the spec; reasonable defaults
-- that Admin can freely re-toggle per employee afterward)
-- ---------------------------------------------------------------------

-- Super Admin: everything
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 1, id FROM permissions
  ON DUPLICATE KEY UPDATE role_id = role_id;

-- Admin: everything except managing branches themselves (Super Admin only)
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 2, id FROM permissions WHERE code <> 'branches.manage'
  ON DUPLICATE KEY UPDATE role_id = role_id;

-- Manager: stock/purchase/reports visibility, not expenses/settings/staff
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 3, id FROM permissions WHERE code IN (
    'dashboard.view_financial_summary','pos.access','pos.gst_billing','pos.non_gst_billing',
    'orders.create_prebooking','orders.create_purchase_indent','inventory.view_stock',
    'purchases.create_grn','purchases.view_purchase_cost','parties.manage_customers',
    'parties.manage_suppliers','credit.view_shopwide_outstanding','reports.view_all',
    'reports.view_gst_register','reports.view_non_gst_register','reports.export_excel'
  )
  ON DUPLICATE KEY UPDATE role_id = role_id;

-- Field Sales Executive: pre-booking, van stock visibility, field collections, credit
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 4, id FROM permissions WHERE code IN (
    'pos.access','pos.non_gst_billing','orders.create_prebooking','inventory.view_stock',
    'credit.create_credit_sale','credit.collect_credit_payment','collections.field_collection_entry'
  )
  ON DUPLICATE KEY UPDATE role_id = role_id;

-- Billing Executive (Cashier): POS + their own shift reports
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 5, id FROM permissions WHERE code IN (
    'pos.access','pos.apply_discount','pos.void_hold_bill','pos.gst_billing','pos.non_gst_billing',
    'pos.camera_scan_items','returns.sales_return','credit.create_credit_sale',
    'credit.collect_credit_payment','handover.submit_cash_handover','reports.view_all'
  )
  ON DUPLICATE KEY UPDATE role_id = role_id;

-- ---------------------------------------------------------------------
-- One Super Admin user.
-- Plaintext password: Admin@123   (bcrypt hash below — CHANGE AFTER FIRST LOGIN)
-- ---------------------------------------------------------------------
INSERT INTO users (id, branch_id, role_id, name, email, password_hash, phone, status) VALUES
  (1, 1, 1, 'Super Admin', 'admin@example.com',
   '$2y$10$WChYQdvaqGR.YxQ4bpSgcepz2jqCyv2DEBgr6/LsX4n54RLPODp7G',
   '9999999999', 'active')
  ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ---------------------------------------------------------------------
-- Source: seed_phase2.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- POS / Distributor Billing System — Phase 2 Seed Data
-- Run AFTER schema_phase2.sql.
-- =====================================================================

SET NAMES utf8mb4;

-- Standard Indian GST slabs
INSERT INTO tax_codes (code, name, gst_percent, cgst_percent, sgst_percent, igst_percent, cess_percent) VALUES
('GST0', 'GST 0%', 0, 0, 0, 0, NULL),
('GST5', 'GST 5%', 5, 2.5, 2.5, 5, NULL),
('GST12', 'GST 12%', 12, 6, 6, 12, NULL),
('GST18', 'GST 18%', 18, 9, 9, 18, NULL),
('GST28', 'GST 28%', 28, 14, 14, 28, NULL)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Common stock units
INSERT INTO stock_units (name, short_code, is_decimal, is_active) VALUES
('Pieces', 'PCS', 0, 1),
('Kilogram', 'KG', 1, 1),
('Litre', 'LTR', 1, 1),
('Box', 'BOX', 0, 1),
('Carton', 'CTN', 0, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = VALUES(is_active);

-- ---------------------------------------------------------------------
-- Source: seed_phase3.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- POS / Distributor Billing System — Phase 3 Seed Data
-- Run AFTER schema_phase3.sql.
-- =====================================================================

SET NAMES utf8mb4;

-- One GST + one Non-GST sequence per existing branch, per section 4.19.
INSERT INTO invoice_sequences (branch_id, series, prefix, current_number)
SELECT id, 'gst', 'INV-', 0 FROM branches
ON DUPLICATE KEY UPDATE branch_id = branch_id;

INSERT INTO invoice_sequences (branch_id, series, prefix, current_number)
SELECT id, 'non_gst', 'EST-', 0 FROM branches
ON DUPLICATE KEY UPDATE branch_id = branch_id;

-- ---------------------------------------------------------------------
-- Source: seed_phase5.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- POS / Distributor Billing System — Phase 5 Seed Data
-- Run AFTER schema_phase5.sql.
-- =====================================================================

SET NAMES utf8mb4;

INSERT INTO expense_categories (name) VALUES
('Rent'), ('Electricity'), ('Staff Salary'), ('Transport / Fuel'),
('Packing Material'), ('Maintenance'), ('Miscellaneous')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO pricing_types (name, code, is_default) VALUES
('Normal', 'normal', 1),
('Retail', 'retail', 0),
('Wholesale', 'wholesale', 0)
ON DUPLICATE KEY UPDATE name = VALUES(name);

