SET NAMES utf8mb4;

-- ---------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------
INSERT INTO users (name, username, password_hash, role, active) VALUES
('Admin', 'admin', '$2y$10$6x4ggV7/XCtwaax5qeD0je7A1S.TLoSNmGzFQFbGujdJwCPMzt1U6', 'admin', 1);
-- Seeded password: Admin@123 — rotate before real use.

-- ---------------------------------------------------------------
-- Payment methods
-- ---------------------------------------------------------------
INSERT INTO payment_methods (name_ta, name_en, is_default, active, sort_order) VALUES
('கடன்', 'Credit', 1, 1, 1),
('பணம்', 'Cash', 0, 1, 2),
('UPI', 'UPI', 0, 1, 3),
('நெட் பேங்கிங்', 'Net Banking', 0, 1, 4);

-- ---------------------------------------------------------------
-- Bill number sequences
-- ---------------------------------------------------------------
INSERT INTO bill_sequences (series_key, prefix, next_number) VALUES
('LOCAL-NORMAL', 'L-', 1),
('DISTANT-NORMAL', 'D-', 1),
('LOCAL-COMMISSION', 'LC-', 1),
('DISTANT-COMMISSION', 'DC-', 1),
('QUICK', 'QS-', 1);

-- ---------------------------------------------------------------
-- Items — Wholesale vegetable commission shop items from physical billbook
-- ---------------------------------------------------------------
INSERT INTO items (name_ta, name_en, code, unit, default_rate, is_charge_item, active) VALUES
('மிளகாய்', 'Chilli', 'MILA', 'kg', 40.00, 0, 1),
('வெண்டை', 'Ladies Finger', 'VEN', 'kg', 30.00, 0, 1),
('அவரை', 'Broad Beans', 'AVA', 'kg', 35.00, 0, 1),
('புடலை', 'Snake Gourd', 'PODA', 'kg', 25.00, 0, 1),
('சுரைக்காய்', 'Bottle Gourd', 'SORA', 'kg', 20.00, 0, 1),
('பூசணிக்காய்', 'Pumpkin', 'POS', 'kg', 18.00, 0, 1),
('எலுமிச்சை', 'Lemon', 'LEM', 'kg', 60.00, 0, 1),
('இஞ்சி', 'Ginger', 'IN', 'kg', 80.00, 0, 1),
('நெல்லிக்காய்', 'Gooseberry', 'NELL', 'kg', 50.00, 0, 1),
('பீட்ரூட்', 'Beetroot', 'BET', 'kg', 30.00, 0, 1),
('கேரட்', 'Carrot', 'CAR', 'kg', 40.00, 0, 1),
('கோஸ்', 'Cabbage', 'KOSE', 'kg', 20.00, 0, 1),
('கத்தரிக்காய்', 'Brinjal', 'KATH', 'kg', 25.00, 0, 1),
('பாகற்காய்', 'Bitter Gourd', 'BAAV', 'kg', 30.00, 0, 1),
('பச்ச தக்காளி', 'Green Tomato (Box)', 'P.BOX', 'kg', 20.00, 0, 1),
('வெள்ளரிக்காய்', 'Cucumber', 'VELL', 'kg', 20.00, 0, 1),
('தடியங்காய்', 'Ash Gourd', 'THAD', 'kg', 18.00, 0, 1),
('சுனாமி', 'Sunaami', 'SUNA', 'kg', 30.00, 0, 1),
('முருங்கைக்காய்', 'Drumstick', 'MUR', 'kg', 45.00, 0, 1),
('சேனை கிழங்கு', 'Yam', 'CHEN', 'kg', 35.00, 0, 1),
('சீவல்', 'Seeval', 'SEVA', 'kg', 25.00, 0, 1),
('பல்லாரி', 'Big Onion', 'PALL', 'kg', 32.00, 0, 1),
('உருளை', 'Potato', 'URU', 'kg', 25.00, 0, 1),
('உள்ளி', 'Small Onion', 'ULL', 'kg', 45.00, 0, 1),
('சின்னசேம்பு', 'Small Taro', 'SAM', 'kg', 40.00, 0, 1),
('பால் சேம்பு', 'Milk Taro', 'P.SAM', 'kg', 45.00, 0, 1),
('மாங்காய்', 'Raw Mango', 'MAN', 'kg', 30.00, 0, 1),
('தேங்காய்', 'Coconut', 'THEN', 'nos', 25.00, 0, 1),
('சீனி கிழங்கு', 'Sweet Potato', 'SEE', 'kg', 30.00, 0, 1),
('பூடு', 'Garlic', 'PU', 'kg', 120.00, 0, 1),
('பயிறு', 'Cowpea / Long Beans', 'PAY', 'kg', 35.00, 0, 1),
('பட்டை அவரை', 'Flat Beans', 'P.AVA', 'kg', 40.00, 0, 1),
('பீன்ஸ்', 'Beans', 'BEA', 'kg', 45.00, 0, 1),
('தக்காளி (Box)', 'Tomato (Box)', 'BOX', 'kg', 25.00, 0, 1),
('வாழைத்தார்', 'Plantain Bunch', 'THAR', 'nos', 250.00, 0, 1),
('கறிவேப்பிலை', 'Curry Leaves', 'KPVL', 'kg', 60.00, 0, 1),
('மல்லி', 'Coriander', 'MALLI', 'kg', 40.00, 0, 1),
('புதினா', 'Mint', 'PUTH', 'kg', 30.00, 0, 1);

-- ---------------------------------------------------------------
-- Settings — business defaults + company profile placeholders
-- ---------------------------------------------------------------
INSERT INTO settings (`key`, `value`) VALUES
('company_name_ta', 'ஸ்ரீ பவானி காய்கனி கமிஷன் வியாபாரம்'),
('company_name_en', 'Sri Bhavani Vegetables & Fruits Commission Agent'),
('company_tagline', 'காய்கனி கமிஷன் வியாபாரம்'),
('proprietor_name', 'பவானி சங்கர்'),
('shop_number', '14'),
('shop_number_2', '15'),
('address_line1', 'தினசரி மார்க்கெட்'),
('address_line2', 'சுரண்டை.'),
('phone_numbers', '["9659580845", "9488103983", "9789767576"]'),
('god_name_1', 'ஸ்ரீ பவானி அம்மன் துணை'),
('god_name_2', 'ஸ்ரீ பொட்டல் மாடசாமி'),
('logo_brand', 'VTC'),
('email', ''),
('gstin', ''),
('gstin_visible', 'false'),
('footer_note', 'நன்றி! மீண்டும் வருக! • Thank You! Visit Again!'),
('logo_url', ''),
('show_logo', 'true'),
('ui_language', 'ta'),
('invoice_language', 'ta'),
('default_print_format', 'a5'),
('default_commission_percent', '10'),
('default_distant_cooli', '0'),
('default_distant_vadagai', '0'),
('default_payment_method_id', '1'),
('default_unit', 'kg'),
('rounding_rule', 'none'),
('show_previous_balance', 'true');

