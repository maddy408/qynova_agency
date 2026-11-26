/**
 * Mirrors ItemModel::resolveUnitPricing on the backend — NET_SRATE/
 * NET_PURRATE are independent fields (never derived from MRP or from each
 * other), and the secondary-unit variant only applies when the line is
 * actually in that unit. Falls back to the legacy retail_price/
 * purchase_price explicitly when NET_SRATE/NET_PURRATE aren't set.
 */
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

/**
 * Mirrors ItemModel::resolveSellingPrice on the backend — the ONE place
 * that decides which rate a cart line uses for Normal/Retail/Wholesale
 * billing (section 10). retail_selling_price/wholesale_selling_price are a
 * flat, unit-agnostic override on top of whatever resolveUnitPricing()
 * already resolved for the unit being sold, so a secondary-unit line still
 * falls back to its own S-NET_SRATE when Retail/Wholesale isn't configured
 * — never MRP, never NET_PURRATE. `configured` tells the caller whether the
 * requested tier actually had a price set, so the UI can say so instead of
 * silently pretending it did.
 */
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
 * Mirrors InvoiceModel::priceLine / computeTotals on the backend so the cart
 * shows live totals before saving. The server recomputes authoritatively on
 * every create/update/complete call — this is display-only.
 *
 * billType is the invoice-level GST/Non-GST choice (never the item's own
 * tax_code) — 'non_gst' zeroes GST/CESS here purely for display. priceType
 * is the invoice-level Normal/Retail/Wholesale choice — the two are
 * completely independent, exactly as the backend enforces them.
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
    qty,
    free_qty: Number(input.free_qty || 0),
    rate,
    mrp,
    price_configured: unitPricing.configured,
    discount_percent: discountPercent,
    discount_amount: rawDiscountAmount,
    discount_error: discountErrorMsg,
    tax_percent: taxPercent,
    tax_amount: taxAmount,
    cess_percent: cessPercent,
    cess_amount: cessAmount,
    line_total: taxable,
    gross,
  };
}

export function computeCartTotals(lines, overallDiscount = { amount: 0, mode: 'amount' }) {
  let subtotal = 0;
  let itemDiscountAmount = 0;

  for (const line of lines) {
    subtotal += line.gross;
    itemDiscountAmount += line.discount_amount;
  }

  const rawOverallDisc = Number(overallDiscount?.amount || 0);
  const overallDiscountAmount = overallDiscount?.mode === 'percent'
    ? round2((subtotal * rawOverallDisc) / 100)
    : rawOverallDisc;

  const totalDiscountAmount = round2(itemDiscountAmount + overallDiscountAmount);

  let taxableValue = 0;
  let taxAmount = 0;
  let cessAmount = 0;

  const updatedLines = lines.map((line) => {
    const lineShare = subtotal > 0 ? round2(overallDiscountAmount * (line.gross / subtotal)) : 0;
    const combinedLineDiscount = round2(line.discount_amount + lineShare);
    const taxable = Math.max(0, round2(line.gross - combinedLineDiscount));
    const tax = round2((taxable * line.tax_percent) / 100);
    const cess = line.cess_percent > 0 ? round2((taxable * line.cess_percent) / 100) : 0;

    taxableValue += taxable;
    taxAmount += tax;
    cessAmount += cess;

    return {
      ...line,
      combined_discount_amount: combinedLineDiscount,
      taxable,
      tax_amount: tax,
      cess_amount: cess,
      line_total: taxable,
    };
  });

  const cgst = round2(taxAmount / 2);
  const sgst = round2(taxAmount - cgst);
  const rawTotal = taxableValue + taxAmount + cessAmount;
  const grandTotal = Math.max(0, Math.round(rawTotal));
  const roundOff = round2(grandTotal - rawTotal);

  return {
    subtotal: round2(subtotal),
    itemDiscountAmount: round2(itemDiscountAmount),
    overallDiscountAmount: round2(overallDiscountAmount),
    discountAmount: totalDiscountAmount,
    taxableValue: round2(taxableValue),
    cgst,
    sgst,
    cessAmount: round2(cessAmount),
    roundOff,
    grandTotal,
    updatedLines,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
