import { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Platform } from 'react-native';
import { ProductImage } from '../../components/ProductImage';
import { Icon } from '../../components/Icon';
import { computeCartTotals, priceLine, computeBillDiscountAmount, applyBillDiscountToLines, resolveSellingPrice } from '../../utils/pricing';
import { colors } from '../../theme/colors';

const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash' }, { key: 'upi', label: 'UPI' }, { key: 'card', label: 'Card' },
  { key: 'credit', label: 'Credit' }, { key: 'other', label: 'Other' },
];

export function CartSheet({
  visible, cart, setCart, billType, priceType, units = [],
  billDiscountType, setBillDiscountType, billDiscountValue, setBillDiscountValue,
  hasCustomer, isFreeQtyAllowed = true, onClose, onComplete, onHold, holding, completing, errorMessage,
}) {
  const [stage, setStage] = useState('cart'); // 'cart' | 'payment'
  const [splitMode, setSplitMode] = useState(false);
  const defaultMethod = !hasCustomer ? 'cash' : 'credit';
  const [payments, setPayments] = useState([{ payment_method: defaultMethod, amount: 0 }]);
  const [discountError, setDiscountError] = useState('');

  const pricedLines = cart.map((line) => ({
    ...line,
    priced: priceLine(line.item, line.discount_mode === 'amount' ? { ...line, discount_percent: 0 } : { ...line, discount_amount: '' }, billType, priceType),
  }));
  const totals = computeCartTotals(pricedLines.map((l) => l.priced));

  // Bill-level discount (Payment screen) applied on top of any per-item
  // discount — see POSScreen.buildPayload for why this is the single
  // source of truth also used when the invoice is actually submitted.
  const billDiscountAmount = computeBillDiscountAmount(totals.subtotal, billDiscountType, billDiscountValue);
  const discountedLines = billDiscountAmount > 0 ? applyBillDiscountToLines(pricedLines.map((l) => l.priced), billDiscountAmount) : pricedLines.map((l) => l.priced);
  const discountedTotals = billDiscountAmount > 0 ? computeCartTotals(discountedLines) : totals;

  const openPayment = () => {
    const initialMethod = !hasCustomer ? 'cash' : 'credit';
    setPayments([{ payment_method: initialMethod, amount: discountedTotals.grandTotal }]);
    setSplitMode(false);
    setDiscountError('');
    setStage('payment');
  };

  // Keep single payment amount automatically synced with total payable when bill discount is added/changed
  useEffect(() => {
    if (!splitMode && stage === 'payment') {
      setPayments((prev) => {
        const curMethod = prev[0]?.payment_method || (!hasCustomer ? 'cash' : 'credit');
        return [{ payment_method: curMethod, amount: discountedTotals.grandTotal }];
      });
    }
  }, [discountedTotals.grandTotal, splitMode, stage, hasCustomer]);

  const handleDiscountValueChange = (raw) => {
    setDiscountError('');
    setBillDiscountValue(raw);
    if (raw === '') return;
    const v = Number(raw);
    if (Number.isNaN(v) || v < 0) {
      setDiscountError('Enter a valid, non-negative discount.');
      return;
    }
    if (billDiscountType === 'percent' && v > 100) {
      setDiscountError('Percentage discount cannot exceed 100%.');
    } else if (billDiscountType === 'amount' && v > totals.subtotal) {
      setDiscountError('Discount cannot be greater than the bill amount.');
    }
  };

  const handleDiscountTypeChange = (type) => {
    setDiscountError('');
    setBillDiscountType(type);
    // Convert the entered value across modes so the resulting discount
    // amount stays the same instead of silently reinterpreting the number
    // (e.g. 10 meaning 10% becomes 10 meaning Rs.10 otherwise).
    const v = Number(billDiscountValue);
    if (!billDiscountValue || Number.isNaN(v)) return;
    if (type === 'percent' && totals.subtotal > 0) {
      setBillDiscountValue(String(Math.min(100, Math.round((billDiscountAmount / totals.subtotal) * 10000) / 100)));
    } else if (type === 'amount') {
      setBillDiscountValue(String(billDiscountAmount));
    }
  };


  const updateLine = (key, patch) => setCart((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const updateQty = (key, delta) => {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, qty: Math.max(1, Number(l.qty) + delta) } : l)));
  };
  const removeLine = (key) => setCart((prev) => prev.filter((l) => l.key !== key));

  // Switches a cart line between an item's Primary (base) and Secondary
  // unit — mirrors web POS exactly: re-resolves the selling price for the
  // newly-selected unit (never keeps the old unit's rate), so qty/price/
  // stock all use the unit actually chosen, same backend pricing/stock
  // logic web already uses (resolveSellingPrice), not a mobile-only rule.
  const changeLineUnit = (key, unitId) => {
    setCart((prev) => prev.map((l) => {
      if (l.key !== key) return l;
      const pricing = resolveSellingPrice(l.item, unitId, priceType);
      return { ...l, unit_id: unitId, rate: pricing.rate };
    }));
  };

  const paymentsTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const remaining = Math.round((discountedTotals.grandTotal - paymentsTotal) * 100) / 100;
  const blockedNoCustomer = remaining > 0.009 && !hasCustomer;

  const toggleSplit = (next) => {
    setSplitMode(next);
    const activeMethod = !hasCustomer ? 'cash' : 'credit';
    setPayments(next
      ? PAYMENT_METHODS.map((m) => ({ payment_method: m.key, amount: m.key === activeMethod ? discountedTotals.grandTotal : 0 }))
      : [{ payment_method: activeMethod, amount: discountedTotals.grandTotal }]);
  };

  const setSplitAmount = (key, raw) => {
    let value = Number(raw) || 0;
    if (value < 0) value = 0;
    setPayments((prev) => {
      const othersTotal = prev.filter((p) => p.payment_method !== key).reduce((s, p) => s + Number(p.amount || 0), 0);
      const capped = Math.min(value, Math.max(0, discountedTotals.grandTotal - othersTotal));
      return prev.map((p) => (p.payment_method === key ? { ...p, amount: capped } : p));
    });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        {stage === 'cart' ? (
          <>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Current Bill</Text>
              <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                <Icon name="close" size={20} color={colors.inkMuted} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={pricedLines}
              keyExtractor={(l) => l.key}
              contentContainerStyle={{ paddingBottom: 16 }}
              ListEmptyComponent={<Text style={styles.empty}>Cart is empty.</Text>}
              renderItem={({ item: line }) => (
                <View style={styles.cartRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <ProductImage path={line.item.image} size={44} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.cartName} numberOfLines={1}>{line.item.item_name}</Text>
                      <Text style={styles.cartMeta}>
                        Rs. {line.priced.line_total.toFixed(2)}
                        {!line.priced.price_configured && priceType !== 'normal' ? ` · ${priceType} price not set` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => updateQty(line.key, -1)} style={styles.qtyBtn}>
                      <Text style={styles.qtyBtnText}>-</Text>
                    </TouchableOpacity>
                    <TextInput
                      keyboardType="numeric"
                      value={String(line.qty ?? '')}
                      onChangeText={(v) => {
                        const parsed = parseInt(v, 10);
                        updateLine(line.key, { qty: isNaN(parsed) || parsed < 1 ? (v === '' ? '' : 1) : parsed });
                      }}
                      onBlur={() => {
                        if (!line.qty || Number(line.qty) < 1) {
                          updateLine(line.key, { qty: 1 });
                        }
                      }}
                      style={styles.qtyInput}
                    />
                    <TouchableOpacity onPress={() => updateQty(line.key, 1)} style={styles.qtyBtn}>
                      <Icon name="plus" size={12} color={colors.ink} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeLine(line.key)} style={styles.removeBtn}>
                      <Icon name="delete" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.lineExtras}>
                    <View style={styles.discountGroup}>
                      <TouchableOpacity
                        style={[styles.unitToggleBtn, line.discount_mode !== 'amount' && styles.unitToggleBtnActive]}
                        onPress={() => updateLine(line.key, { discount_mode: 'percent' })}
                      >
                        <Text style={line.discount_mode !== 'amount' ? styles.unitToggleTextActive : styles.unitToggleText}>%</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.unitToggleBtn, line.discount_mode === 'amount' && styles.unitToggleBtnActive]}
                        onPress={() => updateLine(line.key, { discount_mode: 'amount' })}
                      >
                        <Text style={line.discount_mode === 'amount' ? styles.unitToggleTextActive : styles.unitToggleText}>Rs.</Text>
                      </TouchableOpacity>
                      <TextInput
                        keyboardType="numeric"
                        placeholder="Disc"
                        value={line.discount_mode === 'amount' ? String(line.discount_amount ?? '') : String(line.discount_percent ?? '')}
                        onChangeText={(v) => updateLine(line.key, line.discount_mode === 'amount' ? { discount_amount: v } : { discount_percent: v })}
                        style={styles.extraInput}
                      />
                    </View>
                    {isFreeQtyAllowed && (
                      <View style={styles.freeQtyGroup}>
                        <Text style={styles.extraLabel}>Free qty</Text>
                        <TextInput
                          keyboardType="numeric"
                          value={String(line.free_qty ?? 0)}
                          onChangeText={(v) => updateLine(line.key, { free_qty: v })}
                          style={styles.extraInputSmall}
                        />
                      </View>
                    )}
                    {line.item.secondary_unit_id ? (
                      <View style={styles.discountGroup}>
                        {[line.item.base_unit_id, line.item.secondary_unit_id].map((unitId) => (
                          <TouchableOpacity
                            key={unitId}
                            style={[styles.unitToggleBtn, line.unit_id === unitId && styles.unitToggleBtnActive]}
                            onPress={() => changeLineUnit(line.key, unitId)}
                          >
                            <Text style={line.unit_id === unitId ? styles.unitToggleTextActive : styles.unitToggleText}>
                              {units.find((u) => u.id === unitId)?.short_code || '—'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.extraLabel}>{units.find((u) => u.id === line.unit_id)?.short_code || ''}</Text>
                    )}
                  </View>
                </View>
              )}
            />
            <View style={styles.summaryBox}>
              <SummaryRow label="Subtotal" value={totals.subtotal} />
              <SummaryRow label={billType === 'non_gst' ? 'GST (not applied)' : 'GST'} value={totals.cgst + totals.sgst + totals.cessAmount} />
              <SummaryRow label="Round off" value={totals.roundOff} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>Rs. {totals.grandTotal.toFixed(2)}</Text>
              </View>
            </View>
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
            <View style={styles.footerRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={onClose}><Text style={styles.secondaryBtnText}>Close</Text></TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryBtn, (cart.length === 0 || holding) && styles.disabled]}
                disabled={cart.length === 0 || holding}
                onPress={onHold}
              >
                <Text style={styles.secondaryBtnText}>{holding ? 'Holding…' : 'Hold Bill'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, cart.length === 0 && styles.disabled]} disabled={cart.length === 0} onPress={openPayment}>
                <Text style={styles.primaryBtnText}>Pay</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Payment</Text>
              <TouchableOpacity onPress={() => setStage('cart')} style={{ padding: 4 }}>
                <Icon name="close" size={20} color={colors.inkMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.discountBox}>
              <Text style={styles.discountTitle}>Bill Discount</Text>
              <View style={styles.discountRow}>
                <View style={styles.discountTypeToggle}>
                  <TouchableOpacity
                    style={[styles.discountTypeBtn, billDiscountType === 'percent' && styles.discountTypeBtnActive]}
                    onPress={() => handleDiscountTypeChange('percent')}
                  >
                    <Text style={billDiscountType === 'percent' ? styles.discountTypeTextActive : styles.discountTypeText}>%</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.discountTypeBtn, billDiscountType === 'amount' && styles.discountTypeBtnActive]}
                    onPress={() => handleDiscountTypeChange('amount')}
                  >
                    <Text style={billDiscountType === 'amount' ? styles.discountTypeTextActive : styles.discountTypeText}>Rs.</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  keyboardType="numeric"
                  placeholder={billDiscountType === 'percent' ? '0%' : 'Rs. 0'}
                  value={String(billDiscountValue)}
                  onChangeText={handleDiscountValueChange}
                  style={styles.discountValueInput}
                />
              </View>
              {discountError ? <Text style={styles.error}>{discountError}</Text> : null}
              {billDiscountAmount > 0 && (
                <View style={styles.discountSummary}>
                  <SummaryRow label="Subtotal" value={totals.subtotal} />
                  <SummaryRow label="Discount" value={-billDiscountAmount} />
                  <SummaryRow label={billType === 'non_gst' ? 'GST (not applied)' : 'GST'} value={discountedTotals.cgst + discountedTotals.sgst + discountedTotals.cessAmount} />
                </View>
              )}
            </View>

            <View style={styles.payableBox}>
              <Text style={styles.payableLabel}>Total Payable</Text>
              <Text style={styles.payableValue}>Rs. {discountedTotals.grandTotal.toFixed(2)}</Text>
            </View>

            <View style={styles.modeToggle}>
              <TouchableOpacity style={[styles.modeBtn, !splitMode && styles.modeBtnActive]} onPress={() => toggleSplit(false)}>
                <Text style={!splitMode ? styles.modeTextActive : styles.modeText}>Single Payment</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modeBtn, splitMode && styles.modeBtnActive]} onPress={() => toggleSplit(true)}>
                <Text style={splitMode ? styles.modeTextActive : styles.modeText}>Split Payment</Text>
              </TouchableOpacity>
            </View>

            {!splitMode ? (
              <>
                <View style={styles.methodGrid}>
                  {PAYMENT_METHODS.map((m) => (
                    <TouchableOpacity
                      key={m.key}
                      style={[styles.methodChip, payments[0]?.payment_method === m.key && styles.methodChipActive]}
                      onPress={() => setPayments([{ ...payments[0], payment_method: m.key }])}
                    >
                      <Text style={payments[0]?.payment_method === m.key ? styles.methodTextActive : styles.methodText}>{m.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  keyboardType="numeric"
                  value={String(payments[0]?.amount ?? '')}
                  onChangeText={(v) => setPayments([{ ...payments[0], amount: Math.min(Number(v) || 0, discountedTotals.grandTotal) }])}
                  style={styles.amountInput}
                />
              </>
            ) : (
              PAYMENT_METHODS.map((m) => (
                <View key={m.key} style={styles.splitRow}>
                  <Text style={styles.splitLabel}>{m.label}</Text>
                  <TextInput
                    keyboardType="numeric"
                    value={String(payments.find((p) => p.payment_method === m.key)?.amount ?? 0)}
                    onChangeText={(v) => setSplitAmount(m.key, v)}
                    style={styles.splitInput}
                  />
                </View>
              ))
            )}

            <View style={styles.summaryBox}>
              <SummaryRow label="Total Bill" value={discountedTotals.grandTotal} />
              <SummaryRow label="Paid" value={paymentsTotal} />
              <View style={[styles.totalRow, { backgroundColor: remaining > 0.009 ? colors.warningBg : colors.successBg }]}>
                <Text style={styles.totalLabel}>{remaining > 0.009 ? 'Remaining (credit)' : 'Fully Paid'}</Text>
                <Text style={styles.totalValue}>Rs. {Math.max(remaining, 0).toFixed(2)}</Text>
              </View>
            </View>

            {blockedNoCustomer && <Text style={styles.error}>Select a customer to allow a partial/credit payment.</Text>}
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

            <View style={styles.footerRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStage('cart')}><Text style={styles.secondaryBtnText}>Back</Text></TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, (completing || blockedNoCustomer || !!discountError) && styles.disabled]}
                disabled={completing || blockedNoCustomer || !!discountError}
                onPress={() => onComplete(payments.filter((p) => Number(p.amount) > 0))}
              >
                <Text style={styles.primaryBtnText}>{completing ? 'Processing…' : 'Pay Now'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

function SummaryRow({ label, value }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{Number(value).toFixed(2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page, padding: 16, paddingTop: 48 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink },
  empty: { textAlign: 'center', color: colors.inkMuted, marginTop: 40 },
  cartRow: { backgroundColor: colors.card, borderRadius: 10, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: colors.borderSoft },
  cartName: { fontSize: 13, fontWeight: '600', color: colors.ink },
  cartMeta: { fontSize: 11, color: colors.inkMuted },
  qtyBtn: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, borderColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  qtyBtnText: { fontWeight: '700', fontSize: 14, color: colors.ink },
  qtyInput: {
    minWidth: 42,
    height: 28,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 0,
    marginHorizontal: 4,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 13,
    color: colors.ink,
    backgroundColor: '#ffffff',
  },
  removeBtn: { marginLeft: 8, padding: 4 },
  lineExtras: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 10 },
  discountGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  unitToggleBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: '#F8FAFC' },
  unitToggleBtnActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  unitToggleText: { fontSize: 11, color: colors.inkMuted, fontWeight: '600' },
  unitToggleTextActive: { fontSize: 11, color: '#fff', fontWeight: '700' },
  extraInput: { width: 56, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, fontSize: 12, backgroundColor: '#fff' },
  freeQtyGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  extraLabel: { fontSize: 11, color: colors.inkMuted, fontWeight: '600' },
  extraInputSmall: { width: 44, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, fontSize: 12, backgroundColor: '#fff' },
  summaryBox: { backgroundColor: colors.card, borderRadius: 12, padding: 12, marginTop: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  summaryLabel: { color: colors.inkMuted, fontSize: 13 },
  summaryValue: { color: colors.ink, fontSize: 13 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.highlight, borderRadius: 8, padding: 10, marginTop: 8 },
  totalLabel: { fontWeight: '700', color: colors.ink },
  totalValue: { fontWeight: '700', fontSize: 16, color: colors.ink },
  footerRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: Platform.OS === 'android' ? 12 : 8,
    paddingBottom: Platform.OS === 'android' ? 8 : 4,
  },
  primaryBtn: { flex: 1, backgroundColor: colors.success, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  secondaryBtnText: { color: colors.ink, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  discountBox: { backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.borderSoft },
  discountTitle: { fontSize: 12, fontWeight: '700', color: colors.inkMuted, marginBottom: 8, textTransform: 'uppercase' },
  discountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discountTypeToggle: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderSoft },
  discountTypeBtn: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.page },
  discountTypeBtnActive: { backgroundColor: colors.gold },
  discountTypeText: { fontSize: 13, color: colors.inkMuted, fontWeight: '600' },
  discountTypeTextActive: { fontSize: 13, color: '#fff', fontWeight: '700' },
  discountValueInput: { flex: 1, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontWeight: '600', backgroundColor: colors.page },
  discountSummary: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  payableBox: { backgroundColor: colors.highlight, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  payableLabel: { fontSize: 11, fontWeight: '700', color: colors.inkMuted, textTransform: 'uppercase' },
  payableValue: { fontSize: 26, fontWeight: '700', color: colors.ink },
  modeToggle: { flexDirection: 'row', backgroundColor: colors.page, borderRadius: 10, padding: 4, marginBottom: 12 },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  modeBtnActive: { backgroundColor: colors.card },
  modeText: { color: colors.inkMuted, fontSize: 13, fontWeight: '600' },
  modeTextActive: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  methodChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.card },
  methodChipActive: { borderColor: colors.gold, backgroundColor: '#F5EBD3' },
  methodText: { color: colors.inkMuted, fontWeight: '600' },
  methodTextActive: { color: colors.gold, fontWeight: '700' },
  amountInput: { borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 10, padding: 12, fontSize: 18, fontWeight: '700', backgroundColor: colors.card },
  splitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  splitLabel: { fontWeight: '600', color: colors.ink, width: 70 },
  splitInput: { flex: 1, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 8, padding: 10, textAlign: 'right', backgroundColor: colors.card },
  error: { color: colors.danger, fontSize: 12, marginTop: 8 },
});
