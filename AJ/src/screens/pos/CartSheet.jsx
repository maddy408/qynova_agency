import { useState, useEffect } from 'react';
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
  const [selectingUnitLineKey, setSelectingUnitLineKey] = useState(null);
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

  const hasLineDiscountError = pricedLines.some((l) => !!l.priced.discount_error);

  const openPayment = () => {
    if (hasLineDiscountError) return;
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
  const isSplitOverpaid = splitMode && (paymentsTotal > discountedTotals.grandTotal + 0.009);

  const toggleSplit = (next) => {
    setSplitMode(next);
    const activeMethod = !hasCustomer ? 'cash' : 'credit';
    setPayments(next
      ? PAYMENT_METHODS.map((m) => ({ payment_method: m.key, amount: m.key === activeMethod ? String(discountedTotals.grandTotal) : '' }))
      : [{ payment_method: activeMethod, amount: discountedTotals.grandTotal }]);
  };

  const setSplitAmount = (key, raw) => {
    setPayments((prev) => {
      const exists = prev.some((p) => p.payment_method === key);
      return exists
        ? prev.map((p) => (p.payment_method === key ? { ...p, amount: raw } : p))
        : [...prev, { payment_method: key, amount: raw }];
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
                        style={[styles.extraInput, line.priced?.discount_error && styles.extraInputError]}
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
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
                      ) : null}
                      <TouchableOpacity
                        style={styles.unitPickerBtn}
                        onPress={() => setSelectingUnitLineKey(line.key)}
                      >
                        <Text style={styles.unitPickerBtnText}>
                          {units.find((u) => u.id === line.unit_id)?.short_code || 'Unit'} ▾
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {line.priced?.discount_error ? (
                    <Text style={styles.lineErrorText}>{line.priced.discount_error}</Text>
                  ) : null}
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
            {hasLineDiscountError && (
              <Text style={styles.error}>⚠️ Please fix discount errors before continuing — discount cannot exceed item total.</Text>
            )}
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
            <View style={styles.footerRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={onClose}><Text style={styles.secondaryBtnText}>Close</Text></TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryBtn, (cart.length === 0 || holding || hasLineDiscountError) && styles.disabled]}
                disabled={cart.length === 0 || holding || hasLineDiscountError}
                onPress={onHold}
              >
                <Text style={styles.secondaryBtnText}>{holding ? 'Holding…' : 'Hold Bill'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, (cart.length === 0 || hasLineDiscountError) && styles.disabled]}
                disabled={cart.length === 0 || hasLineDiscountError}
                onPress={openPayment}
              >
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
              PAYMENT_METHODS.map((m) => {
                const cur = payments.find((p) => p.payment_method === m.key);
                const rawVal = cur?.amount !== undefined && cur?.amount !== null ? String(cur.amount) : '';
                return (
                  <View key={m.key} style={styles.splitRow}>
                    <Text style={styles.splitLabel}>{m.label}</Text>
                    <TextInput
                      keyboardType="numeric"
                      value={rawVal}
                      placeholder="0.00"
                      placeholderTextColor={colors.inkMuted}
                      onChangeText={(v) => setSplitAmount(m.key, v)}
                      style={styles.splitInput}
                    />
                  </View>
                );
              })
            )}

            <View style={styles.summaryBox}>
              <SummaryRow label="Total Bill" value={discountedTotals.grandTotal} />
              <SummaryRow label="Paid" value={paymentsTotal} />
              <View style={[styles.totalRow, { backgroundColor: remaining > 0.009 ? colors.warningBg : colors.successBg }]}>
                <Text style={styles.totalLabel}>{remaining > 0.009 ? 'Remaining (credit)' : 'Fully Paid'}</Text>
                <Text style={styles.totalValue}>Rs. {Math.max(remaining, 0).toFixed(2)}</Text>
              </View>
            </View>

            {isSplitOverpaid && (
              <Text style={styles.error}>⚠️ Total split payments (Rs. {paymentsTotal.toFixed(2)}) cannot exceed total bill (Rs. {discountedTotals.grandTotal.toFixed(2)}).</Text>
            )}
            {blockedNoCustomer && <Text style={styles.error}>Select a customer to allow a partial/credit payment.</Text>}
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

            <View style={styles.footerRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStage('cart')}><Text style={styles.secondaryBtnText}>Back</Text></TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, (completing || blockedNoCustomer || !!discountError || isSplitOverpaid || paymentsTotal <= 0) && styles.disabled]}
                disabled={completing || blockedNoCustomer || !!discountError || isSplitOverpaid || paymentsTotal <= 0}
                onPress={() => onComplete(payments.map((p) => ({ ...p, amount: Number(p.amount) || 0 })).filter((p) => p.amount > 0))}
              >
                <Text style={styles.primaryBtnText}>{completing ? 'Processing…' : 'Pay Now'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Modal for changing line unit type */}
        <Modal
          visible={!!selectingUnitLineKey}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectingUnitLineKey(null)}
        >
          <TouchableOpacity
            style={styles.unitModalOverlay}
            activeOpacity={1}
            onPress={() => setSelectingUnitLineKey(null)}
          >
            <View style={styles.unitModalContent}>
              <View style={styles.unitModalHeader}>
                <Text style={styles.unitModalTitle}>Select Unit</Text>
                <TouchableOpacity onPress={() => setSelectingUnitLineKey(null)} style={{ padding: 4 }}>
                  <Icon name="close" size={18} color={colors.inkMuted} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={units}
                keyExtractor={(u) => String(u.id)}
                ListEmptyComponent={<Text style={{ textAlign: 'center', padding: 16, color: colors.inkMuted }}>No units available</Text>}
                renderItem={({ item: u }) => {
                  const currentLine = cart.find((l) => l.key === selectingUnitLineKey);
                  const isSelected = currentLine?.unit_id === u.id;
                  return (
                    <TouchableOpacity
                      style={[styles.unitOption, isSelected && styles.unitOptionActive]}
                      onPress={() => {
                        if (selectingUnitLineKey) {
                          changeLineUnit(selectingUnitLineKey, u.id);
                        }
                        setSelectingUnitLineKey(null);
                      }}
                    >
                      <Text style={[styles.unitOptionText, isSelected && styles.unitOptionTextActive]}>
                        {u.name || u.unit_name} ({u.short_code})
                      </Text>
                      {isSelected && <Icon name="check" size={16} color={colors.gold} />}
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </TouchableOpacity>
        </Modal>
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
  unitPickerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: '#F5EBD3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitPickerBtnText: {
    fontSize: 11,
    color: colors.gold,
    fontWeight: '700',
  },
  lineErrorText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  extraInputError: {
    borderColor: colors.danger,
    backgroundColor: '#FEF2F2',
  },
  unitModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  unitModalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    width: '100%',
    maxHeight: '60%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  unitModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  unitModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  unitOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  unitOptionActive: {
    backgroundColor: '#F5EBD3',
  },
  unitOptionText: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: '500',
  },
  unitOptionTextActive: {
    fontWeight: '700',
    color: colors.gold,
  },
});
