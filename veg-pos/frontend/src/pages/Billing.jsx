import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listItems } from '../api/items';
import { listParties, getParty } from '../api/parties';
import { listPaymentMethods } from '../api/payments';
import { createBill, listHeldBills, holdBill, deleteHeldBill } from '../api/bills';
import { formatINR, todayISO } from '../utils/format';
import QuickSale from './QuickSale';

const emptyCart = () => ({
  locationType: 'local',
  billType: 'normal',
  partyId: '',
  walkinName: '',
  billDate: todayISO(),
  lines: [],
  discountPercent: '',
  discountAmount: 0,
  commissionMode: 'percentage',
  commissionPercent: 10,
  commissionAmount: 0,
  patthu: 0,
  cooli: 0,
  vadagai: 0,
  otherDeduction: 0,
  paidAmount: 0,
  paymentMethodId: '',
  notes: '',
});

export default function Billing() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentMode = searchParams.get('mode') === 'quick' ? 'quick' : 'standard';

  const [items, setItems] = useState([]);
  const [parties, setParties] = useState([]);
  const [methods, setMethods] = useState([]);
  const [cart, setCart] = useState(emptyCart());
  const [previousBalance, setPreviousBalance] = useState(0);
  const [isPaidManuallyEdited, setIsPaidManuallyEdited] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [heldOpen, setHeldOpen] = useState(false);
  const [heldBills, setHeldBills] = useState([]);
  const [saving, setSaving] = useState(false);
  const codeRef = useRef(null);

  useEffect(() => {
    listItems({ active_only: '1' }).then(setItems);
    listParties().then(setParties);
    listPaymentMethods().then((m) => {
      setMethods(m);
      const def = m.find((x) => x.is_default) || m[0];
      if (def) setCart((c) => ({ ...c, paymentMethodId: def.id }));
    });
  }, []);

  useEffect(() => {
    if (!cart.partyId) {
      setPreviousBalance(0);
      return;
    }
    getParty(cart.partyId).then((p) => setPreviousBalance(Number(p.balance || 0)));
  }, [cart.partyId]);

  function addItemByCode(rawInput) {
    if (!rawInput || !rawInput.trim()) return;
    const trimmed = rawInput.trim();

    let parsedCode = trimmed;
    let customQty = null;

    // Check for patterns like "L 1.5" or "L*1.5" or "1.5 L" or "1.5*L"
    const suffixMatch = trimmed.match(/^([a-zA-Z0-9]+)[\s*xX]+([0-9]+(?:\.[0-9]+)?)$/);
    const prefixMatch = trimmed.match(/^([0-9]+(?:\.[0-9]+)?)[\s*xX]+([a-zA-Z0-9]+)$/);

    if (suffixMatch) {
      parsedCode = suffixMatch[1];
      customQty = parseFloat(suffixMatch[2]);
    } else if (prefixMatch) {
      customQty = parseFloat(prefixMatch[1]);
      parsedCode = prefixMatch[2];
    }

    const match = items.find((i) => i.code.toLowerCase() === parsedCode.toLowerCase());
    if (!match) return;

    setCart((c) => {
      const existingIdx = c.lines.findIndex((l) => l.item_id === match.id);

      if (existingIdx >= 0) {
        // Item already in cart: increment quantity, do NOT add duplicate line
        const updatedLines = [...c.lines];
        const existing = updatedLines[existingIdx];
        const addQty = customQty !== null && customQty > 0 ? customQty : 1;

        if (existing.is_charge_item) {
          const curNos = parseFloat(existing.nos) || 0;
          updatedLines[existingIdx] = {
            ...existing,
            nos: Math.round((curNos + addQty) * 100) / 100,
          };
        } else {
          const curWeight = parseFloat(existing.weight) || 0;
          const newWeight = curWeight <= 0 ? addQty : Math.round((curWeight + addQty) * 1000) / 1000;
          updatedLines[existingIdx] = {
            ...existing,
            weight: newWeight,
          };
        }

        return { ...c, lines: updatedLines };
      }

      // First time adding this item: default quantity = 1 (or customQty if provided)
      const initialQty = customQty !== null && customQty > 0 ? customQty : 1;
      return {
        ...c,
        lines: [
          ...c.lines,
          {
            key: Date.now() + Math.random(),
            item_id: match.id,
            item_name_ta: match.name_ta,
            item_name_en: match.name_en,
            unit: match.unit || 'kg',
            is_charge_item: !!match.is_charge_item,
            rate: match.default_rate !== null && match.default_rate !== undefined ? Number(match.default_rate) : 0,
            nos: match.is_charge_item ? initialQty : '',
            bag_count: '',
            weight: match.is_charge_item ? 0 : initialQty,
          },
        ],
      };
    });

    setCodeInput('');
  }

  function updateLine(key, field, value) {
    setCart((c) => ({
      ...c,
      lines: c.lines.map((l) => (l.key === key ? { ...l, [field]: value } : l)),
    }));
  }

  function removeLine(key) {
    setCart((c) => ({ ...c, lines: c.lines.filter((l) => l.key !== key) }));
  }

  function lineAmount(l) {
    const rate = Number(l.rate) || 0;
    return l.is_charge_item ? rate * (Number(l.nos) || 0) : rate * (Number(l.weight) || 0);
  }

  const itemsTotal = cart.lines.reduce((s, l) => s + lineAmount(l), 0);

  let discountAmount = 0;
  if (cart.discountPercent !== '' && cart.discountPercent !== null) {
    discountAmount = (itemsTotal * Number(cart.discountPercent)) / 100;
  } else {
    discountAmount = Number(cart.discountAmount) || 0;
  }

  const grossTotal = itemsTotal;
  const isFixedCommission = cart.commissionMode === 'fixed';
  const commissionAmount = isFixedCommission
    ? Number(cart.commissionAmount) || 0
    : (grossTotal * (Number(cart.commissionPercent) || 0)) / 100;
  const otherDeduction = Number(cart.otherDeduction) || 0;
  const totalDeductions = commissionAmount + (Number(cart.patthu) || 0) + (Number(cart.cooli) || 0) + (Number(cart.vadagai) || 0) + otherDeduction;
  const netTotal = grossTotal - totalDeductions;
  const deductionsExceedSales = totalDeductions > grossTotal + 0.009;

  const todayTotal = itemsTotal - discountAmount;
  const isCommission = cart.billType === 'commission';
  const currentBillTotal = isCommission ? netTotal : todayTotal;

  // Positive previousBalance = customer owes shop credit.
  // Negative previousBalance = shop owes customer (advance / supplier balance).
  const oldCreditBalance = Number(previousBalance) || 0;
  const grandTotal = currentBillTotal + Math.max(0, oldCreditBalance);

  const paid = Number(cart.paidAmount) || 0;
  const currentBillDue = Math.max(0, currentBillTotal - paid);
  const excessPaidOverBill = Math.max(0, paid - currentBillTotal);

  // Credit adjustment logic:
  const creditDeduction = oldCreditBalance > 0 ? Math.min(oldCreditBalance, excessPaidOverBill) : 0;
  const remainingOldCredit = oldCreditBalance > 0 ? oldCreditBalance - creditDeduction : 0;
  const changeToReturn = excessPaidOverBill - creditDeduction;

  // Total balance of party after this bill:
  const newPartyBalance = oldCreditBalance + (currentBillTotal - paid);
  const canSave = !isCommission || !deductionsExceedSales;

  // Auto-sync paidAmount with full currentBillTotal for cash/regular payment unless user manually edited or chose credit
  useEffect(() => {
    if (!isPaidManuallyEdited) {
      const selected = methods.find((m) => m.id == cart.paymentMethodId);
      const isCredit = selected?.name_ta === 'கடன்' || selected?.name_en?.toLowerCase() === 'credit';
      const target = isCredit ? 0 : (currentBillTotal > 0 ? currentBillTotal : 0);
      setCart((c) => {
        if (Number(c.paidAmount) === Number(target)) return c;
        return { ...c, paidAmount: target };
      });
    }
  }, [currentBillTotal, isPaidManuallyEdited, cart.paymentMethodId, methods]);

  function handlePaymentMethodChange(methodId) {
    const selected = methods.find((m) => m.id == methodId);
    const isCredit = selected?.name_ta === 'கடன்' || selected?.name_en?.toLowerCase() === 'credit';
    setCart((c) => ({
      ...c,
      paymentMethodId: methodId,
      paidAmount: isCredit ? 0 : (currentBillTotal > 0 ? currentBillTotal : 0),
    }));
    setIsPaidManuallyEdited(isCredit);
  }

  function buildPayload() {
    return {
      location_type: cart.locationType,
      bill_type: cart.billType,
      party_id: cart.partyId || null,
      walkin_name: cart.partyId ? null : cart.walkinName || null,
      bill_date: cart.billDate,
      lines: cart.lines.map((l) => ({
        item_id: l.item_id,
        item_name_ta: l.item_name_ta,
        item_name_en: l.item_name_en,
        unit: l.unit,
        is_charge_item: l.is_charge_item,
        rate: Number(l.rate) || 0,
        nos: Number(l.nos) || 0,
        bag_count: l.nos !== '' && l.nos !== null && l.nos !== undefined ? Number(l.nos) : null,
        weight: Number(l.weight) || 0,
        amount: lineAmount(l),
      })),
      discount_percent: cart.discountPercent === '' ? null : Number(cart.discountPercent),
      discount_amount: discountAmount,
      previous_balance: previousBalance,
      commission_percent: isCommission && !isFixedCommission ? Number(cart.commissionPercent) : null,
      commission_mode: cart.commissionMode,
      commission_amount: isCommission ? commissionAmount : 0,
      patthu_amount: isCommission ? Number(cart.patthu) || 0 : 0,
      cooli_amount: isCommission ? Number(cart.cooli) || 0 : 0,
      vadagai_amount: isCommission ? Number(cart.vadagai) || 0 : 0,
      other_deduction_amount: isCommission ? otherDeduction : 0,
      paid_amount: paid,
      payment_method_id: cart.paymentMethodId || null,
      notes: cart.notes || null,
    };
  }

  async function handleSave(andPrint = true) {
    if (!canSave) return;
    setSaving(true);
    try {
      const bill = await createBill(buildPayload());
      resetCart();
      navigate(`/print/bill/${bill.id}`);
    } catch (err) {
      alert(err?.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleHold() {
    if (cart.lines.length === 0) return;
    const label = cart.partyId ? parties.find((p) => p.id === Number(cart.partyId))?.name : cart.walkinName || 'Walk-in';
    await holdBill({
      label,
      cart_json: JSON.stringify(cart),
      location_type: cart.locationType,
      bill_type: cart.billType,
      party_id: cart.partyId || null,
    });
    resetCart();
  }

  function resetCart() {
    setIsPaidManuallyEdited(false);
    setCart(emptyCart());
    const def = methods.find((x) => x.is_default) || methods[0];
    if (def) setCart((c) => ({ ...c, paymentMethodId: def.id }));
    setTimeout(() => codeRef.current?.focus(), 50);
  }

  async function openHeld() {
    const list = await listHeldBills();
    setHeldBills(list);
    setHeldOpen(true);
  }

  function resumeHeld(row) {
    try {
      const parsed = typeof row.cart_json === 'string' ? JSON.parse(row.cart_json) : row.cart_json;
      setCart(parsed);
      setHeldOpen(false);
      deleteHeldBill(row.id);
    } catch (e) {
      alert('Could not restore bill');
    }
  }

  async function removeHeld(id) {
    await deleteHeldBill(id);
    setHeldBills((rows) => rows.filter((r) => r.id !== id));
  }

  useEffect(() => {
    if (currentMode === 'quick') return;
    function onKey(e) {
      if (e.key === 'F2') {
        e.preventDefault();
        handleHold();
      } else if (e.key === 'F9') {
        e.preventDefault();
        handleSave(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, currentMode]);

  return (
    <div className="w-full space-y-1.5 select-none text-slate-800">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between pb-1 border-b border-gray-200">
        <div className="inline-flex p-0.5 bg-gray-200/80 rounded-md border border-gray-300">
          <button
            type="button"
            onClick={() => setSearchParams({})}
            className={`px-3 py-1 rounded text-xs font-bold transition-all ${
              currentMode !== 'quick'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('nav.billing')}
          </button>
          <button
            type="button"
            onClick={() => setSearchParams({ mode: 'quick' })}
            className={`px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
              currentMode === 'quick'
                ? 'bg-blue-900 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>⚡</span>
            <span>{t('nav.quick_sale')}</span>
          </button>
        </div>

        {currentMode !== 'quick' && (
          <div className="flex items-center gap-1.5">
            <button
              className="btn-secondary h-7 py-0.5 px-3 text-xs font-semibold rounded"
              onClick={openHeld}
            >
              {t('billing.held_bills')}
            </button>
            <button
              className="btn-secondary h-7 py-0.5 px-3 text-xs font-semibold rounded bg-slate-800 text-white hover:bg-slate-900"
              onClick={resetCart}
            >
              + {t('billing.new_bill')}
            </button>
          </div>
        )}
      </div>

      {currentMode === 'quick' ? (
        <QuickSale embedded />
      ) : (
        <>
          {/* 1. BILLING DETAILS Card */}
          <div className="bg-white rounded-lg border border-gray-200/90 p-2.5 space-y-1.5 shadow-xs">
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-700">
              BILLING DETAILS
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 items-end">
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 block mb-0.5">LOCATION</label>
                <select
                  className="w-full h-7 px-2 text-xs rounded border border-gray-300 bg-white font-medium focus:ring-1 focus:ring-blue-600"
                  value={cart.locationType}
                  onChange={(e) => setCart({ ...cart, locationType: e.target.value })}
                >
                  <option value="local">{t('billing.location_local')}</option>
                  <option value="distant">{t('billing.location_distant')}</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 block mb-0.5">TYPE</label>
                <select
                  className="w-full h-7 px-2 text-xs rounded border border-gray-300 bg-white font-medium focus:ring-1 focus:ring-blue-600"
                  value={cart.billType}
                  onChange={(e) => setCart({ ...cart, billType: e.target.value })}
                >
                  <option value="normal">{t('billing.type_normal')}</option>
                  <option value="commission">{t('billing.type_commission')}</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 block mb-0.5">{t('common.date')}</label>
                <input
                  type="date"
                  className="w-full h-7 px-2 text-xs rounded border border-gray-300 bg-white font-medium focus:ring-1 focus:ring-blue-600"
                  value={cart.billDate}
                  onChange={(e) => setCart({ ...cart, billDate: e.target.value })}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 block mb-0.5">{t('billing.select_party')}</label>
                <select
                  className="w-full h-7 px-2 text-xs rounded border border-gray-300 bg-white font-medium focus:ring-1 focus:ring-blue-600"
                  value={cart.partyId}
                  onChange={(e) => setCart({ ...cart, partyId: e.target.value })}
                >
                  <option value="">{t('common.walkin')}</option>
                  {parties
                    .filter((p) => (isCommission ? p.type !== 'customer' : true))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>

              {!cart.partyId ? (
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-500 block mb-0.5">WALK-IN NAME</label>
                  <input
                    className="w-full h-7 px-2 text-xs rounded border border-gray-300 bg-white font-medium focus:ring-1 focus:ring-blue-600"
                    placeholder={t('common.walkin') + ' ' + t('common.name')}
                    value={cart.walkinName}
                    onChange={(e) => setCart({ ...cart, walkinName: e.target.value })}
                  />
                </div>
              ) : (
                <div className="text-xs text-gray-600 flex items-center h-7 font-medium">
                  <span>{t('billing.previous_balance')}: <strong className="text-slate-900 font-mono ml-1">{formatINR(previousBalance)}</strong></span>
                </div>
              )}
            </div>

            {/* Code Search Input Bar (Prominent Height & Quick Typing) */}
            <div className="relative flex items-center py-1">
              <input
                ref={codeRef}
                className="w-full h-11 sm:h-12 pl-11 pr-28 text-sm sm:text-base font-mono font-black uppercase rounded-lg border-2 border-emerald-600/80 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100 bg-emerald-50/20 text-slate-900 placeholder-slate-400 shadow-xs transition-all"
                placeholder="Enter Item Shortcut (e.g. A..Z, L, L 1.5) & Press Enter"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addItemByCode(codeInput);
                  }
                }}
              />
              <span className="absolute left-3.5 text-emerald-600 font-black text-xl pointer-events-none select-none">+</span>
              <span className="absolute right-3 text-[11px] font-bold text-gray-500 bg-white/90 border border-gray-300 px-2 py-1 rounded shadow-2xs pointer-events-none">
                Enter ↵
              </span>
            </div>
          </div>

          {/* 2. Items Lines Table (Scrollable within container, never scrolls page) */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
            <div className="overflow-y-auto max-h-[140px] xl:max-h-[175px]">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50 border-b border-gray-200 z-10">
                  <tr className="text-[10.5px] uppercase font-bold text-slate-600">
                    <th className="py-1 px-2 text-left">{t('billing.item')}</th>
                    <th className="py-1 px-2 text-right w-24">{t('billing.rate')}</th>
                    <th className="py-1 px-2 text-center w-20">{t('billing.nos')}</th>
                    <th className="py-1 px-2 text-right w-28">{t('billing.qty')}</th>
                    <th className="py-1 px-2 text-right w-28">{t('billing.amount')}</th>
                    <th className="py-1 px-1.5 text-center w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {cart.lines.map((l) => (
                    <tr key={l.key} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-1 px-2 text-slate-800 font-semibold text-xs">
                        {l.item_name_ta} {l.item_name_en && <span className="text-gray-400 font-normal text-[11px]">({l.item_name_en})</span>}
                      </td>
                      <td className="py-1 px-2 text-right">
                        <input
                          className="w-20 h-6.5 px-1.5 text-xs text-right font-mono border border-gray-300 rounded focus:ring-1 focus:ring-blue-600"
                          type="number"
                          step="any"
                          value={l.rate}
                          onChange={(e) => updateLine(l.key, 'rate', e.target.value)}
                        />
                      </td>
                      <td className="py-1 px-2 text-center">
                        <input
                          className="w-16 h-6.5 px-1 text-xs text-center font-mono border border-gray-300 rounded focus:ring-1 focus:ring-blue-600"
                          type="number"
                          step="any"
                          value={l.nos === 0 || l.nos === '0' ? '' : (l.nos ?? '')}
                          onChange={(e) => updateLine(l.key, 'nos', e.target.value)}
                        />
                      </td>
                      <td className="py-1 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            className="w-20 h-6.5 px-1.5 text-xs text-right font-mono font-semibold border border-gray-300 rounded focus:ring-1 focus:ring-blue-600"
                            type="number"
                            step="any"
                            disabled={l.is_charge_item}
                            value={l.weight}
                            onChange={(e) => updateLine(l.key, 'weight', e.target.value)}
                          />
                          {!l.is_charge_item && <span className="text-[10px] text-gray-500 font-mono w-5 text-left">{l.unit || 'kg'}</span>}
                        </div>
                      </td>
                      <td className="py-1 px-2 text-right font-bold font-mono text-slate-900 text-xs">
                        {formatINR(lineAmount(l))}
                      </td>
                      <td className="py-1 px-1.5 text-center">
                        <button
                          className="text-red-500 hover:text-red-700 font-bold text-xs"
                          onClick={() => removeLine(l.key)}
                          title="Remove item"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                  {cart.lines.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-gray-400 py-3 text-xs italic">
                        — No items added. Enter code above to add items —
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Bottom 2-Column Section (BILLING SUMMARY & PAYMENT) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
            {/* Left: BILLING SUMMARY */}
            <div className="bg-white rounded-lg border border-gray-200 p-2 space-y-1 shadow-xs">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-700 pb-0.5 border-b border-gray-100 flex justify-between items-center">
                <span>{isCommission ? 'COMMISSION BILL SUMMARY' : 'BILLING SUMMARY'}</span>
                <span className="font-mono text-xs text-slate-600 font-bold">{cart.lines.length} items</span>
              </div>

              <Row label={t('billing.items_total')} value={formatINR(itemsTotal)} />

              {!isCommission ? (
                <>
                  <div className="flex items-center justify-between py-0.5 text-xs">
                    <label className="text-gray-600 text-xs mb-0">{t('billing.discount')}</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        className="w-16 h-6 px-1.5 text-xs rounded border border-gray-300 text-right font-mono"
                        type="number"
                        placeholder="%"
                        value={cart.discountPercent}
                        onChange={(e) => setCart({ ...cart, discountPercent: e.target.value })}
                      />
                      <input
                        className="w-24 h-6 px-1.5 text-xs rounded border border-gray-300 text-right font-mono"
                        type="number"
                        placeholder="₹"
                        disabled={cart.discountPercent !== ''}
                        value={cart.discountPercent !== '' ? discountAmount.toFixed(2) : cart.discountAmount}
                        onChange={(e) => setCart({ ...cart, discountAmount: e.target.value })}
                      />
                    </div>
                  </div>

                  {oldCreditBalance > 0 && (
                    <Row label="பழைய கடன் பாக்கி (Old Credit)" value={formatINR(oldCreditBalance)} />
                  )}
                  {oldCreditBalance < 0 && (
                    <Row label="முன் அட்வான்ஸ் இருப்பு (Advance)" value={formatINR(Math.abs(oldCreditBalance))} />
                  )}

                  {/* Bill Total Navy Bar */}
                  <div className="bg-[#0a1733] text-white px-3 py-1 rounded-md flex items-center justify-between font-black text-xs mt-1">
                    <span className="tracking-wide">இன்றைய பில் மொத்தம் (BILL TOTAL)</span>
                    <span className="font-mono text-sm tracking-tight">{formatINR(currentBillTotal)}</span>
                  </div>
                  {oldCreditBalance > 0 && (
                    <div className="flex justify-between items-center text-[11px] text-gray-500 font-bold px-1 pt-0.5">
                      <span>மொத்த கணக்கு (Total with Old Credit):</span>
                      <span className="font-mono text-slate-800">{formatINR(oldCreditBalance + currentBillTotal)}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between py-0.5 text-xs">
                    <span className="text-gray-600">{t('billing.commission_mode')}</span>
                    <div className="inline-flex p-0.5 bg-gray-100 rounded border border-gray-200 text-xs">
                      <button
                        type="button"
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${cart.commissionMode === 'percentage' ? 'bg-blue-900 text-white' : 'text-gray-600'}`}
                        onClick={() => setCart({ ...cart, commissionMode: 'percentage' })}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${cart.commissionMode === 'fixed' ? 'bg-blue-900 text-white' : 'text-gray-600'}`}
                        onClick={() => setCart({ ...cart, commissionMode: 'fixed' })}
                      >
                        Fixed ₹
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-0.5 text-xs">
                    <label className="text-gray-600 text-xs mb-0">{t('billing.commission')}</label>
                    {cart.commissionMode === 'percentage' ? (
                      <input
                        className="w-20 h-6 px-1.5 text-xs text-right font-mono rounded border border-gray-300"
                        type="number"
                        min="0"
                        placeholder="%"
                        value={cart.commissionPercent}
                        onChange={(e) => setCart({ ...cart, commissionPercent: e.target.value })}
                      />
                    ) : (
                      <input
                        className="w-24 h-6 px-1.5 text-xs text-right font-mono rounded border border-gray-300"
                        type="number"
                        min="0"
                        placeholder="₹"
                        value={cart.commissionAmount}
                        onChange={(e) => setCart({ ...cart, commissionAmount: e.target.value })}
                      />
                    )}
                  </div>

                  {cart.commissionMode === 'percentage' && (
                    <Row label={t('billing.commission') + ' (₹)'} value={formatINR(commissionAmount)} />
                  )}

                  <NumberRow label={t('billing.patthu')} value={cart.patthu} onChange={(v) => setCart({ ...cart, patthu: v })} />
                  <NumberRow label={t('billing.cooli')} value={cart.cooli} onChange={(v) => setCart({ ...cart, cooli: v })} />
                  <NumberRow label={t('billing.vadagai')} value={cart.vadagai} onChange={(v) => setCart({ ...cart, vadagai: v })} />
                  <NumberRow label={t('billing.other_deduction')} value={cart.otherDeduction} onChange={(v) => setCart({ ...cart, otherDeduction: v })} />
                  
                  <Row label={t('billing.commission_side_total')} value={formatINR(totalDeductions)} bold />

                  {deductionsExceedSales && (
                    <p className="text-red-600 text-xs font-bold bg-red-50 border border-red-200 rounded px-2 py-0.5">
                      ⚠ {t('billing.validation_exceeds')}
                    </p>
                  )}

                  {/* Net Total Navy Bar */}
                  <div className="bg-[#0a1733] text-white px-3 py-1 rounded-md flex items-center justify-between font-black text-xs mt-1">
                    <span className="tracking-wide">NET TOTAL</span>
                    <span className="font-mono text-sm tracking-tight">{formatINR(netTotal)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Right: PAYMENT */}
            <div className="bg-white rounded-lg border border-gray-200 p-2 space-y-1 shadow-xs">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-700 pb-0.5 border-b border-gray-100">
                PAYMENT
              </div>

              <div className="flex items-center justify-between py-0.5 text-xs">
                <label className="text-gray-600 text-xs mb-0 font-medium">{t('billing.paid_amount')}</label>
                <div className="flex items-center gap-1">
                  <input
                    className="w-24 h-6 px-1.5 text-xs text-right font-mono font-bold rounded border border-gray-300 focus:ring-1 focus:ring-blue-600"
                    type="number"
                    step="0.01"
                    value={cart.paidAmount}
                    onChange={(e) => {
                      setIsPaidManuallyEdited(true);
                      setCart({ ...cart, paidAmount: e.target.value });
                    }}
                  />
                  <button
                    type="button"
                    title="இன்றைய பில் தொகை மட்டும் செலுத்த (Pay Current Bill)"
                    className="px-2 py-0.5 text-[10px] font-black bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
                    onClick={() => {
                      setIsPaidManuallyEdited(false);
                      setCart({ ...cart, paidAmount: currentBillTotal > 0 ? currentBillTotal : 0 });
                    }}
                  >
                    Full
                  </button>
                </div>
              </div>

              {/* Quick adjustment chips */}
              <div className="flex gap-1 justify-end pb-0.5 text-[10px]">
                <button
                  type="button"
                  className="px-1.5 py-0.5 text-gray-600 hover:bg-gray-100 border border-gray-200 rounded font-medium"
                  onClick={() => {
                    setIsPaidManuallyEdited(true);
                    setCart({ ...cart, paidAmount: 0 });
                  }}
                >
                  கடன் (0)
                </button>
                {oldCreditBalance > 0 && (
                  <button
                    type="button"
                    className="px-1.5 py-0.5 text-blue-700 hover:bg-blue-50 border border-blue-200 rounded font-medium"
                    onClick={() => {
                      setIsPaidManuallyEdited(true);
                      setCart({ ...cart, paidAmount: currentBillTotal + oldCreditBalance });
                    }}
                  >
                    முழு பழைய கடன் + பில் ({formatINR(currentBillTotal + oldCreditBalance)})
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between py-0.5 text-xs">
                <label className="text-gray-600 text-xs mb-0 font-medium">{t('billing.payment_method')}</label>
                <select
                  className="w-36 h-6 px-1.5 text-xs rounded border border-gray-300 font-medium bg-white focus:ring-1 focus:ring-blue-600"
                  value={cart.paymentMethodId}
                  onChange={(e) => handlePaymentMethodChange(e.target.value)}
                >
                  {methods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name_ta}
                    </option>
                  ))}
                </select>
              </div>

              {/* Balance Due Navy Bar */}
              <div className={`px-3 py-1 rounded-md flex items-center justify-between font-black text-xs ${
                currentBillDue > 0 ? 'bg-[#0a1733] text-white' : 'bg-emerald-950 text-white'
              }`}>
                <span className="tracking-wide">
                  {currentBillDue > 0
                    ? 'BILL BALANCE DUE (பில் மீதி பாக்கி)'
                    : changeToReturn > 0
                      ? 'CHANGE TO RETURN (சில்லறை கொடுக்க)'
                      : 'PAID IN FULL (முழுவதும் செலுத்தப்பட்டது)'}
                </span>
                <span className={`font-mono text-sm ${
                  currentBillDue > 0 ? 'text-rose-400' : changeToReturn > 0 ? 'text-amber-300 font-black' : 'text-emerald-300'
                }`}>
                  {currentBillDue > 0
                    ? formatINR(currentBillDue)
                    : changeToReturn > 0
                      ? `+ ${formatINR(changeToReturn)}`
                      : formatINR(0)}
                </span>
              </div>

              {/* Live Credit & Adjustment Status */}
              {cart.partyId && (
                <div className="bg-slate-50 border border-slate-200 text-slate-800 rounded p-1.5 text-[11px] space-y-1 mt-0.5">
                  {oldCreditBalance > 0 ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-600">பழைய கடன் இருப்பு:</span>
                        <span className="font-mono font-bold text-slate-800">{formatINR(oldCreditBalance)}</span>
                      </div>

                      {paid === currentBillTotal && currentBillTotal > 0 && (
                        <div className="flex justify-between text-emerald-700 font-semibold border-t border-slate-200 pt-0.5">
                          <span>இன்றைய பில் செலுத்தப்பட்டது:</span>
                          <span>பழைய கடனில் மாற்றமில்லை ({formatINR(oldCreditBalance)}) ✓</span>
                        </div>
                      )}

                      {currentBillDue > 0 && (
                        <div className="flex justify-between text-rose-700 font-bold border-t border-slate-200 pt-0.5">
                          <span>இன்றைய பில் கடனில் சேர்க்கப்பட்டது:</span>
                          <span className="font-mono">+ {formatINR(currentBillDue)} (மொத்த கடன்: {formatINR(newPartyBalance)})</span>
                        </div>
                      )}

                      {excessPaidOverBill > 0 && (
                        <div className="space-y-0.5 border-t border-slate-200 pt-0.5">
                          <div className="flex justify-between text-emerald-700 font-semibold">
                            <span>இன்றைய பில் ({formatINR(currentBillTotal)}):</span>
                            <span>செலுத்தப்பட்டது ✓</span>
                          </div>
                          <div className="flex justify-between text-blue-700 font-bold">
                            <span>பழைய கடனில் கழித்தது:</span>
                            <span className="font-mono">- {formatINR(creditDeduction)}</span>
                          </div>
                          <div className="flex justify-between font-bold text-slate-900">
                            <span>மீதமுள்ள பழைய கடன்:</span>
                            <span className="font-mono text-rose-600">{formatINR(remainingOldCredit)}</span>
                          </div>
                          {changeToReturn > 0 && (
                            <div className="flex justify-between text-amber-900 bg-amber-100/70 p-1 rounded font-bold">
                              <span>கூடுதல் சில்லறை / அட்வான்ஸ்:</span>
                              <span className="font-mono">{formatINR(changeToReturn)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : oldCreditBalance < 0 ? (
                    <>
                      <div className="flex justify-between text-blue-800 font-semibold">
                        <span>முன் அட்வான்ஸ் / வரவு இருப்பு:</span>
                        <span className="font-mono font-bold">{formatINR(Math.abs(oldCreditBalance))}</span>
                      </div>
                      {currentBillDue > 0 && (
                        <div className="flex justify-between text-slate-700 font-bold border-t border-slate-200 pt-0.5">
                          <span>அட்வான்ஸில் கழிக்கப்பட்ட பின் மீதம்:</span>
                          <span className="font-mono">{formatINR(Math.abs(newPartyBalance))}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    currentBillDue > 0 && (
                      <div className="flex justify-between text-rose-700 font-bold">
                        <span>கடன் பாக்கி:</span>
                        <span className="font-mono">{formatINR(currentBillDue)}</span>
                      </div>
                    )
                  )}
                </div>
              )}

              {/* Walk-in Customer Extra Paid */}
              {!cart.partyId && excessPaidOverBill > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded p-1.5 text-[11px] flex justify-between items-center font-bold mt-0.5">
                  <span>சில்லறை கொடுக்க வேண்டியது (Change):</span>
                  <span className="font-mono text-emerald-700 text-xs">₹{excessPaidOverBill.toFixed(2)}</span>
                </div>
              )}

              <input
                className="w-full h-6 px-2 text-xs rounded border border-gray-300 text-gray-700 placeholder-gray-400"
                placeholder={t('billing.notes') + ' (optional)...'}
                value={cart.notes}
                onChange={(e) => setCart({ ...cart, notes: e.target.value })}
              />

              {/* Action Buttons */}
              <div className="flex gap-1.5 pt-1">
                <button
                  type="button"
                  className="btn-secondary h-7 py-0.5 px-2 text-xs font-bold rounded flex-1"
                  onClick={handleHold}
                  disabled={saving || cart.lines.length === 0}
                >
                  {t('billing.hold_bill')} (F2)
                </button>
                <button
                  type="button"
                  className="btn-secondary h-7 py-0.5 px-2 text-xs font-bold rounded flex-1"
                  onClick={() => handleSave(true)}
                  disabled={saving || !canSave || cart.lines.length === 0}
                >
                  {t('billing.save')}
                </button>
                <button
                  type="button"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 py-0.5 px-3 text-xs font-black rounded shadow-xs flex-1 flex items-center justify-center gap-1 transition-all"
                  onClick={() => handleSave(true)}
                  disabled={saving || !canSave || cart.lines.length === 0}
                >
                  <span>✓</span>
                  <span>{t('billing.save_print')} (F9)</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4. Bottom Compact Summary Strip */}
          <div className="bg-slate-900 text-white rounded-md px-4 py-1 flex items-center justify-between text-xs font-medium">
            <div className="space-x-4">
              <span>Total Item Sales: <strong className="text-white font-mono">{formatINR(itemsTotal)}</strong></span>
              {isCommission && (
                <span>Total Deductions: <strong className="text-amber-300 font-mono">{formatINR(totalDeductions)}</strong></span>
              )}
            </div>
            <div>
              <span>Final Total: <strong className="text-emerald-400 font-mono text-sm font-black ml-1.5">{formatINR(currentBillTotal)}</strong></span>
            </div>
          </div>

          {/* Held Bills Modal */}
          {heldOpen && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 no-print p-4">
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-full max-w-lg p-4 space-y-3">
                <div className="flex justify-between items-center border-b pb-2">
                  <h2 className="font-bold text-sm text-slate-800">{t('billing.held_bills')}</h2>
                  <button className="btn-secondary py-0.5 px-2 text-xs" onClick={() => setHeldOpen(false)}>
                    {t('common.close')}
                  </button>
                </div>
                {heldBills.length === 0 && <p className="text-gray-400 text-xs italic py-2">— No held bills found —</p>}
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {heldBills.map((row) => (
                    <div key={row.id} className="flex items-center justify-between border-b pb-2 text-xs">
                      <div>
                        <div className="font-bold text-slate-900">{row.label || t('common.walkin')}</div>
                        <div className="text-[11px] text-gray-500">{row.cart?.lines?.length || 0} items</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button className="btn-secondary py-0.5 px-2 text-xs font-semibold" onClick={() => resumeHeld(row)}>
                          {t('billing.resume')}
                        </button>
                        <button
                          className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors inline-flex items-center justify-center"
                          onClick={() => removeHeld(row.id)}
                          title={t('common.delete')}
                          type="button"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, value, bold, tone }) {
  const toneClass = tone === 'red' ? 'text-red-500' : tone === 'green' ? 'text-emerald-400' : '';
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className={bold ? 'font-bold text-gray-800' : 'text-gray-600'}>{label}</span>
      <span className={(bold ? 'font-bold text-xs ' : 'font-medium text-xs ') + toneClass}>{value}</span>
    </div>
  );
}

function NumberRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <label className="text-gray-600 text-xs mb-0">{label}</label>
      <input
        className="w-24 h-6 px-1.5 text-xs text-right font-mono rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-600"
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
