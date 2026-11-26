import { NativeModules, NativeEventEmitter, DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BluetoothManager, BluetoothEscposPrinter } from 'react-native-bluetooth-escpos-printer';

const STORAGE_KEY = 'configured_printer';

/**
 * Single source of truth for the configured thermal printer — read/written
 * by Settings > Thermal Printer Setup, and reused as-is by Billing's Payment
 * Complete print and the Invoice screen's print, per the "one consistent
 * printer configuration" requirement. Classic Bluetooth SPP only (the
 * hardware type confirmed for this deployment) via react-native-bluetooth-
 * escpos-printer, the only printer library in this project — no competing
 * printer library is added anywhere else.
 */
export async function getConfiguredPrinter() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function setConfiguredPrinter(device) {
  if (device) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(device));
  } else {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}

/** Android 12+ needs runtime BLUETOOTH_CONNECT/SCAN grants; older Android needs location for discovery. */
export async function ensureBluetoothPermissions() {
  if (Platform.OS !== 'android') return true;
  const sdk = Platform.Version;
  const perms = sdk >= 31
    ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]
    : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const results = await PermissionsAndroid.requestMultiple(perms);
  return Object.values(results).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
}

export async function isBluetoothEnabled() {
  return BluetoothManager.isBluetoothEnabled();
}

/**
 * Lists paired Bluetooth devices (the printer must already be paired via
 * Android's own Bluetooth settings — this library only connects to bonded
 * devices, it doesn't do the OS-level pairing handshake itself).
 */
export function scanPairedDevices() {
  return new Promise((resolve, reject) => {
    const emitter = Platform.OS === 'android' && NativeModules.BluetoothManager
      ? new NativeEventEmitter(NativeModules.BluetoothManager)
      : DeviceEventEmitter;
    const sub = emitter.addListener(BluetoothManager.EVENT_DEVICE_ALREADY_PAIRED, (rsp) => {
      sub.remove();
      try {
        const devices = typeof rsp.devices === 'string' ? JSON.parse(rsp.devices) : rsp.devices || [];
        resolve(devices);
      } catch (e) {
        reject(e);
      }
    });
    BluetoothManager.scanDevices().catch(() => {
      // scanDevices rejects once discovery of *new* devices fails/finishes —
      // the already-paired list was already emitted above, so this is fine.
    });
  });
}

export async function connectPrinter(device) {
  await BluetoothManager.connect(device.address);
  await setConfiguredPrinter(device);
  return device;
}

export async function disconnectPrinter() {
  // The library has no explicit disconnect call — forgetting the saved
  // config is the honest, supported behavior: the next print will require
  // reconnecting, and Settings clearly shows "Not configured" instead of a
  // fake "disconnected" success for a socket we can't actually tear down.
  await setConfiguredPrinter(null);
}

async function ensureConnected() {
  const configured = await getConfiguredPrinter();
  if (!configured) {
    throw new Error('No thermal printer configured. Go to Settings > Thermal Printer Setup first.');
  }
  const enabled = await isBluetoothEnabled();
  if (!enabled) {
    throw new Error('Bluetooth is turned off. Turn it on and try again.');
  }
  await BluetoothManager.connect(configured.address);
  return configured;
}

/** ESC/POS plain-text receipt — mirrors ThermalTemplate.jsx's field set. */
function buildReceiptText(invoice, branch = {}, printSettings = {}) {
  const items = invoice.items || [];
  const line = (l, r) => `[L]${l}[R]${r}\n`;
  const shopName = branch.print_name || branch.branch_name || 'AJ AGENCY';
  let body = `[C]<b>${shopName}</b>\n[C]DISTRIBUTOR BILLING & INVENTORY\n`;
  if (branch.address_line1) {
    body += `[C]${branch.address_line1}${branch.city ? `, ${branch.city}` : ''}\n`;
  }
  const metaParts = [branch.gstin ? `GSTIN: ${branch.gstin}` : '', branch.phone ? `Ph: ${branch.phone}` : ''].filter(Boolean);
  if (metaParts.length > 0) {
    body += `[C]${metaParts.join(' | ')}\n`;
  }
  body += '[C]--------------------------------\n';
  body += line('Bill No:', invoice.invoice_no || 'HELD');
  body += line('Date:', invoice.invoice_date || '');
  body += `[L]Customer: ${invoice.customer_name || 'Walk-in'}\n[C]--------------------------------\n`;
  for (const it of items) {
    body += `[L]${it.item_name_snapshot || 'Item'}${Number(it.free_qty) > 0 ? ` (+${it.free_qty} free)` : ''}\n`;
    body += line(`  ${it.qty} ${it.unit_code || ''} x ${it.rate}`, Number(it.line_total).toFixed(2));
  }
  body += '[C]--------------------------------\n';
  if (invoice.subtotal) {
    body += line('Subtotal:', Number(invoice.subtotal).toFixed(2));
  }
  if (Number(invoice.discount_amount || 0) > 0) {
    body += line('Discount:', `-${Number(invoice.discount_amount).toFixed(2)}`);
  }
  if (invoice.taxable_value) {
    body += line('Taxable:', Number(invoice.taxable_value).toFixed(2));
  }
  if (invoice.bill_type !== 'non_gst') {
    if (Number(invoice.cgst_amount || 0) > 0) body += line('CGST:', Number(invoice.cgst_amount).toFixed(2));
    if (Number(invoice.sgst_amount || 0) > 0) body += line('SGST:', Number(invoice.sgst_amount).toFixed(2));
    if (Number(invoice.igst_amount || 0) > 0) body += line('IGST:', Number(invoice.igst_amount).toFixed(2));
    if (!invoice.cgst_amount && !invoice.sgst_amount && !invoice.igst_amount && invoice.tax_amount && Number(invoice.tax_amount) > 0) {
      body += line('GST Tax:', Number(invoice.tax_amount).toFixed(2));
    }
    if (Number(invoice.cess_amount || 0) > 0) body += line('Cess:', Number(invoice.cess_amount).toFixed(2));
  }
  body += line('Round off:', Number(invoice.round_off || 0).toFixed(2));
  body += `[C]================================\n`;
  body += line('<b>NET TOTAL</b>', `<b>Rs. ${Number(invoice.grand_total || 0).toFixed(2)}</b>`);
  body += '[C]================================\n';

  if (printSettings.bank_name || printSettings.bank_account_no) {
    body += `[C]Bank: ${printSettings.bank_name || ''} A/C: ${printSettings.bank_account_no || ''}\n`;
  }
  if (printSettings.upi_id) {
    body += `[C]UPI ID: ${printSettings.upi_id}\n`;
  }
  if (printSettings.terms_and_conditions) {
    body += `[C]${printSettings.terms_and_conditions}\n`;
  }
  body += `[C]${printSettings.invoice_footer_note || 'Thank you, visit again!'}\n\n\n`;
  return body;
}

/** Throws on any real failure — callers must show the actual error, never a fake success. */
export async function printInvoiceReceipt(invoice, branch = {}, printSettings = {}) {
  await ensureConnected();
  await BluetoothEscposPrinter.printerAlign(1); // 0=left, 1=center, 2=right
  await BluetoothEscposPrinter.printText(buildReceiptText(invoice, branch, printSettings), {});
  await BluetoothEscposPrinter.printText('\n\n\n', {});
}

export async function testPrint() {
  await ensureConnected();
  await BluetoothEscposPrinter.printerAlign(1); // 0=left, 1=center, 2=right
  await BluetoothEscposPrinter.printText('[C]<b>Test Print OK</b>\n[C]AJ Agency POS\n\n\n', {});
}
