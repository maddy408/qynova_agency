# Previous Week Selling Price Comparison Feature Documentation

## 1. Feature Overview
The **Previous Week Selling Price Comparison** feature provides real-time, informational pricing intelligence to cashiers and billing operators on the AJ Agency POS billing screen (`POS.jsx`).

When an item is added to the active sales bill, the system queries the previous calendar week's selling history for that product in the same branch, unit, and pricing tier (Normal, Retail, or Wholesale), comparing the current selling price against the prior week's rate.

### Primary Capabilities:
- **Instant Price Delta**: Visual badge showing whether the current selling rate has increased, decreased, or remained unchanged compared to last week.
- **Multiple Rates Range (`AUTO` Rule)**: When an item was sold at multiple prices last week, the system computes the exact range (e.g. `₹40.00 – ₹45.00`) and presents a breakdown table showing the rate, quantity sold, and bill count.
- **Missing Data Notice**: If the item had no sales in the prior calendar week, a clear informational message is displayed (*"No previous week's selling price available"*).
- **Fast Dismissal**: Cashiers can dismiss the modal instantly with <kbd>Enter</kbd> or <kbd>Esc</kbd> or by clicking *"Got It"*. Focus automatically returns to the POS interface.
- **Repeat Add Guard**: Clicking or scanning the same product multiple times increments quantity without repeatedly opening the popup (unless enabled in Admin Settings).

---

## 2. Security & Business Constraints: SELLING PRICE ONLY
> [!IMPORTANT]
> **Strict Zero-Access to Purchase Rates:**
> This feature reads and displays **pure selling prices only** from completed customer invoices (`invoices` and `invoice_items`).
> - Under **no circumstances** does this service or modal read, query, compute, or display `net_purrate`, `purchase_price`, supplier invoices, purchase orders, or profit margins.
> - Verified by automated DOM security audits ensuring zero exposure of confidential purchasing data to cashiers.

---

## 3. Date & Time Window (Calendar Week in Asia/Kolkata)
The previous week is defined strictly as the **previous full calendar week** (Monday 00:00:00 to Monday 00:00:00 exclusive), evaluated in the `Asia/Kolkata` time zone:
- A sale at Sunday 23:59:59 belongs to the previous week.
- A sale at Monday 00:00:00 belongs to the current week.
- Calculations use BCMath (`bcsub`, `bcmul`, `bcdiv`, `bcomp`) for exact decimal precision with zero floating-point drift.

---

## 4. Multi-Price Resolution Rule Engine
When an item has been sold at multiple distinct prices during the prior week, the `pos_feature_settings.prev_week_price_rule` setting dictates how the comparison is made:

| Rule | Description | Behavior |
|---|---|---|
| `AUTO` (Default) | Automatically detects multiple rates. | Displays the price range (`₹ Min – ₹ Max`) with a breakdown table. |
| `LATEST` | Evaluates only the most recent completed invoice from the previous week. | Compares current price against the latest single rate. |
| `AVERAGE` | Calculates weighted average price (`total_sales_amount / total_qty_sold`). | Compares current price against the weighted average. |
| `MOST_USED` | Identifies the rate at which the highest cumulative quantity was sold. | Compares current price against the most frequent rate. |

---

## 5. API Reference

### 5.1 Get Previous Week Price
- **Endpoint**: `GET /api/items/{id}/previous-week-price`  
  *(Alias: `GET /api/pos/products/{id}/previous-week-price`)*
- **Authentication**: Bearer JWT token required (`pos.sell` or `catalog.view`).
- **Query Parameters**:
  - `unit_id` (optional, integer): Defaults to item `base_unit_id`.
  - `tier` (optional, string): `'normal'` (default), `'retail'`, or `'wholesale'`.
  - `branch_id` (optional, integer): Defaults to authenticated user's branch context.

#### Response Example (Single Price):
```json
{
  "product_id": 1,
  "variant_id": 1,
  "name": "Mango",
  "code": "MNG01",
  "unit": "PCS",
  "unit_id": 1,
  "current_price": "85.00",
  "previous_week": {
    "from": "2026-10-05 00:00:00",
    "to_exclusive": "2026-10-12 00:00:00",
    "has_data": true,
    "prices": [
      { "price": "80.00", "quantity": "5.000", "bills": 1 }
    ],
    "single_price": "80.00",
    "lowest": "80.00",
    "highest": "80.00",
    "latest_price": "80.00",
    "sales_count": 1
  },
  "difference": {
    "amount": "5.00",
    "percent": "6.25",
    "direction": "up",
    "comparable": true
  },
  "rule_used": "AUTO",
  "popup_enabled": true,
  "message": null
}
```

### 5.2 Get POS Feature Settings
- **Endpoint**: `GET /api/settings/pos-popup`
- **Response**:
```json
{
  "pos_prev_week_popup_enabled": true,
  "prev_week_price_rule": "AUTO",
  "prev_week_popup_on_repeat_add": false
}
```

### 5.3 Update POS Feature Settings
- **Endpoint**: `PUT /api/settings/pos-popup`
- **Payload**:
```json
{
  "pos_prev_week_popup_enabled": 1,
  "prev_week_price_rule": "AUTO",
  "prev_week_popup_on_repeat_add": 0
}
```

---

## 6. Admin Settings Panel
Located in **Settings** (`/settings`) under the tab **"POS Selling Price Popup"**:
1. **Enable Price Comparison Popup**: Master toggle to enable or disable the modal across the POS screen.
2. **Multiple Prices Resolution Rule**: Select from `AUTO`, `LATEST`, `AVERAGE`, or `MOST_USED`.
3. **Show Popup on Repeat Add**: Checkbox to toggle whether repeated adds of an existing bill line trigger the popup.

---

## 7. Database Migration Runbook

The test database `pos_system_test` already contains the migration. When deploying to the production database `pos_system`, execute:

```bash
# Step 1: Backup current production database
mysqldump -u root -p pos_system > pos_system_backup_$(date +%Y%m%d).sql

# Step 2: Apply additive migration script
mysql -u root -p pos_system < backend/database/migrations/2026_10_12_add_pos_feature_settings.sql
```

The migration SQL script is non-destructive and idempotent:
```sql
CREATE TABLE IF NOT EXISTS pos_feature_settings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    branch_id INT UNSIGNED NOT NULL,
    pos_prev_week_popup_enabled TINYINT(1) NOT NULL DEFAULT 1,
    prev_week_price_rule ENUM('AUTO', 'LATEST', 'AVERAGE', 'MOST_USED') NOT NULL DEFAULT 'AUTO',
    prev_week_popup_on_repeat_add TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_pos_settings_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 8. Verification & Test Commands

To run all automated backend unit and HTTP tests:
```powershell
php backend/tests/PreviousWeekPriceTest.php
php backend/tests/PreviousWeekPriceHttpTest.php
```

To run the complete Playwright browser E2E test suite (11 test scenarios):
```powershell
$env:NODE_PATH="C:\Users\acer\.gemini\antigravity-ide\brain\e9f39c4e-b29e-4552-bc8e-1fe57bdaf5a7\scratch\node_modules"; node frontend/tests/browser_e2e_suite.cjs
```
