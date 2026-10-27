// Shared validation helpers for phone/pincode/GSTIN fields — reused by
// every form (staff, customer, supplier, branch) instead of each one
// re-implementing its own regex. Mirrors the backend checks in
// backend/src/Helpers/Validator.php so client and server agree.

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** 10-digit Indian mobile number, optionally blank (caller decides if required). */
export function isValidPhone(value) {
  const v = (value || '').trim();
  if (v === '') return true;
  return /^[6-9]\d{9}$/.test(v);
}

/** Exactly 6 digits. */
export function isValidPincode(value) {
  const v = (value || '').trim();
  if (v === '') return true;
  return /^\d{6}$/.test(v);
}

function gstinChecksum(gstin) {
  let factor = 1;
  let sum = 0;
  for (let i = 0; i < gstin.length - 1; i++) {
    let digit = GSTIN_CHARSET.indexOf(gstin[i]) * factor;
    digit = Math.floor(digit / 36) + (digit % 36);
    sum += digit;
    factor = factor === 2 ? 1 : 2;
  }
  const checkCharIndex = (36 - (sum % 36)) % 36;
  return GSTIN_CHARSET[checkCharIndex] === gstin[gstin.length - 1];
}

/** 15-char structure + checksum digit. Blank is treated as valid (optional field). */
export function isValidGstin(value) {
  const v = (value || '').trim().toUpperCase();
  if (v === '') return true;
  if (!GSTIN_PATTERN.test(v)) return false;
  return gstinChecksum(v);
}

export function isValidEmail(value) {
  const v = (value || '').trim();
  if (v === '') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
