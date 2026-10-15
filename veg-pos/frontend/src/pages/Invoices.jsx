import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { listBills, getBill, updateBill, deleteBill, getBillPrint } from '../api/bills';
import { listItems } from '../api/items';
import { listPaymentMethods } from '../api/payments';
import { useAuth } from '../hooks/useAuth.jsx';
import { formatINR, formatDateDMY, todayISO } from '../utils/format';
import SurandaiInvoice from '../components/SurandaiInvoice';

export default function Invoices() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [filters, setFilters] = useState({ from: '', to: '', bill_no: '', location_type: '', bill_type: '', payment_status: '' });
  const [editing, setEditing] = useState(null);
  const [previewPayload, setPreviewPayload] = useState(null);
  const [items, setItems] = useState([]);
  const [methods, setMethods] = useState([]);
  const canManage = ['admin', 'manager'].includes(user?.role);

  useEffect(() => {
    listItems({ active_only: '1' }).then(setItems);
    listPaymentMethods().then(setMethods);
    load();
  }, []);

  function load() {
    const params = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params[k] = v;
    });
    listBills(params).then(setBills);
  }

  async function openEdit(id) {
    const bill = await getBill(id);
    setEditing({
      ...bill,
      commission_mode: bill.commission_mode || (bill.commission_percent !== null ? 'percentage' : 'fixed'),
      other_deduction_amount: bill.other_deduction_amount || 0,
      lines: bill.lines.map((l) => ({
        ...l,
        key: l.id,
        nos: (l.bag_count !== null && l.bag_count !== undefined) ? l.bag_count : (l.nos === 0 ? '' : l.nos),
      })),
    });
  }

  async function openPreview(id) {
    const payload = await getBillPrint(id);
    setPreviewPayload(payload);
  }

  function updateLine(key, field, value) {
    setEditing((e) => ({ ...e, lines: e.lines.map((l) => (l.key === key ? { ...l, [field]: value } : l)) }));
  }
  function removeLine(key) {
    setEditing((e) => ({ ...e, lines: e.lines.filter((l) => l.key !== key) }));
  }

  function editTotals() {
    if (!editing) return { itemsTotal: 0, commissionAmount: 0, totalDeductions: 0, netTotal: 0, exceeds: false };
    const itemsTotal = editing.lines.reduce((s, l) => {
      const rate = Number(l.rate) || 0;
      return s + (l.is_charge_item ? rate * (Number(l.nos) || 0) : rate * (Number(l.weight) || 0));
    }, 0);
    const isFixed = editing.commission_mode === 'fixed';
    const commissionAmount = isFixed
      ? Number(editing.commission_amount) || 0
      : (itemsTotal * (Number(editing.commission_percent) || 0)) / 100;
    const totalDeductions =
      commissionAmount + (Number(editing.patthu_amount) || 0) + (Number(editing.cooli_amount) || 0) + (Number(editing.vadagai_amount) || 0) + (Number(editing.other_deduction_amount) || 0);
    return {
      itemsTotal,
      commissionAmount,
      totalDeductions,
      netTotal: itemsTotal - totalDeductions,
      exceeds: totalDeductions > itemsTotal + 0.009,
    };
  }

  async function saveEdit() {
    const isCommission = editing.bill_type === 'commission';
    if (isCommission && editTotals().exceeds) {
      alert(t('billing.validation_exceeds'));
      return;
    }
    const payload = {
      party_id: editing.party_id,
      bill_date: editing.bill_date,
      lines: editing.lines.map((l) => ({
        item_id: l.item_id,
        item_name_ta: l.item_name_ta,
        item_name_en: l.item_name_en,
        unit: l.unit || 'kg',
        is_charge_item: !!l.is_charge_item,
        rate: Number(l.rate),
        nos: Number(l.nos) || 0,
        bag_count: l.nos !== '' && l.nos !== null && l.nos !== undefined ? Number(l.nos) : null,
        weight: Number(l.weight),
      })),
      paid_amount: Number(editing.paid_amount) || 0,
      payment_method_id: editing.payment_method_id || null,
    };
    if (isCommission) {
      payload.commission_mode = editing.commission_mode;
      payload.commission_percent = editing.commission_mode === 'fixed' ? null : Number(editing.commission_percent) || 0;
      payload.commission_amount = editing.commission_mode === 'fixed' ? Number(editing.commission_amount) || 0 : undefined;
      payload.patthu_amount = editing.patthu_amount;
      payload.cooli_amount = editing.cooli_amount;
      payload.vadagai_amount = editing.vadagai_amount;
      payload.other_deduction_amount = Number(editing.other_deduction_amount) || 0;
    } else {
      payload.discount_amount = editing.discount_amount;
    }
    await updateBill(editing.id, payload);
    setEditing(null);
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm(t('common.confirm_delete'))) return;
    await deleteBill(id);
    load();
  }

  function statusLabel(b) {
    if (Number(b.balance_due) <= 0.01) return 'Paid';
    if (Number(b.paid_amount) <= 0.01) return 'Unpaid';
    return 'Partial';
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('nav.invoices')}</h1>

      <div className="card grid sm:grid-cols-2 md:grid-cols-6 gap-2">
        <input type="date" className="input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <input type="date" className="input" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        <input className="input" placeholder={t('common.bill_no')} value={filters.bill_no} onChange={(e) => setFilters({ ...filters, bill_no: e.target.value })} />
        <select className="input" value={filters.location_type} onChange={(e) => setFilters({ ...filters, location_type: e.target.value })}>
          <option value="">Local/Distant</option>
          <option value="local">{t('billing.location_local')}</option>
          <option value="distant">{t('billing.location_distant')}</option>
        </select>
        <select className="input" value={filters.bill_type} onChange={(e) => setFilters({ ...filters, bill_type: e.target.value })}>
          <option value="">Normal/Commission</option>
          <option value="normal">{t('billing.type_normal')}</option>
          <option value="commission">{t('billing.type_commission')}</option>
          <option value="quick">Quick</option>
        </select>
        <select className="input" value={filters.payment_status} onChange={(e) => setFilters({ ...filters, payment_status: e.target.value })}>
          <option value="">Status</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="unpaid">Unpaid</option>
        </select>
        <button className="btn-primary col-span-full md:col-span-1" onClick={load}>
          {t('common.search')}
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('common.bill_no')}</th>
              <th>{t('common.date')}</th>
              <th>{t('common.party')}</th>
              <th>Type</th>
              <th>{t('common.total')}</th>
              <th>{t('billing.paid_amount')}</th>
              <th>{t('billing.balance_due')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((b) => (
              <tr key={b.id}>
                <td>{b.bill_no}</td>
                <td>{formatDateDMY(b.bill_date)}</td>
                <td>{b.party_name || t('common.walkin')}</td>
                <td>
                  {b.location_type}/{b.bill_type}
                </td>
                <td>{formatINR(b.grand_total)}</td>
                <td>{formatINR(b.paid_amount)}</td>
                <td>{formatINR(b.balance_due)}</td>
                <td>{statusLabel(b)}</td>
                <td className="py-2 px-3 whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    {/* View Icon */}
                    <button
                      className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors inline-flex items-center justify-center"
                      onClick={() => openPreview(b.id)}
                      title="பார்வை (View)"
                      type="button"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>

                    {/* Print Icon */}
                    <button
                      className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded transition-colors inline-flex items-center justify-center"
                      onClick={() => navigate(`/print/bill/${b.id}`)}
                      title="அச்சிடு (Print)"
                      type="button"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 002-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                    </button>

                    {canManage && (
                      <>
                        {/* Edit Icon */}
                        <button
                          className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded transition-colors inline-flex items-center justify-center"
                          onClick={() => openEdit(b.id)}
                          title="திருத்து (Edit)"
                          type="button"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>

                        {/* Delete Icon */}
                        <button
                          className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors inline-flex items-center justify-center"
                          onClick={() => handleDelete(b.id)}
                          title="அழி (Delete)"
                          type="button"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {bills.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-gray-400 py-4">
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 no-print p-4">
          <div className="card w-full max-w-3xl max-h-[85vh] overflow-y-auto space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-lg">{t('common.edit')} — {editing.bill_no}</h2>
              <button className="btn-secondary" onClick={() => setEditing(null)}>
                {t('common.close')}
              </button>
            </div>
            <input type="date" className="input max-w-xs" value={editing.bill_date} onChange={(e) => setEditing({ ...editing, bill_date: e.target.value })} />

            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('billing.item')}</th>
                  <th>{t('billing.rate')}</th>
                  <th>{t('billing.nos')}</th>
                  <th>{t('billing.weight')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {editing.lines.map((l) => (
                  <tr key={l.key}>
                    <td>{l.item_name_ta}</td>
                    <td>
                      <input className="input w-20" type="number" value={l.rate} onChange={(e) => updateLine(l.key, 'rate', e.target.value)} />
                    </td>
                    <td>
                      <input className="input w-16" type="number" value={l.nos === 0 || l.nos === '0' ? '' : (l.nos ?? '')} onChange={(e) => updateLine(l.key, 'nos', e.target.value)} />
                    </td>
                    <td>
                      <input className="input w-20" type="number" value={l.weight} onChange={(e) => updateLine(l.key, 'weight', e.target.value)} />
                    </td>
                    <td>
                      <button
                        className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors inline-flex items-center justify-center"
                        onClick={() => removeLine(l.key)}
                        title={t('common.delete')}
                        type="button"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {editing.bill_type === 'commission' ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={editing.commission_mode === 'percentage' ? 'btn-primary flex-1' : 'btn-secondary flex-1'}
                    onClick={() => setEditing({ ...editing, commission_mode: 'percentage' })}
                  >
                    {t('billing.commission_mode_percentage')}
                  </button>
                  <button
                    type="button"
                    className={editing.commission_mode === 'fixed' ? 'btn-primary flex-1' : 'btn-secondary flex-1'}
                    onClick={() => setEditing({ ...editing, commission_mode: 'fixed' })}
                  >
                    {t('billing.commission_mode_fixed')}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {editing.commission_mode === 'fixed' ? (
                    <NumField label={t('billing.commission')} value={editing.commission_amount} onChange={(v) => setEditing({ ...editing, commission_amount: v })} />
                  ) : (
                    <NumField label={t('billing.commission') + ' %'} value={editing.commission_percent} onChange={(v) => setEditing({ ...editing, commission_percent: v })} />
                  )}
                  <NumField label={t('billing.patthu')} value={editing.patthu_amount} onChange={(v) => setEditing({ ...editing, patthu_amount: v })} />
                  <NumField label={t('billing.cooli')} value={editing.cooli_amount} onChange={(v) => setEditing({ ...editing, cooli_amount: v })} />
                  <NumField label={t('billing.vadagai')} value={editing.vadagai_amount} onChange={(v) => setEditing({ ...editing, vadagai_amount: v })} />
                  <NumField label={t('billing.other_deduction')} value={editing.other_deduction_amount} onChange={(v) => setEditing({ ...editing, other_deduction_amount: v })} />
                </div>
                {(() => {
                  const tt = editTotals();
                  return (
                    <div className="bg-gray-50 border rounded p-2 text-sm space-y-1">
                      <div className="flex justify-between"><span>{t('billing.total_item_sales')}</span><strong>{formatINR(tt.itemsTotal)}</strong></div>
                      <div className="flex justify-between"><span>{t('billing.commission_side_total')}</span><strong>{formatINR(tt.totalDeductions)}</strong></div>
                      <div className="flex justify-between text-base"><span className="font-semibold">{t('billing.final_total')}</span><strong className={tt.exceeds ? 'text-red-600' : 'text-brand-700'}>{formatINR(tt.netTotal)}</strong></div>
                      {tt.exceeds && <p className="text-red-600 font-semibold">⚠ {t('billing.validation_exceeds')}</p>}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <NumField label={t('billing.discount')} value={editing.discount_amount} onChange={(v) => setEditing({ ...editing, discount_amount: v })} />
            )}

            <div className="grid grid-cols-2 gap-3">
              <NumField label={t('billing.paid_amount')} value={editing.paid_amount} onChange={(v) => setEditing({ ...editing, paid_amount: v })} />
              <div>
                <label className="label">{t('common.method')}</label>
                <select className="input" value={editing.payment_method_id || ''} onChange={(e) => setEditing({ ...editing, payment_method_id: e.target.value })}>
                  <option value="">—</option>
                  {methods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name_ta}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn-primary" onClick={saveEdit} disabled={editing.bill_type === 'commission' && editTotals().exceeds}>
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Slip Preview Modal */}
      {previewPayload && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 no-print overflow-y-auto">
          <div className="bg-white rounded-lg shadow-2xl max-w-xl w-full p-4 space-y-3 relative my-6">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-lg text-gray-800">
                Invoice Slip Preview — {previewPayload.bill.bill_no}
              </h3>
              <button
                className="text-gray-500 hover:text-gray-800 text-xl font-bold px-2"
                onClick={() => setPreviewPayload(null)}
              >
                ✕
              </button>
            </div>
            
            <div className="max-h-[75vh] overflow-y-auto p-3 bg-gray-100 rounded border">
              <SurandaiInvoice
                bill={previewPayload.bill}
                settings={previewPayload.settings}
              />
            </div>

            <div className="flex justify-between items-center pt-2 border-t">
              <button
                type="button"
                onClick={() => navigate(`/print/bill/${previewPayload.bill.id}`)}
                className="btn-primary text-sm flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 002-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span>Full Page / Print</span>
              </button>
              <button
                className="btn-secondary text-sm"
                onClick={() => setPreviewPayload(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NumField({ label, value, onChange }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type="number" step="0.01" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
