// Mirrors frontend/src/utils/pricing.js exactly — display-only preview.
// The backend recomputes authoritatively on every create/complete call.

/** Mirrors ItemModel::resolveUnitPricing on the backend. */
export function resolveUnitPricing(item, unitId) {
  const isSecondary = unitId != null && item.secondary_unit_id != null && Number(unitId) === Number(item.secondary_unit_id);

  if (isSecondary) {
    return {
      mrp: item.secondary_mrp !== null && item.secondary_mrp !== undefined && item.secondary_mrp !== '' ? Number(item.secondary_mrp) : Number(item.mrp),
      net_srate: item.secondary_net_srate !== null && item.secondary_net_srate !== undefined && item.secondary_net_srate !== ''
        ? Number(item.secondary_net_srate)
        : Number(item.net_srate ?? item.retail_price),
      net_purrate: item.secondary_net_purrate !== null && item.secondary_net_purrate !== undefined && item.secondary_net_purrate !== ''
        ? Number(item.secondary_net_purrate)
        : Number(item.net_purrate ?? item.purchase_price),
    };
  }

  return {
    mrp: Number(item.mrp),
    net_srate: Number(item.net_srate ?? item.retail_price),
    net_purrate: Number(item.net_purrate ?? item.purchase_price),
  };
}

/** Mirrors ItemModel::resolveSellingPrice — Normal/Retail/Wholesale price resolution. */
export function resolveSellingPrice(item, unitId, priceType = 'normal') {
  const unitPricing = resolveUnitPricing(item, unitId);

  if (priceType === 'wholesale' || priceType === 'retail') {
    const column = priceType === 'wholesale' ? 'wholesale_selling_price' : 'retail_selling_price';
    const raw = item[column];
    const configured = raw !== null && raw !== undefined && raw !== '';
    return { rate: configured ? Number(raw) : unitPricing.net_srate, mrp: unitPricing.mrp, configured };
  }

  return { rate: unitPricing.net_srate, mrp: unitPricing.mrp, configured: true };
}

/**
 * billType is the invoice-level GST/Non-GST choice — 'non_gst' zeroes GST/CESS
 * purely for display, exactly as InvoiceModel::priceLine does authoritatively.
 * priceType is the invoice-level Normal/Retail/Wholesale choice — independent
 * of billType.
 */
export function priceLine(item, input, billType = 'gst', priceType = 'normal') {
  const qty = Number(input.qty || 0);
  const unitId = input.unit_id ?? item.base_unit_id;
  const unitPricing = resolveSellingPrice(item, unitId, priceType);
  const rate = input.rate !== undefined && input.rate !== '' ? Number(input.rate) : unitPricing.rate;
  const mrp = input.mrp !== undefined && input.mrp !== '' ? Number(input.mrp) : unitPricing.mrp;
  const gross = round2(qty * rate);

  const discountPercent = Number(input.discount_percent || 0);
  const rawDiscountAmount = input.discount_amount !== undefined && input.discount_amount !== ''
    ? Number(input.discount_amount)
    : round2((gross * discountPercent) / 100);

  const isAmountMode = input.discount_mode === 'amount' || (input.discount_amount !== undefined && input.discount_amount !== '');
  const hasDiscountError = isAmountMode ? (rawDiscountAmount > gross + 0.009) : (discountPercent > 100);
  const discountErrorMsg = hasDiscountError
    ? (isAmountMode ? `Discount cannot exceed item amount (Rs. ${gross.toFixed(2)})` : 'Discount percentage cannot exceed 100%')
    : null;

  const discountAmount = Math.min(gross, Math.max(0, rawDiscountAmount));
  const taxable = Math.max(0, round2(gross - discountAmount));
  const isNonGst = billType === 'non_gst';
  const taxPercent = isNonGst ? 0 : Number(item.gst_percent || 0);
  const taxAmount = isNonGst ? 0 : round2((taxable * taxPercent) / 100);
  const cessPercent = isNonGst ? 0 : Number(item.cess_percent || 0);
  const cessAmount = isNonGst || cessPercent <= 0 ? 0 : round2((taxable * cessPercent) / 100);

  return {
    qty, free_qty: Number(input.free_qty || 0), rate, mrp,
    price_configured: unitPricing.configured,
    discount_percent: discountPercent, discount_amount: rawDiscountAmount,
    discount_error: discountErrorMsg,
    tax_percent: taxPercent, tax_amount: taxAmount, cess_amount: cessAmount,
    line_total: taxable, gross,
  };
}

export function computeCartTotals(lines) {
  let subtotal = 0, discountAmount = 0, taxableValue = 0, taxAmount = 0, cessAmount = 0;
  for (const line of lines) {
    subtotal += line.gross;
    discountAmount += line.discount_amount;
    taxableValue += line.line_total;
    taxAmount += line.tax_amount;
    cessAmount += line.cess_amount;
  }
  const cgst = round2(taxAmount / 2);
  const sgst = round2(taxAmount - cgst);
  const rawTotal = taxableValue + taxAmount + cessAmount;
  const grandTotal = Math.round(rawTotal);
  const roundOff = round2(grandTotal - rawTotal);
  return { subtotal: round2(subtotal), discountAmount: round2(discountAmount), taxableValue: round2(taxableValue), cgst, sgst, cessAmount: round2(cessAmount), roundOff, grandTotal };
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Overall bill discount (from the Payment screen) — validated the same way
 * for both types: never negative, never NaN/empty, percent capped at 100,
 * amount capped at the bill's own subtotal so the payable total can never
 * go negative.
 */
export function computeBillDiscountAmount(subtotal, discountType, discountValue) {
  const v = Number(discountValue);
  if (!discountValue || Number.isNaN(v) || v <= 0) return 0;
  if (discountType === 'percent') {
    const pct = Math.min(v, 100);
    return round2((subtotal * pct) / 100);
  }
  return round2(Math.min(v, subtotal));
}

/**
 * Distributes the overall bill discount proportionally across each priced
 * line's gross value, ADDING it on top of that line's own item-level
 * discount, then recomputes that line's tax on the new (lower) taxable
 * value — exactly what the backend does when the app submits the adjusted
 * per-line discount_amount (see POSScreen.buildPayload), so the on-screen
 * preview and the saved invoice always agree, per item GST rate.
 */
export function applyBillDiscountToLines(pricedLines, billDiscountAmount) {
  const subtotal = pricedLines.reduce((s, l) => s + l.gross, 0);
  if (billDiscountAmount <= 0 || subtotal <= 0) return pricedLines;
  return pricedLines.map((l) => {
    const share = round2(billDiscountAmount * (l.gross / subtotal));
    // Capped at this line's own gross — a line that already carries a full
    // (e.g. 100%) item-level discount must not be pushed past its gross by
    // the bill-discount share on top, which would make taxable negative
    // (the backend's own priceLine() has no such clamp).
    const discount_amount = Math.min(round2(l.discount_amount + share), l.gross);
    const taxable = Math.max(round2(l.gross - discount_amount), 0);
    const taxAmount = round2((taxable * l.tax_percent) / 100);
    // cess_percent isn't carried on the priced-line shape, only cess_amount —
    // scale it by the same taxable-value ratio instead of recomputing from a rate.
    const cessAmount = l.line_total > 0 ? round2(l.cess_amount * (taxable / l.line_total)) : 0;
    return { ...l, discount_amount, line_total: taxable, tax_amount: taxAmount, cess_amount: cessAmount };
  });
}
