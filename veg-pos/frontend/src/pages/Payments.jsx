import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listParties, getUnpaidDocuments } from '../api/parties';
import { listPaymentMethods, createPayment, listPayments } from '../api/payments';
import { formatINR, formatDateDMY, todayISO } from '../utils/format';
import Pagination from '../components/Pagination';

export default function Payments() {
  const { t } = useTranslation();
  const [parties, setParties] = useState([]);
  const [methods, setMethods] = useState([]);
  const [history, setHistory] = useState([]);
  const [totalHistory, setTotalHistory] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [direction, setDirection] = useState('in');
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [methodId, setMethodId] = useState('');
  const [mode, setMode] = useState('auto');
  const [notes, setNotes] = useState('');
  const [unpaid, setUnpaid] = useState({ bills: [], purchases: [] });
  const [manualAlloc, setManualAlloc] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listParties().then(setParties);
    listPaymentMethods().then(setMethods);
    loadHistory();
  }, []);

  function loadHistory(p = historyPage) {
    listPayments({ direction, page: p, limit: 10 }).then((res) => {
      if (res && res.data) {
        setHistory(res.data);
        setTotalHistory(res.total);
        setHistoryPage(res.page);
      } else if (Array.isArray(res)) {
        setHistory(res);
        setTotalHistory(res.length);
      }
    });
  }

  useEffect(() => {
    setHistoryPage(1);
    loadHistory(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction]);

  useEffect(() => {
    if (!partyId) {
      setUnpaid({ bills: [], purchases: [] });
      return;
    }
    getUnpaidDocuments(partyId).then(setUnpaid);
    setManualAlloc({});
  }, [partyId]);

  const relevantDocs =
    direction === 'in'
      ? unpaid.bills.filter((b) => true)
      : [...unpaid.bills, ...unpaid.purchases];

  function toggleManual(doc, checked) {
    setManualAlloc((m) => {
      const next = { ...m };
      const key = `${doc.doc_type}-${doc.id}`;
      if (checked) {
        next[key] = { ...doc, alloc_amount: doc.balance_due };
      } else {
        delete next[key];
      }
      return next;
    });
  }

  function setManualAmount(key, value) {
    setManualAlloc((m) => ({ ...m, [key]: { ...m[key], alloc_amount: value } }));
  }

  async function handleSave() {
    if (!partyId || !amount) return;
    setSaving(true);
    try {
      const payload = {
        direction,
        party_id: Number(partyId),
        payment_date: date,
        amount: Number(amount),
        payment_method_id: methodId || null,
        allocation_mode: mode,
        notes,
      };
      if (mode === 'manual') {
        payload.allocations = Object.values(manualAlloc).map((d) => ({
          bill_id: d.doc_type === 'bill' ? d.id : null,
          purchase_id: d.doc_type === 'purchase' ? d.id : null,
          amount: Number(d.alloc_amount) || 0,
        }));
      }
      const res = await createPayment(payload);
      alert(`Saved: ${res.receipt_no}`);
      setAmount('');
      setPartyId('');
      setNotes('');
      loadHistory();
    } catch (err) {
      alert(err?.response?.data?.error || 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('nav.payments')}</h1>

      <div className="card space-y-3">
        <div className="flex gap-2">
          <button
            className={direction === 'in' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setDirection('in')}
          >
            {t('payments.direction_in')}
          </button>
          <button
            className={direction === 'out' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setDirection('out')}
          >
            {t('payments.direction_out')}
          </button>
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">{t('common.party')}</label>
            <select className="input" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">—</option>
              {parties
                .filter((p) => (direction === 'in' ? p.type !== 'supplier' : p.type !== 'customer'))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatINR(p.balance)})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="label">{t('common.date')}</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">{t('common.amount')}</label>
            <input type="number" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">{t('common.method')}</label>
            <select className="input" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
              <option value="">—</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name_ta}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Allocation</label>
          <div className="flex gap-2">
            {['auto', 'manual', 'on_account'].map((m) => (
              <button key={m} className={mode === m ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode(m)}>
                {t(`payments.allocation_${m}`)}
              </button>
            ))}
          </div>
        </div>

        {mode === 'manual' && partyId && (
          <div className="border rounded-md p-3">
            <h4 className="font-medium mb-2">{t('payments.unpaid_docs')}</h4>
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Doc</th>
                  <th>{t('common.date')}</th>
                  <th>{t('billing.balance_due')}</th>
                  <th>Allocate</th>
                </tr>
              </thead>
              <tbody>
                {relevantDocs.map((doc) => {
                  const key = `${doc.doc_type}-${doc.id}`;
                  const checked = !!manualAlloc[key];
                  return (
                    <tr key={key}>
                      <td>
                        <input type="checkbox" checked={checked} onChange={(e) => toggleManual(doc, e.target.checked)} />
                      </td>
                      <td>{doc.doc_no}</td>
                      <td>{formatDateDMY(doc.doc_date)}</td>
                      <td>{formatINR(doc.balance_due)}</td>
                      <td>
                        {checked && (
                          <input
                            className="input w-28"
                            type="number"
                            step="0.01"
                            value={manualAlloc[key].alloc_amount}
                            onChange={(e) => setManualAmount(key, e.target.value)}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
                {relevantDocs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-gray-400 py-2">
                      —
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <textarea className="input" placeholder={t('billing.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />

        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {t('common.save')}
        </button>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-sm text-slate-800">{t('payments.receipt')} History</h3>
          <span className="text-xs font-bold text-gray-500">{totalHistory} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('payments.receipt')}</th>
                <th>{t('common.date')}</th>
                <th>{t('common.party')}</th>
                <th>{t('common.amount')}</th>
                <th>{t('common.method')}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="font-mono font-bold text-blue-900">{h.receipt_no}</td>
                  <td>{formatDateDMY(h.payment_date)}</td>
                  <td className="font-semibold">{h.party_name}</td>
                  <td className="font-mono font-bold">{formatINR(h.amount)}</td>
                  <td>{h.payment_method_name}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-400">
                    No payment records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={historyPage}
          total={totalHistory}
          limit={10}
          onPageChange={(p) => {
            setHistoryPage(p);
            loadHistory(p);
          }}
          label={t('payments.receipt')}
        />
      </div>
    </div>
  );
}
