import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  dailySalesReport,
  billWiseProfitReport,
  itemWiseSalesReport,
  topItemsReport,
  partyOutstandingReport,
  commissionReport,
  paymentCollectionReport,
  purchaseReport,
  profitReport,
} from '../api/reports';
import { getUnpaidDocuments } from '../api/parties';
import { formatINR, formatDateDMY, todayISO } from '../utils/format';

const REPORTS = [
  'daily_sales',
  'bill_wise_profit',
  'item_wise',
  'party_outstanding',
  'commission_report',
  'payment_collection',
  'purchase_report',
  'profit',
];

function presetRange(preset) {
  const today = new Date();
  const toISO = (d) => d.toISOString().slice(0, 10);
  if (preset === 'today') return { from: toISO(today), to: toISO(today) };
  if (preset === 'yesterday') {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return { from: toISO(y), to: toISO(y) };
  }
  if (preset === 'this_week') {
    const start = new Date(today);
    start.setDate(start.getDate() - start.getDay());
    return { from: toISO(start), to: toISO(today) };
  }
  if (preset === 'this_month') {
    return { from: toISO(new Date(today.getFullYear(), today.getMonth(), 1)), to: toISO(today) };
  }
  if (preset === 'last_month') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: toISO(start), to: toISO(end) };
  }
  return { from: toISO(new Date(today.getFullYear(), today.getMonth(), 1)), to: toISO(today) };
}

export default function Reports() {
  const { t } = useTranslation();
  const [report, setReport] = useState('daily_sales');
  const [range, setRange] = useState(presetRange('this_month'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPartyDocs, setSelectedPartyDocs] = useState(null);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const fetchers = {
    daily_sales: dailySalesReport,
    bill_wise_profit: billWiseProfitReport,
    item_wise: itemWiseSalesReport,
    top_items: topItemsReport,
    party_outstanding: partyOutstandingReport,
    commission_report: commissionReport,
    payment_collection: paymentCollectionReport,
    purchase_report: purchaseReport,
    profit: profitReport,
  };

  useEffect(() => {
    run();
  }, [report, range.from, range.to]);

  async function run() {
    setLoading(true);
    try {
      const res = await fetchers[report](range);
      setData(res);
    } catch (e) {
      console.error('Report fetch error:', e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function checkCustomerBills(party) {
    setLoadingDocs(true);
    try {
      const docs = await getUnpaidDocuments(party.id);
      setSelectedPartyDocs({ party, docs: docs || [] });
    } catch (e) {
      alert('Failed to load customer bills');
    } finally {
      setLoadingDocs(false);
    }
  }

  return (
    <div className="space-y-4 w-full pb-10">
      {/* Title & Print */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">{t('nav.reports')}</h1>
          <p className="text-xs text-gray-500">விற்பனை, லாபம், கடன் பாக்கி & கொள்முதல் அறிக்கைகள் (Reports & Analytics)</p>
        </div>
        {data && (
          <button className="btn-secondary flex items-center gap-1.5 text-xs font-bold" onClick={() => window.print()}>
            <span>🖨️</span>
            <span>அச்சு / Print Report</span>
          </button>
        )}
      </div>

      {/* Report Selection Tabs & Range Filter */}
      <div className="card space-y-3 no-print shadow-sm border border-gray-200">
        {/* Report Types */}
        <div className="flex flex-wrap gap-1.5 border-b border-gray-100 pb-2.5">
          {REPORTS.map((r) => {
            const active = report === r;
            return (
              <button
                key={r}
                type="button"
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => {
                  setReport(r);
                  setData(null);
                }}
              >
                {t(`reports.${r}`)}
              </button>
            );
          })}
        </div>

        {/* Date Presets & Custom Pickers */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-bold text-gray-600">தேதி வரம்பு:</span>
          {['today', 'yesterday', 'this_week', 'this_month', 'last_month'].map((p) => (
            <button
              key={p}
              type="button"
              className="btn-secondary text-[11px] py-1 px-2.5 font-bold"
              onClick={() => setRange(presetRange(p))}
            >
              {t(`reports.${p}`)}
            </button>
          ))}
          <div className="flex items-center gap-1.5 ml-auto">
            <input
              type="date"
              className="input text-xs py-1 px-2 w-32 font-medium"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
            <span className="text-gray-400 text-xs font-bold">முதல்</span>
            <input
              type="date"
              className="input text-xs py-1 px-2 w-32 font-medium"
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
            <button className="btn-primary text-xs py-1 px-3.5 font-bold" onClick={run} disabled={loading}>
              {loading ? '...' : t('common.search')}
            </button>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="p-12 text-center text-gray-500 font-bold bg-white rounded-xl border border-gray-200">
          <div className="animate-spin inline-block text-2xl mb-2">⏳</div>
          <div>அறிக்கை ஏற்றப்படுகிறது (Loading report data)...</div>
        </div>
      )}

      {/* Report Data Display */}
      {!loading && data && (
        <ReportView
          report={report}
          data={data}
          range={range}
          t={t}
          onCheckCustomerBills={checkCustomerBills}
        />
      )}

      {/* Customer Unpaid Bills Modal / Drawer */}
      {selectedPartyDocs && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-black text-gray-900">
                  {selectedPartyDocs.party.name} — நிலுவை பில்கள் (Pending Bills)
                </h3>
                <div className="text-xs text-gray-500">
                  Phone: {selectedPartyDocs.party.phone || '—'} • Place: {selectedPartyDocs.party.place || '—'}
                </div>
              </div>
              <button
                className="text-gray-400 hover:text-gray-700 text-xl font-bold p-1"
                onClick={() => setSelectedPartyDocs(null)}
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex justify-between items-center text-sm font-bold">
              <span className="text-rose-800">மொத்த கடன் பாக்கி (Outstanding Due):</span>
              <span className="text-xl font-black text-rose-700 font-mono">
                {formatINR(selectedPartyDocs.party.balance)}
              </span>
            </div>

            {selectedPartyDocs.docs.length === 0 ? (
              <div className="p-8 text-center text-gray-400 font-medium">
                நிலுவை பில்கள் எதுவும் இல்லை (No pending unpaid bills)
              </div>
            ) : (
              <table className="w-full text-left text-xs border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-100 font-bold text-gray-700">
                  <tr>
                    <th className="p-2">வகை</th>
                    <th className="p-2">பில் எண்</th>
                    <th className="p-2">தேதி</th>
                    <th className="p-2 text-right">பில் தொகை</th>
                    <th className="p-2 text-right">செலுத்தியது</th>
                    <th className="p-2 text-right text-rose-700">நிலுவை பாக்கி</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium font-mono">
                  {selectedPartyDocs.docs.map((d, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-2 font-sans font-bold text-gray-600">{d.doc_type === 'bill' ? 'விற்பனை' : 'வாங்கல்'}</td>
                      <td className="p-2 font-bold text-brand-700">{d.doc_no}</td>
                      <td className="p-2 text-gray-600">{formatDateDMY(d.doc_date)}</td>
                      <td className="p-2 text-right">{formatINR(d.total)}</td>
                      <td className="p-2 text-right text-emerald-600">{formatINR(d.paid_amount)}</td>
                      <td className="p-2 text-right font-black text-rose-600">{formatINR(d.balance_due)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="flex justify-end pt-2">
              <button className="btn-secondary" onClick={() => setSelectedPartyDocs(null)}>
                மூடு (Close)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportView({ report, data, range, t, onCheckCustomerBills }) {
  const title = `${t(`reports.${report}`)} (${formatDateDMY(range.from)} - ${formatDateDMY(range.to)})`;

  // ==============================================================
  // 1. BILL-WISE PROFIT REPORT
  // ==============================================================
  if (report === 'bill_wise_profit') {
    const summary = data.summary || {};
    const rows = data.rows || [];

    return (
      <div className="space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-3 border-l-4 border-l-blue-600 shadow-xs">
            <div className="text-xs font-bold text-gray-500">மொத்த பில்கள் (Bills)</div>
            <div className="text-2xl font-black text-gray-900 mt-1">{summary.bill_count || 0}</div>
          </div>
          <div className="card p-3 border-l-4 border-l-indigo-600 shadow-xs">
            <div className="text-xs font-bold text-gray-500">மொத்த விற்பனை (Sales)</div>
            <div className="text-2xl font-black text-indigo-700 mt-1 font-mono">{formatINR(summary.total_sales)}</div>
          </div>
          <div className="card p-3 border-l-4 border-l-emerald-600 shadow-xs">
            <div className="text-xs font-bold text-gray-500">மொத்த லாபம் (Net Profit)</div>
            <div className="text-2xl font-black text-emerald-700 mt-1 font-mono">{formatINR(summary.total_profit)}</div>
          </div>
          <div className="card p-3 border-l-4 border-l-amber-600 shadow-xs">
            <div className="text-xs font-bold text-gray-500">சராசரி லாப % (Avg Margin)</div>
            <div className="text-2xl font-black text-amber-700 mt-1 font-mono">{summary.average_profit_pct || 0}%</div>
          </div>
        </div>

        {/* Detailed Bill Rows Table */}
        <div className="card shadow-sm border border-gray-200 overflow-x-auto">
          <h2 className="font-bold text-base text-gray-800 mb-3">{title}</h2>
          <table className="data-table w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-100 font-bold text-slate-700">
                <th>பில் எண்</th>
                <th>தேதி</th>
                <th>வாடிக்கையாளர் / நபர்</th>
                <th>வகை</th>
                <th className="text-right">விற்பனை தொகை</th>
                <th className="text-right">அடக்க விலை / கழிவு</th>
                <th className="text-right text-emerald-700">லாபம் (Profit)</th>
                <th className="text-center">லாப %</th>
                <th className="text-right">செலுத்தியது</th>
                <th className="text-right text-rose-600">பாக்கி</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-gray-400 italic">
                    இந்தத் தேதி வரம்பில் பில்கள் எதுவும் இல்லை
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const isComm = r.bill_type === 'commission';
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="font-mono font-bold text-brand-700">{r.bill_no}</td>
                      <td>{formatDateDMY(r.bill_date)}</td>
                      <td className="font-bold text-gray-900">{r.party_name}</td>
                      <td>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isComm ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {isComm ? 'கமிஷன்' : 'சாதாரண'}
                        </span>
                      </td>
                      <td className="text-right font-mono font-bold">{formatINR(r.net_sales)}</td>
                      <td className="text-right font-mono text-gray-600">{formatINR(r.estimated_cost)}</td>
                      <td className="text-right font-mono font-black text-emerald-700 text-sm">{formatINR(r.profit)}</td>
                      <td className="text-center font-mono font-bold text-slate-700">{r.margin_pct}%</td>
                      <td className="text-right font-mono text-emerald-600">{formatINR(r.paid_amount)}</td>
                      <td className="text-right font-mono font-bold">
                        <span className={Number(r.balance_due) > 0 ? 'text-rose-600' : 'text-gray-400'}>
                          {formatINR(r.balance_due)}
                        </span>
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

  // ==============================================================
  // 2. DAILY SALES REPORT
  // ==============================================================
  if (report === 'daily_sales') {
    const rows = data.rows || [];
    return (
      <div className="card shadow-sm border border-gray-200 overflow-x-auto space-y-3">
        <h2 className="font-bold text-base text-gray-800">{title}</h2>
        <table className="data-table w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-100 font-bold text-slate-700">
              <th>{t('common.date')}</th>
              <th className="text-center">பில்கள்</th>
              <th className="text-right">விற்பனை</th>
              <th className="text-right">தள்ளுபடி</th>
              <th className="text-right text-emerald-700">ரொக்கம் (Cash)</th>
              <th className="text-right">UPI</th>
              <th className="text-right">வங்கி</th>
              <th className="text-right text-rose-600">கடன் விற்பனை</th>
              <th className="text-right">பாக்கி தொகை</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-mono font-medium">
            {rows.map((r) => (
              <tr key={r.bill_date} className="hover:bg-slate-50">
                <td className="font-sans font-bold">{formatDateDMY(r.bill_date)}</td>
                <td className="text-center font-bold text-gray-800">{r.bill_count}</td>
                <td className="text-right font-bold text-gray-900">{formatINR(r.total_sales)}</td>
                <td className="text-right text-gray-500">{formatINR(r.total_discount)}</td>
                <td className="text-right text-emerald-700 font-bold">{formatINR(r.cash)}</td>
                <td className="text-right">{formatINR(r.upi)}</td>
                <td className="text-right">{formatINR(r.net_banking)}</td>
                <td className="text-right text-rose-600 font-bold">{formatINR(r.credit)}</td>
                <td className="text-right text-rose-700 font-bold">{formatINR(r.total_balance_due)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm font-bold text-amber-900 flex justify-between items-center">
          <span>மண்டி கமிஷன் வருமானம் (Commission Earned):</span>
          <span className="text-lg font-mono font-black">{formatINR(data.commission_earned)}</span>
        </div>
      </div>
    );
  }

  // ==============================================================
  // 3. PRODUCT-WISE SALES REPORT
  // ==============================================================
  if (report === 'item_wise' || report === 'top_items') {
    const list = Array.isArray(data) ? data : [];
    const totalAmountSum = list.reduce((s, it) => s + (Number(it.total_amount) || 0), 0);
    const totalWeightSum = list.reduce((s, it) => s + (Number(it.total_weight) || 0), 0);

    return (
      <div className="space-y-4">
        {/* Summary Card */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card p-3 border-l-4 border-l-emerald-600 shadow-xs">
            <div className="text-xs font-bold text-gray-500">மொத்த பொருட்கள் எண்ணிக்கை</div>
            <div className="text-2xl font-black text-gray-900 mt-1">{list.length} வகைகள்</div>
          </div>
          <div className="card p-3 border-l-4 border-l-blue-600 shadow-xs">
            <div className="text-xs font-bold text-gray-500">மொத்த விற்பனை எடை</div>
            <div className="text-2xl font-black text-blue-700 mt-1 font-mono">{totalWeightSum.toFixed(1)} கிலோ</div>
          </div>
          <div className="card p-3 border-l-4 border-l-indigo-600 shadow-xs">
            <div className="text-xs font-bold text-gray-500">மொத்த விற்பனை வருவாய்</div>
            <div className="text-2xl font-black text-indigo-700 mt-1 font-mono">{formatINR(totalAmountSum)}</div>
          </div>
        </div>

        <div className="card shadow-sm border border-gray-200 overflow-x-auto">
          <h2 className="font-bold text-base text-gray-800 mb-3">{title}</h2>
          <table className="data-table w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-100 font-bold text-slate-700">
                <th>#</th>
                <th>பொருள் (Vegetable)</th>
                <th className="text-right">விற்ற எடை (கிலோ)</th>
                <th className="text-right">விற்பனை தொகை (₹)</th>
                <th className="text-center">பில்கள்</th>
                <th className="text-right">சராசரி விலை (₹/கிலோ)</th>
                <th className="text-right">பங்கு %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {list.map((r, idx) => {
                const amt = Number(r.total_amount) || 0;
                const pct = totalAmountSum > 0 ? ((amt / totalAmountSum) * 100).toFixed(1) : 0;
                return (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="text-gray-400 font-mono text-xs">{idx + 1}</td>
                    <td className="font-bold text-gray-900">
                      <span>{r.item_name_ta}</span>
                      {r.item_name_en && <span className="text-gray-500 text-xs ml-1.5 font-normal">({r.item_name_en})</span>}
                    </td>
                    <td className="text-right font-mono font-bold">{Number(r.total_weight || 0).toFixed(1)}</td>
                    <td className="text-right font-mono font-black text-gray-900 text-sm">{formatINR(amt)}</td>
                    <td className="text-center font-mono font-bold text-gray-700">{r.bill_count || '—'}</td>
                    <td className="text-right font-mono font-bold text-emerald-700">{formatINR(r.average_rate || 0)}</td>
                    <td className="text-right font-mono font-bold text-slate-700">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ==============================================================
  // 4. CUSTOMER CREDIT & OUTSTANDING REPORT
  // ==============================================================
  if (report === 'party_outstanding') {
    const list = Array.isArray(data) ? data : [];
    const totalReceivable = list
      .filter((r) => Number(r.balance) > 0)
      .reduce((s, r) => s + Number(r.balance), 0);
    const totalPayable = list
      .filter((r) => Number(r.balance) < 0)
      .reduce((s, r) => s + Math.abs(Number(r.balance)), 0);

    return (
      <div className="space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="card p-4 border-l-4 border-l-rose-600 shadow-xs bg-rose-50/20">
            <div className="text-xs font-bold text-gray-500">வாடிக்கையாளர் தர வேண்டிய மொத்த கடன் பாக்கி (Receivable)</div>
            <div className="text-2xl font-black text-rose-700 mt-1 font-mono">{formatINR(totalReceivable)}</div>
          </div>
          <div className="card p-4 border-l-4 border-l-amber-600 shadow-xs bg-amber-50/20">
            <div className="text-xs font-bold text-gray-500">விவசாயிகளுக்கு செலுத்த வேண்டிய பாக்கி (Payable)</div>
            <div className="text-2xl font-black text-amber-700 mt-1 font-mono">{formatINR(totalPayable)}</div>
          </div>
        </div>

        <div className="card shadow-sm border border-gray-200 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base text-gray-800">{title}</h2>
            <span className="text-xs text-gray-500 font-bold">* பில்களைக் காண வாடிக்கையாளரை சொடுக்கவும் (Click to check bills)</span>
          </div>

          <table className="data-table w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-100 font-bold text-slate-700">
                <th>நபரின் பெயர்</th>
                <th>அலைபேசி</th>
                <th>வகை</th>
                <th className="text-right">கடன் / பாக்கி (Balance)</th>
                <th className="text-right">0-7 நாட்கள்</th>
                <th className="text-right">8-30 நாட்கள்</th>
                <th className="text-right">30+ நாட்கள்</th>
                <th className="text-center">செயல்</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {list.map((r) => {
                const bal = Number(r.balance || 0);
                const isCustomerDue = bal > 0;
                return (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="font-bold text-gray-900">{r.name}</td>
                    <td className="font-mono">{r.phone || '—'}</td>
                    <td>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700 uppercase">
                        {r.type}
                      </span>
                    </td>
                    <td className="text-right font-mono font-black text-sm">
                      <span className={isCustomerDue ? 'text-rose-600' : 'text-emerald-600'}>
                        {formatINR(bal)} {isCustomerDue ? '(Due)' : '(Adv)'}
                      </span>
                    </td>
                    <td className="text-right font-mono text-gray-600">{formatINR(r.recent_7d)}</td>
                    <td className="text-right font-mono text-amber-700">{formatINR(r.aging_8_30)}</td>
                    <td className="text-right font-mono text-rose-700 font-bold">{formatINR(r.aging_30_plus)}</td>
                    <td className="text-center">
                      <button
                        type="button"
                        className="bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 px-2.5 py-1 rounded text-xs font-bold transition-all shadow-2xs"
                        onClick={() => onCheckCustomerBills && onCheckCustomerBills(r)}
                      >
                        பில்கள் பார் (View Bills)
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ==============================================================
  // 5. COMMISSION REPORT
  // ==============================================================
  if (report === 'commission_report') {
    return (
      <div className="card space-y-4 shadow-sm border border-gray-200">
        <h2 className="font-bold text-base text-gray-800">{title}</h2>
        <div className="overflow-x-auto">
          <h3 className="font-bold text-xs text-gray-600 mb-2 uppercase">நாள் வாரியாக கமிஷன் (By Day)</h3>
          <table className="data-table w-full text-left text-xs mb-4">
            <thead>
              <tr className="bg-slate-100 font-bold text-slate-700">
                <th>{t('common.date')}</th>
                <th className="text-right">மொத்த விற்பனை (Gross)</th>
                <th className="text-right text-emerald-700">கமிஷன் வருமானம்</th>
                <th className="text-center">பில்கள்</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-mono font-medium">
              {(data.by_day || []).map((r) => (
                <tr key={r.bill_date} className="hover:bg-slate-50">
                  <td className="font-sans font-bold">{formatDateDMY(r.bill_date)}</td>
                  <td className="text-right font-bold text-gray-900">{formatINR(r.gross_total)}</td>
                  <td className="text-right font-black text-emerald-700">{formatINR(r.commission_earned)}</td>
                  <td className="text-center font-bold">{r.bill_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto">
          <h3 className="font-bold text-xs text-gray-600 mb-2 uppercase">விவசாயி வாரியாக கமிஷன் (By Supplier)</h3>
          <table className="data-table w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-100 font-bold text-slate-700">
                <th>விவசாயி / Supplier</th>
                <th className="text-right">விற்பனை தொகை</th>
                <th className="text-right text-emerald-700">கமிஷன்</th>
                <th className="text-center">பில்கள்</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {(data.by_supplier || []).map((r) => (
                <tr key={r.party_id} className="hover:bg-slate-50">
                  <td className="font-bold text-gray-900">{r.name}</td>
                  <td className="text-right font-mono font-bold">{formatINR(r.gross_total)}</td>
                  <td className="text-right font-mono font-black text-emerald-700">{formatINR(r.commission_earned)}</td>
                  <td className="text-center font-mono font-bold">{r.bill_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ==============================================================
  // 6. PAYMENT COLLECTION REPORT
  // ==============================================================
  if (report === 'payment_collection') {
    const list = Array.isArray(data) ? data : [];
    return (
      <div className="card shadow-sm border border-gray-200 overflow-x-auto space-y-3">
        <h2 className="font-bold text-base text-gray-800">{title}</h2>
        <table className="data-table w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-100 font-bold text-slate-700">
              <th>{t('common.date')}</th>
              <th>செலுத்தும் முறை</th>
              <th className="text-right">வசூலிக்கப்பட்ட தொகை</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-medium font-mono">
            {list.map((r, idx) => (
              <tr key={idx} className="hover:bg-slate-50">
                <td className="font-sans font-bold">{formatDateDMY(r.payment_date)}</td>
                <td className="font-sans font-bold text-brand-700">{r.method || 'பணம் / Cash'}</td>
                <td className="text-right font-black text-emerald-700 text-sm">{formatINR(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ==============================================================
  // 7. PURCHASE REPORT
  // ==============================================================
  if (report === 'purchase_report') {
    const list = Array.isArray(data) ? data : [];
    return (
      <div className="card shadow-sm border border-gray-200 overflow-x-auto space-y-3">
        <h2 className="font-bold text-base text-gray-800">{title}</h2>
        <table className="data-table w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-100 font-bold text-slate-700">
              <th>{t('common.date')}</th>
              <th className="text-center">கொள்முதல்கள்</th>
              <th className="text-right">மொத்த தொகை</th>
              <th className="text-right text-emerald-700">செலுத்தியது</th>
              <th className="text-right text-rose-600">பாக்கி</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-medium font-mono">
            {list.map((r, idx) => (
              <tr key={idx} className="hover:bg-slate-50">
                <td className="font-sans font-bold">{formatDateDMY(r.purchase_date)}</td>
                <td className="text-center font-bold">{r.purchase_count}</td>
                <td className="text-right font-bold text-gray-900">{formatINR(r.total)}</td>
                <td className="text-right text-emerald-600 font-bold">{formatINR(r.paid)}</td>
                <td className="text-right text-rose-600 font-bold">{formatINR(r.balance_due)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ==============================================================
  // 8. FINANCIAL PROFIT SUMMARY
  // ==============================================================
  if (report === 'profit') {
    return (
      <div className="card space-y-4 shadow-sm border border-gray-200 max-w-xl mx-auto">
        <h2 className="font-bold text-lg text-gray-900 border-b pb-2">{title}</h2>
        <div className="space-y-3 font-semibold text-sm">
          <div className="flex justify-between py-1">
            <span className="text-gray-600">சாதாரண விற்பனை வருவாய் (Sales Total):</span>
            <span className="font-mono font-bold">{formatINR(data.sales_total)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-600">கமிஷன் வருமானம் (Commission Income):</span>
            <span className="font-mono font-bold text-emerald-700">+ {formatINR(data.commission_income)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-t border-gray-200 font-bold">
            <span className="text-gray-900">மொத்த வருமானம் (Total Income):</span>
            <span className="font-mono text-brand-700">{formatINR(data.income_total)}</span>
          </div>
          <div className="flex justify-between py-1 text-rose-600">
            <span>(-) கொள்முதல் செலவு (Purchases Total):</span>
            <span className="font-mono">- {formatINR(data.purchase_total)}</span>
          </div>
          <div className="flex justify-between pt-3 border-t-2 border-slate-900 text-lg font-black bg-emerald-50 p-3 rounded-xl border border-emerald-200">
            <span className="text-emerald-900">நிகர லாபம் (Net Profit):</span>
            <span className="font-mono text-emerald-800">{formatINR(data.profit)}</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
