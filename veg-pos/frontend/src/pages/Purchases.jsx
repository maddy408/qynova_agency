import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listItems } from '../api/items';
import { listParties } from '../api/parties';
import { listPaymentMethods } from '../api/payments';
import { listPurchases, createPurchase, deletePurchase } from '../api/purchases';
import { formatINR, formatDateDMY, todayISO } from '../utils/format';

export default function Purchases() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [parties, setParties] = useState([]);
  const [methods, setMethods] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [partyId, setPartyId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [lines, setLines] = useState([]);
  const [code, setCode] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState('');
  const [methodId, setMethodId] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    listItems({ active_only: '1' }).then(setItems);
    loadParties();
    listPaymentMethods().then((ms) => {
      setMethods(ms);
      if (ms && ms.length > 0) {
        const cashMethod = ms.find((m) => m.name_en?.toLowerCase() === 'cash' || m.name_ta?.includes('பணம்')) || ms[0];
        setMethodId(String(cashMethod.id));
      }
    });
    reload();
  }, []);

  function loadParties() {
    listParties({ type: 'supplier' }).then(setParties);
  }

  function reload() {
    listPurchases().then(setPurchases);
    loadParties();
  }

  // Find currently selected farmer and their credit/balance
  const selectedParty = parties.find((p) => String(p.id) === String(partyId));
  // In ledger: balance < 0 means shop owes farmer (payable); balance > 0 means farmer owes shop (advance)
  const farmerPreviousBalance = Number(selectedParty?.balance || 0);

  // Add item by shortcut code
  function addByCode() {
    if (!code.trim()) return;
    const match = items.find((i) => i.code?.toLowerCase() === code.trim().toLowerCase());
    if (!match) {
      setErrorMsg(`குறியீடு '${code}' கொண்ட பொருள் கிடைக்கவில்லை (Item not found for code '${code}')`);
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }
    addItemToLines(match);
    setCode('');
  }

  // Add item from dropdown selector
  function addFromDropdown() {
    if (!selectedItemId) return;
    const match = items.find((i) => String(i.id) === String(selectedItemId));
    if (!match) return;
    addItemToLines(match);
    setSelectedItemId('');
  }

  // Helper to add item to lines with default weight = 1 (default da edai 1 la start pannu)
  function addItemToLines(item) {
    setErrorMsg('');
    setLines((ls) => {
      const existingIdx = ls.findIndex((l) => l.item_id === item.id);
      if (existingIdx >= 0) {
        // Increment weight by 1 if already present
        const copy = [...ls];
        copy[existingIdx].weight = (Number(copy[existingIdx].weight) || 1) + 1;
        return copy;
      }
      return [
        ...ls,
        {
          key: Date.now() + Math.random(),
          item_id: item.id,
          item_name_ta: item.name_ta,
          item_name_en: item.name_en,
          rate: Number(item.default_rate) || 0,
          weight: 1, // DEFAULT WEIGHT 1 AS REQUESTED
          nos: 1,
        },
      ];
    });
  }

  function updateLine(key, field, value) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  }

  function removeLine(key) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }

  // Calculations
  const itemsTotal = lines.reduce((s, l) => s + (Number(l.rate) || 0) * (Number(l.weight) || 0), 0);
  const discountVal = Number(discount) || 0;
  const currentPurchaseNet = Math.max(0, itemsTotal - discountVal);
  const paidVal = paid === '' ? 0 : Number(paid);
  
  // Real-time Balance / Credit Due calculation
  // Purchase balance due = Net Purchase - Paid
  const purchaseBalanceDue = currentPurchaseNet - paidVal;

  // Auto-fill paid amount when lines total changes if user hasn't typed
  useEffect(() => {
    if (paid === '' && currentPurchaseNet > 0) {
      setPaid(currentPurchaseNet);
    }
  }, [currentPurchaseNet]);

  async function handleSave() {
    setErrorMsg('');
    setSuccessMsg('');

    if (!partyId) {
      setErrorMsg('தயவுசெய்து விவசாயியைத் தேர்ந்தெடுக்கவும் (Please select farmer/supplier)');
      return;
    }
    if (lines.length === 0) {
      setErrorMsg('குறைந்தது ஒரு பொருளையாவது சேர்க்கவும் (Please add at least one item)');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        party_id: Number(partyId),
        purchase_date: date,
        lines: lines.map((l) => ({
          item_id: Number(l.item_id),
          item_name_ta: l.item_name_ta,
          item_name_en: l.item_name_en,
          rate: Number(l.rate) || 0,
          weight: Number(l.weight) || 1, // Ensure at least 1
          nos: Number(l.nos) || 0,
        })),
        discount_amount: discountVal,
        paid_amount: paidVal,
        payment_method_id: methodId ? Number(methodId) : null,
      };

      const res = await createPurchase(payload);
      setSuccessMsg(`✓ கொள்முதல் எண் ${res?.purchase_no || ''} வெற்றிகரமாகச் சேமிக்கப்பட்டது! (Purchase saved successfully)`);
      setLines([]);
      setDiscount(0);
      setPaid('');
      reload();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Purchase save error:', err);
      setErrorMsg(err?.response?.data?.error || 'கொள்முதல் சேமிப்பதில் பிழை ஏற்பட்டது (Failed to save purchase)');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm(t('common.confirm_delete'))) return;
    try {
      await deletePurchase(id);
      reload();
    } catch (err) {
      alert(err?.response?.data?.error || 'Failed to delete');
    }
  }

  return (
    <div className="space-y-5 w-full">
      {/* Title Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">{t('nav.purchases')} (Stock Inward)</h1>
          <p className="text-xs text-gray-500">விவசாயிகளிடமிருந்து கொள்முதல் மற்றும் இருப்பு பதிவு (Supplier procurement)</p>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-lg text-sm font-bold flex items-center gap-2 shadow-xs">
          <span>✓</span>
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 rounded-lg text-sm font-bold flex items-center gap-2 shadow-xs">
          <span>⚠</span>
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Purchase Entry Card */}
      <div className="card space-y-4 shadow-sm border border-gray-200">
        
        {/* Top Controls: Supplier, Date, Item Selector & Shortcut */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-gray-100">
          
          {/* Supplier / Farmer Selection */}
          <div className="space-y-1">
            <label className="label font-bold text-gray-700 flex justify-between items-center">
              <span>{t('purchases.supplier')} *</span>
              {selectedParty && (
                <span className={`text-[11px] font-black px-1.5 py-0.5 rounded ${
                  farmerPreviousBalance < 0 
                    ? 'bg-rose-100 text-rose-700' 
                    : farmerPreviousBalance > 0 
                      ? 'bg-emerald-100 text-emerald-700' 
                      : 'bg-gray-100 text-gray-600'
                }`}>
                  {farmerPreviousBalance < 0
                    ? `கொடுக்க வேண்டியது: ₹${Math.abs(farmerPreviousBalance).toFixed(2)}`
                    : farmerPreviousBalance > 0
                      ? `அட்வான்ஸ்: ₹${farmerPreviousBalance.toFixed(2)}`
                      : 'பாக்கி இல்லை'}
                </span>
              )}
            </label>
            <select
              className="input font-semibold"
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
            >
              <option value="">— விவசாயியைத் தேர்ந்தெடுக்கவும் —</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.place ? `(${p.place})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div className="space-y-1">
            <label className="label font-bold text-gray-700">{t('common.date')}</label>
            <input
              type="date"
              className="input font-medium"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Dropdown Item Picker */}
          <div className="space-y-1">
            <label className="label font-bold text-gray-700">பொருள் தேர்வு (Select Vegetable)</label>
            <div className="flex gap-1.5">
              <select
                className="input flex-1 font-semibold"
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
              >
                <option value="">— பொருளைத் தேர்வு செய் —</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    [{it.code}] {it.name_ta} - {it.name_en} (₹{Number(it.default_rate || 0).toFixed(0)})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-primary px-3 py-1 text-xs shrink-0"
                onClick={addFromDropdown}
                disabled={!selectedItemId}
                title="Add selected item"
              >
                + சேர்
              </button>
            </div>
          </div>

          {/* Item Code Shortcut */}
          <div className="space-y-1">
            <label className="label font-bold text-gray-700">குறியீடு (Shortcut Code)</label>
            <div className="flex gap-1.5">
              <input
                className="input font-mono uppercase font-black"
                placeholder="எ.கா: A, POT, L"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addByCode()}
              />
              <button
                type="button"
                className="btn-secondary px-3 py-1 text-xs shrink-0 font-bold"
                onClick={addByCode}
                disabled={!code.trim()}
              >
                Enter
              </button>
            </div>
          </div>

        </div>

        {/* Line Items Table */}
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-gray-200 font-bold text-xs uppercase">
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">{t('billing.item')}</th>
                <th className="py-2.5 px-3 text-right">விலை (₹/Rate)</th>
                <th className="py-2.5 px-3 text-center">எடை (கிலோ / Weight)</th>
                <th className="py-2.5 px-3 text-center">எண்ணம் (Bags/Nos)</th>
                <th className="py-2.5 px-3 text-right">{t('billing.amount')}</th>
                <th className="py-2.5 px-3 text-center w-12">நீக்கு</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400 font-medium italic">
                    பொருட்கள் எதுவும் சேர்க்கப்படவில்லை. மேலே உள்ள தேர்வில் இருந்து பொருளைச் சேர்க்கவும்.
                  </td>
                </tr>
              ) : (
                lines.map((l, idx) => {
                  const lineTotal = (Number(l.rate) || 0) * (Number(l.weight) || 0);
                  return (
                    <tr key={l.key} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2 px-3 text-xs text-gray-500 font-mono">{idx + 1}</td>
                      <td className="py-2 px-3 font-bold text-gray-900">
                        <span>{l.item_name_ta}</span>
                        {l.item_name_en && (
                          <span className="text-xs text-gray-500 ml-1.5 font-normal">({l.item_name_en})</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          className="input w-24 text-right font-mono font-bold py-1 px-2"
                          type="number"
                          step="0.5"
                          value={l.rate}
                          onChange={(e) => updateLine(l.key, 'rate', e.target.value)}
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          className="input w-24 text-center font-mono font-bold py-1 px-2 border-brand-400 bg-brand-50/30"
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={l.weight}
                          onChange={(e) => updateLine(l.key, 'weight', e.target.value)}
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          className="input w-20 text-center font-mono py-1 px-2"
                          type="number"
                          value={l.nos}
                          onChange={(e) => updateLine(l.key, 'nos', e.target.value)}
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-black text-gray-900 text-base">
                        {formatINR(lineTotal)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1 rounded transition-colors"
                          onClick={() => removeLine(l.key)}
                          title="Remove item"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Totals, Payment & Credit Accounting Box */}
        <div className="bg-slate-50/80 p-4 rounded-xl border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            
            {/* Discount */}
            <div>
              <label className="label font-bold text-gray-700">{t('billing.discount')} (₹)</label>
              <input
                className="input font-mono font-bold"
                type="number"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0"
              />
            </div>

            {/* Paid Amount */}
            <div>
              <label className="label font-bold text-gray-700">{t('billing.paid_amount')} (₹)</label>
              <input
                className="input font-mono font-bold text-emerald-700 bg-emerald-50/30 border-emerald-300"
                type="number"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                placeholder="0.00"
              />
            </div>

            {/* Payment Method */}
            <div>
              <label className="label font-bold text-gray-700">{t('common.method')}</label>
              <select
                className="input font-bold"
                value={methodId}
                onChange={(e) => setMethodId(e.target.value)}
              >
                {methods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name_ta} ({m.name_en})
                  </option>
                ))}
              </select>
            </div>

            {/* Live Balance Summary */}
            <div className="bg-white p-3 rounded-lg border border-gray-200 text-right space-y-1 shadow-2xs">
              <div className="text-xs text-gray-500 font-bold flex justify-between">
                <span>கொள்முதல் மொத்தம்:</span>
                <span className="font-mono">{formatINR(currentPurchaseNet)}</span>
              </div>
              <div className="text-xs text-gray-500 font-bold flex justify-between">
                <span>செலுத்திய தொகை:</span>
                <span className="font-mono text-emerald-600">₹{paidVal.toFixed(2)}</span>
              </div>
              <div className="border-t border-gray-200 pt-1 flex justify-between items-center text-sm font-black">
                <span className={purchaseBalanceDue > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                  {purchaseBalanceDue > 0 ? 'மீதி கொடுக்க வேண்டியது:' : purchaseBalanceDue < 0 ? 'அதிகப்படியான முன்பணம்:' : 'பாக்கி:'}
                </span>
                <span className={`font-mono text-base ${purchaseBalanceDue > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {purchaseBalanceDue > 0
                    ? `₹${purchaseBalanceDue.toFixed(2)}`
                    : purchaseBalanceDue < 0
                      ? `₹${Math.abs(purchaseBalanceDue).toFixed(2)} (Advance)`
                      : '₹0.00'}
                </span>
              </div>
            </div>

          </div>

          {/* Action Button */}
          <div className="mt-4 flex items-center justify-between pt-2 border-t border-gray-200">
            <div className="text-xs text-gray-500 font-medium">
              * கொள்முதல் சேமிக்கும்போது விவசாயியின் கணக்கில் (Ledger) தானாகவே வரவு/பற்று வைக்கப்படும்.
            </div>
            <button
              type="button"
              className="btn-primary px-8 py-2.5 text-base font-black shadow-md flex items-center gap-2"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <span className="animate-spin">⏳</span>
                  <span>சேமிக்கப்படுகிறது...</span>
                </>
              ) : (
                <>
                  <span>💾</span>
                  <span>{t('common.save')} (Save Purchase)</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>

      {/* Purchases History List */}
      <div className="card overflow-x-auto shadow-sm border border-gray-200 space-y-2">
        <div className="flex items-center justify-between px-1 py-1">
          <h2 className="text-lg font-bold text-gray-900">சமீபத்திய கொள்முதல் பட்டியல் (Recent Purchases)</h2>
          <span className="text-xs font-bold text-gray-500">{purchases.length} பதிவுகள் (Records)</span>
        </div>

        <table className="data-table w-full">
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-bold text-xs uppercase">
              <th>{t('purchases.purchase_no')}</th>
              <th>{t('common.date')}</th>
              <th>{t('purchases.supplier')}</th>
              <th className="text-right">{t('common.total')}</th>
              <th className="text-right">{t('billing.paid_amount')}</th>
              <th className="text-right">{t('billing.balance_due')}</th>
              <th className="text-center">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-gray-400 font-medium">
                  கொள்முதல் பதிவுகள் எதுவும் இல்லை
                </td>
              </tr>
            ) : (
              purchases.map((p) => {
                const bal = Number(p.balance_due || 0);
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="font-mono font-bold text-brand-700">{p.purchase_no}</td>
                    <td>{formatDateDMY(p.purchase_date)}</td>
                    <td className="font-bold text-gray-900">{p.party_name}</td>
                    <td className="text-right font-mono font-bold">{formatINR(p.total)}</td>
                    <td className="text-right font-mono text-emerald-600 font-semibold">{formatINR(p.paid_amount)}</td>
                    <td className="text-right font-mono font-bold">
                      <span className={bal > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                        {formatINR(bal)}
                      </span>
                    </td>
                    <td className="text-center py-2 px-3 whitespace-nowrap">
                      <button
                        className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors inline-flex items-center justify-center"
                        onClick={() => handleDelete(p.id)}
                        title={t('common.delete')}
                        type="button"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
