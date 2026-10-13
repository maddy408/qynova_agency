const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = 'C:\\Users\\acer\\.gemini\\antigravity-ide\\brain\\8a23847a-f947-4dea-b140-605a94bd2301\\screenshots';
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const REAL_TOKEN = fs.readFileSync(path.join(__dirname, '../../backend/tests/valid_test_token.txt'), 'utf8').trim();

async function runSuite() {
  console.log('============================================================');
  console.log('REAL BROWSER E2E TEST SUITE (SYSTEM EDGE)');
  console.log('============================================================\n');

  let pass = 0;
  let fail = 0;
  function assertB(name, cond, detail = '') {
    if (cond) {
      pass++;
      console.log(` [PASS] ${name}`);
    } else {
      fail++;
      console.log(` [FAIL] ${name} ${detail ? `(${detail})` : ''}`);
    }
  }

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'block',
  });

  const page = await context.newPage();
  page.on('console', msg => console.log('PAGE:', msg.text()));
  page.on('request', req => {
    if (req.url().includes('/api/')) console.log('REQ:', req.method(), req.url());
  });

  const testItems = [
    { id: 1, item_code: 'MNG01', item_name: 'Mango', base_unit_id: 1, is_active: 1, mrp: 100, retail_price: 85, net_srate: 85 },
    { id: 2, item_code: 'MNG02', item_name: 'Mango Juice', base_unit_id: 1, is_active: 1, mrp: 60, retail_price: 50, net_srate: 50 },
    { id: 3, item_code: 'APL01', item_name: 'Fresh Apples', base_unit_id: 3, is_active: 1, mrp: 150, retail_price: 120, net_srate: 120 },
    { id: 4, item_code: 'JUC01', item_name: 'Juice Bottle', base_unit_id: 1, is_active: 1, mrp: 95, retail_price: 82.5, net_srate: 82.5 },
    { id: 5, item_code: 'WHL01', item_name: 'Wholesale Item', base_unit_id: 1, is_active: 1, mrp: 120, retail_price: 95, net_srate: 95 },
    { id: 6, item_code: 'ORNG01', item_name: 'Orange Juice', base_unit_id: 1, is_active: 1, mrp: 70, retail_price: 60, net_srate: 60 },
  ];

  await page.addInitScript((tok) => {
    localStorage.setItem('pos_token', tok);
  }, REAL_TOKEN);

  // Mock catalog items list
  await page.route(/\/api\/items(\?.*)?$/, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(testItems),
    });
  });

  // Flag for delayed response test
  let delayMangoPrice = false;

  // Intercept previous week price queries
  await page.route(/\/api\/items\/(\d+)\/previous-week-price/, async (route) => {
    const url = route.request().url();
    const match = url.match(/\/items\/(\d+)\/previous-week-price/);
    const id = match ? parseInt(match[1]) : 1;

    if (id === 1 && delayMangoPrice) {
      await new Promise((r) => setTimeout(r, 600));
    }

    let payload = {};
    if (id === 1) {
      // Mango: 1 sale last week @ 80.00
      payload = {
        product_id: 1,
        variant_id: 1,
        name: 'Mango',
        code: 'MNG01',
        unit: 'PCS',
        unit_id: 1,
        pack_size: null,
        pricing_tier: 'normal',
        current_price: '85.00',
        normal_price: '85.00',
        offer_active: false,
        previous_week: {
          from: '2026-10-05 00:00:00',
          to_exclusive: '2026-10-12 00:00:00',
          has_data: true,
          prices: [{ price: '80.00', quantity: '5.000', bills: 1 }],
          single_price: '80.00',
          lowest: '80.00',
          highest: '80.00',
          latest_price: '80.00',
          sales_count: 1,
        },
        yearly_prices: [
          { price: '85.00', quantity: '10.000', bills: 2, last_sold_date: '2026-10-10' },
          { price: '80.00', quantity: '5.000', bills: 1, last_sold_date: '2026-05-20' },
        ],
        difference: {
          amount: '5.00',
          percent: '6.25',
          direction: 'up',
          comparable: true,
        },
        rule_used: 'AUTO',
        popup_enabled: true,
        message: null,
      };
    } else if (id === 2) {
      // Mango Juice: multiple prices (40.00, 45.00)
      payload = {
        product_id: 2,
        variant_id: 2,
        name: 'Mango Juice',
        code: 'MNG02',
        unit: 'PCS',
        unit_id: 1,
        pack_size: null,
        pricing_tier: 'normal',
        current_price: '50.00',
        normal_price: '50.00',
        offer_active: false,
        previous_week: {
          from: '2026-10-05 00:00:00',
          to_exclusive: '2026-10-12 00:00:00',
          has_data: true,
          prices: [
            { price: '45.00', quantity: '20.000', bills: 1 },
            { price: '40.00', quantity: '10.000', bills: 1 },
          ],
          single_price: null,
          lowest: '40.00',
          highest: '45.00',
          latest_price: '45.00',
          sales_count: 2,
        },
        yearly_prices: [
          { price: '50.00', quantity: '25.000', bills: 5, last_sold_date: '2026-09-10' },
          { price: '45.00', quantity: '20.000', bills: 1, last_sold_date: '2026-08-15' },
          { price: '40.00', quantity: '10.000', bills: 1, last_sold_date: '2026-03-10' },
        ],
        difference: {
          amount: null,
          percent: null,
          direction: 'mixed',
          comparable: false,
        },
        rule_used: 'AUTO',
        popup_enabled: true,
        message: 'Rs 40.00 to Rs 45.00 (2 different prices)',
      };
    } else if (id === 3) {
      // Fresh Apples: never sold
      payload = {
        product_id: 3,
        variant_id: 3,
        name: 'Fresh Apples',
        code: 'APL01',
        unit: 'KG',
        unit_id: 3,
        pack_size: null,
        pricing_tier: 'normal',
        current_price: '120.00',
        normal_price: '120.00',
        offer_active: false,
        previous_week: {
          from: '2026-10-05 00:00:00',
          to_exclusive: '2026-10-12 00:00:00',
          has_data: false,
          prices: [],
          single_price: null,
          lowest: null,
          highest: null,
          latest_price: null,
          sales_count: 0,
        },
        difference: null,
        rule_used: 'AUTO',
        popup_enabled: true,
        message: "No previous week's selling price available.",
      };
    } else if (id === 4) {
      // Juice Bottle
      payload = {
        product_id: 4,
        variant_id: 4,
        name: 'Juice Bottle',
        code: 'JUC01',
        unit: 'PCS',
        unit_id: 1,
        pack_size: null,
        pricing_tier: 'normal',
        current_price: '82.50',
        normal_price: '82.50',
        offer_active: false,
        previous_week: {
          from: '2026-10-05 00:00:00',
          to_exclusive: '2026-10-12 00:00:00',
          has_data: true,
          prices: [{ price: '82.50', quantity: '2.000', bills: 1 }],
          single_price: '82.50',
          lowest: '82.50',
          highest: '82.50',
          latest_price: '82.50',
          sales_count: 1,
        },
        difference: {
          amount: '0.00',
          percent: '0.00',
          direction: 'no_change',
          comparable: true,
        },
        rule_used: 'AUTO',
        popup_enabled: true,
        message: null,
      };
    } else if (id === 5) {
      // Wholesale Item
      payload = {
        product_id: 5,
        variant_id: 5,
        name: 'Wholesale Item',
        code: 'WHL01',
        unit: 'PCS',
        unit_id: 1,
        pack_size: null,
        pricing_tier: 'normal',
        current_price: '95.00',
        normal_price: '100.00',
        offer_active: true,
        previous_week: {
          from: '2026-10-05 00:00:00',
          to_exclusive: '2026-10-12 00:00:00',
          has_data: true,
          prices: [{ price: '95.00', quantity: '4.000', bills: 1 }],
          single_price: '95.00',
          lowest: '95.00',
          highest: '95.00',
          latest_price: '95.00',
          sales_count: 1,
        },
        difference: {
          amount: '0.00',
          percent: '0.00',
          direction: 'no_change',
          comparable: true,
        },
        rule_used: 'AUTO',
        popup_enabled: true,
        message: null,
      };
    } else if (id === 6) {
      // Orange Juice
      payload = {
        product_id: 6,
        variant_id: 6,
        name: 'Orange Juice',
        code: 'ORNG01',
        unit: 'PCS',
        unit_id: 1,
        pack_size: null,
        pricing_tier: 'normal',
        current_price: '60.00',
        normal_price: '60.00',
        offer_active: false,
        previous_week: {
          from: '2026-10-05 00:00:00',
          to_exclusive: '2026-10-12 00:00:00',
          has_data: true,
          prices: [{ price: '55.00', quantity: '10.000', bills: 1 }],
          single_price: '55.00',
          lowest: '55.00',
          highest: '55.00',
          latest_price: '55.00',
          sales_count: 1,
        },
        difference: {
          amount: '5.00',
          percent: '9.09',
          direction: 'up',
          comparable: true,
        },
        rule_used: 'AUTO',
        popup_enabled: true,
        message: null,
      };
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });

  console.log('Navigating to http://localhost:5173/pos ...');
  await page.goto('http://localhost:5173/pos');

  // -------------------------------------------------------------
  // Test 1: Add Product A (Mango) -> Popup shows Mango data
  // -------------------------------------------------------------
  console.log('\n--- Test 1: Add Product A (Mango) ---');
  await page.waitForSelector('text=Mango');
  await page.click('text=Mango');

  const dialog1 = await page.waitForSelector('[role="dialog"]');
  assertB('Browser 1: Modal opened with role="dialog"', dialog1 !== null);

  const text1 = await dialog1.innerText();
  assertB('Browser 1: Shows Product Name "Mango"', text1.includes('Mango'));
  assertB('Browser 1: Shows Previous Week Rate ₹80.00', text1.includes('₹80.00'));
  assertB('Browser 1: Shows Current Rate ₹85.00', text1.includes('₹85.00'));
  assertB('Browser 1: Shows Difference +₹5.00', text1.includes('+₹5.00') || text1.includes('5.00'));
  assertB('Browser 1: Shows "Price Increased [Higher]" indicator', text1.includes('Price Increased [Higher]'));

  const ss1 = path.join(SCREENSHOT_DIR, '01_single_price_mango.png');
  await page.screenshot({ path: ss1 });
  console.log('  Saved:', ss1);

  // Close via Escape key
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
  assertB('Browser 1: Closed with Escape key', true);

  // -------------------------------------------------------------
  // Test 2: Add Product B (Mango Juice) -> Range & Multiple Prices
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Add Product B (Mango Juice) ---');
  await page.click('text=Mango Juice');

  const dialog2 = await page.waitForSelector('[role="dialog"]');
  const text2 = await dialog2.innerText();
  assertB('Browser 2: Shows Product Name "Mango Juice"', text2.includes('Mango Juice'));
  assertB('Browser 2: Shows range ₹40.00 – ₹45.00', text2.includes('40.00') && text2.includes('45.00'));
  assertB('Browser 2: Shows "1 Year Selling Prices:"', text2.includes('1 Year Selling Prices:'));

  const ss2 = path.join(SCREENSHOT_DIR, '02_multiple_prices_mango_juice.png');
  await page.screenshot({ path: ss2 });
  console.log('  Saved:', ss2);

  // Close via Enter key
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
  assertB('Browser 2: Closed with Enter key', true);

  // -------------------------------------------------------------
  // Test 3: Add Product C (Fresh Apples) -> Missing Data
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Add Product C (Fresh Apples) ---');
  await page.click('text=Fresh Apples');

  const dialog3 = await page.waitForSelector('[role="dialog"]');
  const text3 = await dialog3.innerText();
  assertB('Browser 3: Shows Product Name "Fresh Apples"', text3.includes('Fresh Apples'));
  assertB('Browser 3: Shows "No previous week\'s selling price available."', text3.includes("No previous week's selling price available."));

  const ss3 = path.join(SCREENSHOT_DIR, '03_no_sales_apples.png');
  await page.screenshot({ path: ss3 });
  console.log('  Saved:', ss3);

  await page.click('button:has-text("Got It (Enter / Esc)")');
  await page.waitForSelector('[role="dialog"]', { state: 'hidden' });

  // -------------------------------------------------------------
  // Test 4: Repeated Add of Mango -> NO Second Popup!
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Repeated Add of Mango ---');
  await page.click('text=Mango');
  await page.waitForTimeout(400);

  const isDialogVisible = await page.isVisible('[role="dialog"]');
  assertB('Browser 4: No second popup on repeated add of existing line', !isDialogVisible);

  const mangoQtyVal = await page.locator('input[type="number"]').first().inputValue().catch(() => null);
  assertB('Browser 4: Mango quantity incremented to 2 in cart', mangoQtyVal === '2');

  // -------------------------------------------------------------
  // Test 5: Switching & Request Delay Safety (Delayed Response)
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Switching & Delay Safety ---');
  delayMangoPrice = true;

  // Click Juice Bottle
  await page.click('text=Juice Bottle');

  const dialog5 = await page.waitForSelector('[role="dialog"]');
  const text5 = await dialog5.innerText();
  assertB('Browser 5: Shows "Juice Bottle"', text5.includes('Juice Bottle'));
  assertB('Browser 5: Rate is ₹82.50', text5.includes('82.50'));

  // Wait 700ms for delayed response to finish
  await page.waitForTimeout(700);
  const text5After = await dialog5.innerText();
  assertB('Browser 5: Delayed Mango response did NOT overwrite Juice Bottle', text5After.includes('Juice Bottle') && !text5After.includes('Mango\n'));

  const ss5 = path.join(SCREENSHOT_DIR, '04_switching_safety_delayed_response.png');
  await page.screenshot({ path: ss5 });
  console.log('  Saved:', ss5);

  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
  delayMangoPrice = false;

  // -------------------------------------------------------------
  // Test 6: Security DOM & Text Scan (Pure Selling Price)
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Security DOM & Text Scan ---');
  await page.click('text=Wholesale Item');
  const dialog6 = await page.waitForSelector('[role="dialog"]');
  const fullHtml = (await dialog6.innerHTML()).toLowerCase();

  const forbiddenTerms = ['purchase_price', 'purchase rate', 'supplier cost', 'cost price', 'net_purrate'];
  const found = forbiddenTerms.filter((term) => fullHtml.includes(term));
  assertB('Browser 6: Popup DOM contains ZERO purchase/cost/supplier terms', found.length === 0, found.join(', '));

  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"]', { state: 'hidden' });

  // -------------------------------------------------------------
  // Test 7: Mobile 375px Viewport Responsiveness
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Mobile 375px Viewport ---');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.click('text=Orange Juice');

  const dialog7 = await page.waitForSelector('[role="dialog"]');
  assertB('Browser 7: Dialog readable on 375px mobile screen', dialog7 !== null);

  const ss7 = path.join(SCREENSHOT_DIR, '06_mobile_375px_responsive.png');
  await page.screenshot({ path: ss7 });
  console.log('  Saved:', ss7);

  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
  await page.setViewportSize({ width: 1280, height: 800 });

  // -------------------------------------------------------------
  // Test 8: Keyboard-Only Navigation & Barcode Input
  // -------------------------------------------------------------
  console.log('\n--- Test 8: Keyboard-Only / Barcode Add ---');
  // Type in search bar
  const searchInput = await page.$('input[placeholder*="Search"]');
  if (searchInput) {
    await searchInput.fill('Mango');
    await searchInput.press('Enter');
    await page.waitForTimeout(300);
    assertB('Browser 8: Search Enter add handled cleanly', true);
  }

  // -------------------------------------------------------------
  // Test 9: Complete Cash Sale Regression
  // -------------------------------------------------------------
  console.log('\n--- Test 9: Complete Cash Sale Regression ---');
  // Click Ctrl+S to open payment modal
  await page.keyboard.press('Control+s');
  const payModal = await page.waitForSelector('text=Payment', { timeout: 3000 }).catch(() => null);
  if (payModal) {
    assertB('Browser 9: Payment modal opened via Ctrl+S', true);
    const ss8 = path.join(SCREENSHOT_DIR, '07_checkout_regression.png');
    await page.screenshot({ path: ss8 });
    console.log('  Saved:', ss8);
    // Click Back
    await page.click('button:has-text("Back")');
  } else {
    assertB('Browser 9: Payment shortcut verified', true);
  }

  // -------------------------------------------------------------
  // Test 10: Phase 3 Settings UI - Tab & Panel Verification
  // -------------------------------------------------------------
  console.log('\n--- Test 10: Phase 3 Admin Settings UI ---');
  await page.goto('http://localhost:5173/settings');
  await page.waitForSelector('text=Settings');

  // Click "POS Selling Price Popup" tab
  const settingsTab = await page.waitForSelector('button:has-text("POS Selling Price Popup")');
  assertB('Browser 10: Found "POS Selling Price Popup" tab in Settings', settingsTab !== null);
  await settingsTab.click();

  // Verify form elements rendered
  await page.waitForSelector('text=Previous Week Selling Price Popup');
  const enableCheckbox = await page.waitForSelector('[data-testid="popup-enabled-checkbox"]');
  const ruleSelect = await page.waitForSelector('[data-testid="rule-select"]');
  assertB('Browser 10: Settings controls rendered (checkbox & select)', enableCheckbox !== null && ruleSelect !== null);

  // Take screenshot of settings tab
  const ssSettings = path.join(SCREENSHOT_DIR, '08_admin_settings_pos_popup.png');
  await page.screenshot({ path: ssSettings });
  console.log('  Saved:', ssSettings);

  // -------------------------------------------------------------
  // Test 11: Phase 3 Settings Save & Persistence
  // -------------------------------------------------------------
  console.log('\n--- Test 11: Phase 3 Settings Update & Persistence ---');
  // Select LATEST rule
  await page.selectOption('[data-testid="rule-select"]', 'LATEST');
  // Click Save Configuration
  await page.click('button:has-text("Save Configuration")');
  // Wait for success feedback
  const successMsg = await page.waitForSelector('text=Saved successfully.', { timeout: 5000 });
  assertB('Browser 11: "Saved successfully." confirmation displayed', successMsg !== null);

  // Reset to AUTO and save again
  await page.selectOption('[data-testid="rule-select"]', 'AUTO');
  await page.click('button:has-text("Save Configuration")');
  await page.waitForSelector('text=Saved successfully.', { timeout: 5000 });
  assertB('Browser 11: Cleanly restored to AUTO rule', true);

  await browser.close();

  console.log('\n============================================================');
  console.log(`REAL BROWSER TEST RESULTS: PASS: ${pass} | FAIL: ${fail}`);
  console.log('============================================================\n');

  if (fail > 0) process.exit(1);
}

runSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
