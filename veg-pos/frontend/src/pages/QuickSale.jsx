import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listItems } from '../api/items';
import { listPaymentMethods } from '../api/payments';
import { createBill } from '../api/bills';
import { formatINR, todayISO } from '../utils/format';

export default function QuickSale({ embedded = false }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [methods, setMethods] = useState([]);
  const [cashMethodId, setCashMethodId] = useState('');
  const [lines, setLines] = useState([]);
  const [code, setCode] = useState('');
  const [weight, setWeight] = useState('');
  const [rate, setRate] = useState('');
  const [step, setStep] = useState('code');
  const [matchedItem, setMatchedItem] = useState(null);
  const [saving, setSaving] = useState(false);

  const codeRef = useRef(null);
  const weightRef = useRef(null);
  const rateRef = useRef(null);

  useEffect(() => {
    listItems({ active_only: '1' }).then(setItems);
    listPaymentMethods().then((m) => {
      setMethods(m);
      const cash = m.find((x) => x.name_en === 'Cash') || m[0];
      if (cash) setCashMethodId(cash.id);
    });
    codeRef.current?.focus();
  }, []);

  function handleCodeEnter() {
    const raw = code.trim().toLowerCase();
    const clean = raw.replace(/[^a-z0-9]/g, '');
    const match = items.find((i) => {
      if (i.is_charge_item) return false;
      const icode = (i.code || '').toLowerCase();
      return icode === raw || icode.replace(/[^a-z0-9]/g, '') === clean;
    });
    if (!match) return;
    setMatchedItem(match);
    setRate(match.default_rate || '');
    setStep('weight');
    setTimeout(() => weightRef.current?.focus(), 0);
  }

  function addLine() {
    if (!matchedItem || !weight || !rate) return;
    setLines((ls) => {
      const existingIdx = ls.findIndex((l) => l.item_id === matchedItem.id);
      if (existingIdx >= 0) {
        const updated = [...ls];
        const existing = updated[existingIdx];
        const newWeight = Math.round(((Number(existing.weight) || 0) + Number(weight)) * 1000) / 1000;
        const lineRate = Number(rate) || existing.rate;
        updated[existingIdx] = {
          ...existing,
          weight: newWeight,
          rate: lineRate,
          amount: Math.round(newWeight * lineRate * 100) / 100,
        };
        return updated;
      }
      return [
        ...ls,
        {
          key: Date.now(),
          item_id: matchedItem.id,
          item_name_ta: matchedItem.name_ta,
          item_name_en: matchedItem.name_en,
          weight: Number(weight),
          rate: Number(rate),
          amount: Math.round(Number(weight) * Number(rate) * 100) / 100,
        },
      ];
    });
    setCode('');
    setWeight('');
    setRate('');
    setMatchedItem(null);
    setStep('code');
    setTimeout(() => codeRef.current?.focus(), 0);
  }

  function removeLine(key) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }

  const total = lines.reduce((s, l) => s + l.amount, 0);

  async function handlePay() {
    if (lines.length === 0) return;
    setSaving(true);
    try {
      const bill = await createBill({
        location_type: 'local',
        bill_type: 'quick',
        party_id: null,
        bill_date: todayISO(),
        lines: lines.map((l) => ({
          item_id: l.item_id,
          item_name_ta: l.item_name_ta,
          item_name_en: l.item_name_en,
          is_charge_item: false,
          rate: l.rate,
          nos: 0,
          weight: l.weight,
        })),
        discount_amount: 0,
        paid_amount: total,
        payment_method_id: cashMethodId,
      });
      setLines([]);
      navigate(`/print/bill/${bill.id}?format=thermal80`);
    } catch (err) {
      alert(err?.response?.data?.error || 'Failed');
    } finally {
      setSaving(false);
    }
  }

  const liveAmount = weight && rate ? Number(weight) * Number(rate) : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {!embedded && <h1 className="text-xl font-bold">{t('quick_sale.title')}</h1>}

      <div className="card space-y-3">
        <div className="flex gap-2">
          <input
            ref={codeRef}
            className="input font-mono uppercase text-lg"
            placeholder={t('quick_sale.code_hint')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCodeEnter()}
          />
        </div>
        {matchedItem && (
          <div className="flex items-center gap-3">
            <span className="font-medium">{matchedItem.name_ta}</span>
            <input
              ref={weightRef}
              className="input w-28"
              type="text"
              inputMode="decimal"
              placeholder="kg"
              value={weight}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) setWeight(val);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
                if (e.key === 'Enter') rateRef.current?.focus();
              }}
            />
            <span>×</span>
            <input
              ref={rateRef}
              className="input w-28"
              type="text"
              inputMode="decimal"
              placeholder="₹"
              value={rate}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) setRate(val);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
                if (e.key === 'Enter') addLine();
              }}
            />
            <span>= {formatINR(liveAmount)}</span>
          </div>
        )}
      </div>

      <div className="card">
        <table className="data-table">
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}>
                <td>{l.item_name_ta}</td>
                <td>
                  {l.weight} kg × {formatINR(l.rate)}
                </td>
                <td className="font-semibold">{formatINR(l.amount)}</td>
                <td>
                  <button className="text-red-600" onClick={() => removeLine(l.key)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td className="text-gray-400 py-4 text-center">—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card flex items-center justify-between">
        <span className="text-lg font-semibold">{t('quick_sale.cart_total')}</span>
        <span className="text-3xl font-bold text-brand-700">{formatINR(total)}</span>
      </div>

      <button className="btn-primary w-full text-lg py-3" onClick={handlePay} disabled={saving || lines.length === 0}>
        {t('quick_sale.pay_cash')}
      </button>
    </div>
  );
}
