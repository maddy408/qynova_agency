import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Printer, Ban, Search, Pencil, Trash2, Receipt, X, FileText, CheckCircle2 } from 'lucide-react';
import { invoicesApi } from '../api/invoices';
import { itemsApi } from '../api/catalog';
import { customersApi } from '../api/parties';
import { priceLine, computeCartTotals } from '../utils/pricing';
import { Card } from '../components/Card.jsx';
import { Badge } from '../components/Badge.jsx';
import { Button } from '../components/Button.jsx';
import { PrintPreviewModal } from '../components/PrintPreviewModal.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { usePermission } from '../hooks/usePermission';

const STATUS_VARIANT = {
  paid: 'success', partial: 'warning', credit: 'gold', cancelled: 'danger', returned: 'danger',
};

const GST_STATUS_VARIANT = {
  not_generated: 'neutral', generated: 'success', failed: 'danger', cancelled: 'danger',
};
const GST_STATUS_LABEL = {
  not_generated: 'Not Generated', generated: 'Generated', failed: 'Failed', cancelled: 'Cancelled',
};

function GstFilingPanel({ invoice, canManage }) {
  const queryClient = useQueryClient();
  const [transportOpen, setTransportOpen] = useState(false);
  const [transporterName, setTransporterName] = useState(invoice.transporter_name || '');
  const [transporterGstin, setTransporterGstin] = useState(invoice.transporter_gstin || '');
  const [distance, setDistance] = useState(invoice.transport_distance_km || '');
  const [vehicleNo, setVehicleNo] = useState(invoice.vehicle_no || '');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id] });

  const runAction = async (key, fn) => {
    setActionError('');
    setBusy(key);
    try {
      await fn();
      invalidate();
    } catch (err) {
      setActionError(err?.response?.data?.result?.error || err?.response?.data?.error || err?.message || 'Request failed.');
    } finally {
      setBusy('');
    }
  };

  const saveTransport = () => runAction('transport', async () => {
    await invoicesApi.updateTransport(invoice.id, {
      transporter_name: transporterName || null,
      transporter_gstin: transporterGstin || null,
      transport_distance_km: distance ? Number(distance) : null,
      vehicle_no: vehicleNo || null,
    });
    setTransportOpen(false);
  });

  return (
    <div className="mb-4 rounded-2xl border border-[#D5E3F7] bg-[#F8FAFD] p-4 text-xs">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">GST Filing</div>

      <div className="mb-3 flex items-center justify-between rounded-xl border border-[#D5E3F7] bg-white p-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#0B1B45]">E-Invoice (IRN)</span>
          <Badge variant={GST_STATUS_VARIANT[invoice.einvoice_status]}>{GST_STATUS_LABEL[invoice.einvoice_status]}</Badge>
        </div>
        {canManage && (
          invoice.einvoice_status === 'generated' ? (
            <Button size="sm" variant="danger" disabled={busy === 'einvoice_cancel'} onClick={() => runAction('einvoice_cancel', () => invoicesApi.cancelEInvoice(invoice.id, 'Cancelled from Invoice Management'))}>
              {busy === 'einvoice_cancel' ? 'Cancelling…' : 'Cancel E-Invoice'}
            </Button>
          ) : (
            <Button size="sm" disabled={busy === 'einvoice'} onClick={() => runAction('einvoice', () => invoicesApi.generateEInvoice(invoice.id))} className="bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs">
              {busy === 'einvoice' ? 'Generating…' : 'Generate E-Invoice'}
            </Button>
          )
        )}
      </div>
      {invoice.irn && <div className="mb-2 text-xs font-mono text-slate-500">IRN: {invoice.irn} · Ack# {invoice.ack_no} · {invoice.ack_date}</div>}
      {invoice.einvoice_status === 'failed' && invoice.einvoice_error && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{invoice.einvoice_error}</div>
      )}

      <div className="flex items-center justify-between rounded-xl border border-[#D5E3F7] bg-white p-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#0B1B45]">E-Way Bill</span>
          <Badge variant={GST_STATUS_VARIANT[invoice.eway_bill_status]}>{GST_STATUS_LABEL[invoice.eway_bill_status]}</Badge>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setTransportOpen((v) => !v)} className="border-[#D5E3F7]">Transport Details</Button>
            {invoice.eway_bill_status === 'generated' ? (
              <Button size="sm" variant="danger" disabled={busy === 'eway_cancel'} onClick={() => runAction('eway_cancel', () => invoicesApi.cancelEWayBill(invoice.id, 'Cancelled from Invoice Management'))}>
                {busy === 'eway_cancel' ? 'Cancelling…' : 'Cancel'}
              </Button>
            ) : (
              <Button size="sm" disabled={busy === 'eway'} onClick={() => runAction('eway', () => invoicesApi.generateEWayBill(invoice.id))} className="bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs">
                {busy === 'eway' ? 'Generating…' : 'Generate E-Way Bill'}
              </Button>
            )}
          </div>
        )}
      </div>
      {invoice.eway_bill_no && (
        <div className="mt-2 text-xs font-mono text-slate-500">
          EWB# {invoice.eway_bill_no} · Valid until {invoice.eway_bill_valid_until || '-'}
        </div>
      )}
      {invoice.eway_bill_status === 'failed' && invoice.eway_bill_error && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{invoice.eway_bill_error}</div>
      )}

      {transportOpen && (
        <div className="mt-3 grid grid-cols-2 gap-2.5 rounded-2xl border border-[#D5E3F7] bg-white p-3.5">
          <input className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-medium text-slate-800 transition focus:border-[#2449C6] focus:bg-white focus:outline-none" placeholder="Transporter name" value={transporterName} onChange={(e) => setTransporterName(e.target.value)} />
          <input className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-medium text-slate-800 transition focus:border-[#2449C6] focus:bg-white focus:outline-none" placeholder="Transporter GSTIN" value={transporterGstin} onChange={(e) => setTransporterGstin(e.target.value)} />
          <input className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-medium text-slate-800 transition focus:border-[#2449C6] focus:bg-white focus:outline-none" type="number" placeholder="Distance (km)" value={distance} onChange={(e) => setDistance(e.target.value)} />
          <input className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-medium text-slate-800 transition focus:border-[#2449C6] focus:bg-white focus:outline-none" placeholder="Vehicle No" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
          <div className="col-span-2 flex justify-end">
            <Button size="sm" disabled={busy === 'transport'} onClick={saveTransport} className="bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs">
              {busy === 'transport' ? 'Saving…' : 'Save Transport Details'}
            </Button>
          </div>
        </div>
      )}

      {actionError && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
          {actionError}
        </div>
      )}
    </div>
  );
}

function ViewModal({ id, onClose }) {
  const canManageGst = usePermission('pos.manage_gst_filing');
  const { data } = useQuery({ queryKey: ['invoice', id], queryFn: () => invoicesApi.get(id) });
  if (!data) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="max-h-[85vh] w-[640px] overflow-auto rounded-3xl border border-[#D5E3F7] bg-white p-6 shadow-2xl">
        <div className="mb-2 flex items-center justify-between border-b border-[#EAF1FA] pb-3">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-lg font-black text-[#0B1B45]">{data.invoice_no || data.original_invoice_no || `Held #${data.id}`}</span>
            <Badge variant={STATUS_VARIANT[data.payment_status] || 'neutral'}>{data.payment_status || data.status}</Badge>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-4 text-xs font-medium text-slate-500">
          {data.customer_name || 'Walk-in'} · {data.invoice_date} · Billed by {data.employee_name}
          {data.edited_at && <span className="text-amber-600 font-semibold"> · Last edited {data.edited_at}</span>}
        </div>
        <div className="mb-4 overflow-hidden rounded-2xl border border-[#D5E3F7]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#D5E3F7] bg-[#F5F8FF] text-left text-xs font-bold uppercase tracking-wider text-slate-600">
                <th className="py-2.5 px-3">Item</th>
                <th className="py-2.5 px-3">Qty</th>
                <th className="py-2.5 px-3 text-right">Rate</th>
                <th className="py-2.5 px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAF1FA]">
              {data.items.map((line) => (
                <tr key={line.id} className="hover:bg-[#F8FAFD]">
                  <td className="py-2.5 px-3 font-bold text-[#0B1B45]">{line.item_name_snapshot}</td>
                  <td className="py-2.5 px-3 font-semibold text-slate-700">{line.qty} {line.unit_code}</td>
                  <td className="py-2.5 px-3 text-right text-slate-600 whitespace-nowrap">₹{line.rate}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-[#2449C6] whitespace-nowrap">₹{line.net_amount ?? line.line_total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mb-4 flex justify-end">
          <div className="rounded-xl border border-[#D5E3F7] bg-gradient-to-r from-[#F8FAFD] to-[#EDF5FF] px-4 py-2 text-right">
            <span className="text-xs font-semibold text-slate-600 mr-2">Grand Total:</span>
            <span className="text-base font-black text-[#0B1B45]">₹{data.grand_total}</span>
          </div>
        </div>
        {data.bill_type === 'gst' && data.status === 'completed' && (
          <GstFilingPanel invoice={data} canManage={canManageGst} />
        )}
        {data.status === 'cancelled' && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-600">
            Cancelled by {data.cancelled_by_name || 'user'} on {data.cancelled_at}{data.cancel_reason ? ` — ${data.cancel_reason}` : ''}
          </div>
        )}
        {data.status === 'deleted' && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-600">
            Deleted by {data.deleted_by_name || 'user'} on {data.deleted_at}{data.delete_reason ? ` — ${data.delete_reason}` : ''}
            {data.original_invoice_no && <span> · was {data.original_invoice_no}, number freed for reuse</span>}
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose} className="border-[#D5E3F7]">Close</Button>
        </div>
      </div>
    </div>
  );
}

function CancelModal({ invoice, onClose, onConfirm, error }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-[440px] rounded-3xl border border-[#D5E3F7] bg-white p-6 shadow-2xl">
        <div className="mb-2 text-lg font-bold text-[#0B1B45]">Cancel {invoice.invoice_no}</div>
        <p className="mb-3 text-xs text-slate-500 font-medium">
          This reverses the stock deducted by this sale and, if it was a credit sale, reduces the customer's
          outstanding by whatever is still unpaid. This cannot be undone — rebill the customer separately if needed.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for cancellation (optional)"
          className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] p-3 text-xs text-slate-800 transition focus:border-[#2449C6] focus:bg-white focus:outline-none mb-3 h-20 resize-none"
        />
        {error && <p className="mb-3 text-xs font-semibold text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">{error}</p>}
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} className="border-[#D5E3F7]">Back</Button>
          <Button variant="danger" onClick={() => onConfirm(reason)} className="bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-xs">Confirm Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({ invoice, onClose, onConfirm, error }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-[440px] rounded-3xl border border-[#D5E3F7] bg-white p-6 shadow-2xl">
        <div className="mb-2 text-lg font-bold text-[#0B1B45]">Delete {invoice.invoice_no}</div>
        <p className="mb-3 text-xs text-slate-500 font-medium">
          This reverses the stock deducted by this sale and, if it was a credit sale, reduces the customer's
          outstanding by whatever is still unpaid — same as Cancel. Unlike Cancel, the invoice is hidden from
          reports entirely and its number ({invoice.invoice_no}) becomes available for reuse by the next invoice.
          This cannot be undone.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for deletion (optional)"
          className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] p-3 text-xs text-slate-800 transition focus:border-[#2449C6] focus:bg-white focus:outline-none mb-3 h-20 resize-none"
        />
        {error && <p className="mb-3 text-xs font-semibold text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">{error}</p>}
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} className="border-[#D5E3F7]">Back</Button>
          <Button variant="danger" onClick={() => onConfirm(reason)} className="bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-xs">Confirm Delete</Button>
        </div>
      </div>
    </div>
  );
}

function EditModal({ id, onClose }) {
  const queryClient = useQueryClient();
  const canDiscount = usePermission('pos.apply_discount');
  const canEditPrice = usePermission('pos.edit_price_at_sale');

  const invoiceQuery = useQuery({ queryKey: ['invoice', id], queryFn: () => invoicesApi.get(id) });
  const itemsQuery = useQuery({ queryKey: ['items', ''], queryFn: () => itemsApi.list('') });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });

  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (invoiceQuery.data && lines === null) {
      const inv = invoiceQuery.data;
      setCustomerId(inv.customer_id ?? '');
      setLines(
        inv.items.map((it) => ({
          key: `${it.id}-${Math.random()}`,
          item: {
            id: it.item_id,
            item_name: it.item_name_snapshot,
            retail_price: it.rate,
            gst_percent: it.tax_percent,
            cess_percent: 0,
            base_unit_id: it.unit_id,
          },
          qty: Number(it.qty),
          free_qty: Number(it.free_qty),
          discount_percent: Number(it.discount_percent),
          discount_amount: Number(it.discount_amount) > 0 ? Number(it.discount_amount) : '',
          discount_mode: Number(it.discount_amount) > 0 && Number(it.discount_percent) === 0 ? 'amount' : 'percent',
          unit_id: it.unit_id,
          rate: Number(it.rate),
        }))
      );
    }
  }, [invoiceQuery.data, lines]);

  const items = itemsQuery.data || [];
  const customers = customersQuery.data || [];
  const invoice = invoiceQuery.data;

  const pricedLines = useMemo(
    () =>
      (lines || []).map((line) => ({
        ...line,
        priced: priceLine(line.item, line.discount_mode === 'amount' ? { ...line, discount_percent: 0 } : { ...line, discount_amount: '' }),
      })),
    [lines]
  );
  const totals = useMemo(() => computeCartTotals(pricedLines.map((l) => l.priced)), [pricedLines]);

  const updateLine = (key, patch) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key) => setLines((prev) => prev.filter((l) => l.key !== key));
  const addLine = (itemId) => {
    const item = items.find((i) => i.id === Number(itemId));
    if (!item) return;
    setLines((prev) => [
      ...prev,
      {
        key: `new-${item.id}-${Date.now()}`,
        item,
        qty: 1,
        free_qty: 0,
        discount_percent: 0,
        discount_amount: '',
        discount_mode: 'percent',
        unit_id: item.base_unit_id,
        rate: item.retail_price,
      },
    ]);
  };

  const editMutation = useMutation({
    mutationFn: () =>
      invoicesApi.editCompleted(id, {
        customer_id: customerId ? Number(customerId) : null,
        items: (lines || []).map((l) => ({
          item_id: l.item.id,
          qty: Number(l.qty),
          free_qty: Number(l.free_qty || 0),
          unit_id: l.unit_id,
          ...(canDiscount
            ? l.discount_mode === 'amount'
              ? { discount_amount: Number(l.discount_amount || 0) }
              : { discount_percent: Number(l.discount_percent || 0) }
            : {}),
          ...(canEditPrice ? { rate: Number(l.rate) } : {}),
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      setSuccess(true);
      setConfirming(false);
    },
    onError: (err) => {
      setError(err?.response?.data?.error || 'Failed to update invoice');
      setConfirming(false);
    },
  });

  if (!invoice || lines === null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
        <div className="rounded-3xl border border-[#D5E3F7] bg-white p-8 text-sm font-semibold text-slate-500 shadow-2xl">
          Loading invoice…
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[#D5E3F7] bg-white p-6 shadow-2xl">
        <div className="mb-2 flex items-center justify-between border-b border-[#EAF1FA] pb-3">
          <div className="text-lg font-bold text-[#0B1B45]">Edit {invoice.invoice_no}</div>
          <Badge variant="warning">Original total: ₹{invoice.grand_total}</Badge>
        </div>
        <p className="mb-4 text-xs font-medium text-slate-500">
          Stock for the old items is reversed and stock for the new items is applied automatically. Payments already
          collected (₹{invoice.paid_amount}) are never altered — only the remaining balance and the customer's
          credit are adjusted by the difference.
        </p>

        {success ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Invoice updated successfully.
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-600">Customer</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full sm:w-72 rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 transition focus:border-[#2449C6] focus:outline-none"
              >
                <option value="">Walk-in Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.ledger_name}</option>
                ))}
              </select>
            </div>

            <div className="mb-4 flex flex-col gap-2.5 max-h-60 overflow-y-auto pr-1">
              {pricedLines.map((line) => (
                <div key={line.key} className="rounded-2xl border border-[#D5E3F7] bg-[#F8FAFD] p-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#0B1B45]">{line.item.item_name}</span>
                    <button onClick={() => removeLine(line.key)} className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <label className="flex items-center gap-1.5 font-semibold text-slate-600">
                      Qty
                      <input
                        type="number" min="0" step="any" value={line.qty}
                        onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                        className="w-16 rounded-lg border border-[#D5E3F7] bg-white px-2 py-1 text-center font-bold text-slate-800 transition focus:border-[#2449C6] focus:outline-none"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 font-semibold text-slate-600">
                      Rate
                      <input
                        type="number" step="any" disabled={!canEditPrice} value={line.rate}
                        onChange={(e) => updateLine(line.key, { rate: e.target.value })}
                        className="w-20 rounded-lg border border-[#D5E3F7] bg-white px-2 py-1 text-right font-bold text-slate-800 transition focus:border-[#2449C6] focus:outline-none disabled:bg-slate-50"
                      />
                    </label>
                    {canDiscount && (
                      <label className="flex items-center gap-1.5 font-semibold text-slate-600">
                        Disc
                        <div className="flex overflow-hidden rounded-lg border border-[#D5E3F7]">
                          <button
                            type="button"
                            onClick={() => updateLine(line.key, { discount_mode: 'percent' })}
                            className={`px-2 py-0.5 text-xs font-bold transition ${line.discount_mode !== 'amount' ? 'bg-[#0B1B45] text-white' : 'bg-white text-slate-600'}`}
                          >
                            %
                          </button>
                          <button
                            type="button"
                            onClick={() => updateLine(line.key, { discount_mode: 'amount' })}
                            className={`px-2 py-0.5 text-xs font-bold transition ${line.discount_mode === 'amount' ? 'bg-[#0B1B45] text-white' : 'bg-white text-slate-600'}`}
                          >
                            ₹
                          </button>
                        </div>
                        {line.discount_mode === 'amount' ? (
                          <input type="number" min="0" step="any" value={line.discount_amount} onChange={(e) => updateLine(line.key, { discount_amount: e.target.value })} className="w-16 rounded-lg border border-[#D5E3F7] bg-white px-2 py-1 font-bold text-slate-800 focus:border-[#2449C6] focus:outline-none" />
                        ) : (
                          <input type="number" min="0" step="any" value={line.discount_percent} onChange={(e) => updateLine(line.key, { discount_percent: e.target.value })} className="w-14 rounded-lg border border-[#D5E3F7] bg-white px-2 py-1 font-bold text-slate-800 focus:border-[#2449C6] focus:outline-none" />
                        )}
                      </label>
                    )}
                    <span className="ml-auto font-black text-[#2449C6]">₹{line.priced.line_total.toFixed(2)}</span>
                  </div>
                </div>
              ))}
              {lines.length === 0 && <p className="py-4 text-center text-xs font-semibold text-slate-400">No items — add at least one below.</p>}
            </div>

            <div className="mb-4 flex items-center gap-2">
              <select
                onChange={(e) => { if (e.target.value) { addLine(e.target.value); e.target.value = ''; } }}
                className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 transition focus:border-[#2449C6] focus:outline-none"
                defaultValue=""
              >
                <option value="" disabled>+ Add an item…</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.item_name}</option>)}
              </select>
            </div>

            <div className="mb-4 rounded-2xl border border-[#D5E3F7] bg-gradient-to-br from-[#F8FAFD] to-[#EDF5FF] p-4 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-600 font-medium"><span>Subtotal</span><span>₹{totals.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-slate-600 font-medium"><span>GST</span><span>₹{(totals.cgst + totals.sgst + totals.cessAmount).toFixed(2)}</span></div>
              <div className="flex justify-between text-slate-600 font-medium"><span>Discount</span><span>₹{totals.discountAmount.toFixed(2)}</span></div>
              <div className="mt-2 flex justify-between border-t border-[#D5E3F7] pt-2 text-sm font-black text-[#0B1B45]">
                <span>New Total</span><span>₹{totals.grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {error && <p className="mb-3 text-xs font-semibold text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">{error}</p>}

            {confirming ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 shadow-xs">
                <p className="mb-1 font-bold">Are you sure you want to update this invoice?</p>
                <p className="mb-3 text-[11px] font-medium text-amber-800">
                  Total changes from ₹{invoice.grand_total} to ₹{totals.grandTotal.toFixed(2)}. Stock and the customer's
                  credit balance will be adjusted accordingly.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={editMutation.isPending} className="border-amber-300">Back</Button>
                  <Button size="sm" onClick={() => editMutation.mutate()} disabled={editMutation.isPending} className="bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs">Yes, Update Invoice</Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2.5">
                <Button variant="secondary" onClick={onClose} className="border-[#D5E3F7]">Cancel</Button>
                <Button onClick={() => { setError(''); setConfirming(true); }} disabled={lines.length === 0} className="bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs">Save Changes</Button>
              </div>
            )}
          </>
        )}

        {success && (
          <div className="mt-4 flex justify-end">
            <Button onClick={onClose} className="bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs">Close</Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function InvoiceManagement() {
  const canCancel = usePermission('pos.cancel_completed_invoice');
  const canDelete = usePermission('pos.delete_completed_invoice');
  const canEdit = usePermission('pos.edit_completed_invoice');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [viewingId, setViewingId] = useState(null);
  const [printingId, setPrintingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [cancelError, setCancelError] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  const invoicesQuery = useQuery({
    queryKey: ['invoices', page, statusFilter, search],
    queryFn: () =>
      invoicesApi.list({
        page,
        limit: 10,
        status: statusFilter || undefined,
        search: search.trim() || undefined,
      }),
  });
  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }) => invoicesApi.cancel(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setCancelling(null);
      setCancelError('');
    },
    onError: (err) => setCancelError(err?.response?.data?.error || 'Failed to cancel'),
  });
  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }) => invoicesApi.deleteCompleted(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setDeleting(null);
      setDeleteError('');
    },
    onError: (err) => setDeleteError(err?.response?.data?.error || 'Failed to delete'),
  });

  const invoices = Array.isArray(invoicesQuery.data) ? invoicesQuery.data : (invoicesQuery.data?.data || []);
  const total = Array.isArray(invoicesQuery.data) ? invoicesQuery.data.length : (invoicesQuery.data?.total ?? invoices.length);
  const filtered = invoices;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D5E3F7] pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#0B1B45] flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0B1B45] to-[#2449C6] text-white shadow-xs">
              <Receipt className="w-5 h-5" />
            </span>
            Invoice Management
          </h1>
          <p className="text-xs font-semibold text-slate-500 mt-1">Search, view, print, edit, and cancel invoices</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EAF1FA] flex flex-col sm:flex-row items-center justify-between gap-3 bg-gradient-to-r from-[#F5F8FF] to-white">
          <h3 className="font-bold text-[#0B1B45] text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#2449C6]" />
            Invoices Register
          </h3>
          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search invoice # or customer"
                className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] pl-9 pr-3.5 py-2 text-sm font-medium text-slate-800 transition focus:border-[#2449C6] focus:bg-white focus:outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-xl border border-[#D5E3F7] bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition focus:border-[#2449C6] focus:outline-none"
            >
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="returned">Returned</option>
              <option value="deleted">Deleted</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#D5E3F7] bg-[#F1F5F9] text-xs font-bold uppercase tracking-wider text-slate-800">
                <th className="px-3.5 py-2.5">Invoice #</th>
                <th className="px-3.5 py-2.5">Customer</th>
                <th className="px-3.5 py-2.5">Date</th>
                <th className="px-3.5 py-2.5 text-right">Total</th>
                <th className="px-3.5 py-2.5">Payment</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAF1FA]">
              {filtered.map((inv) => (
                <tr key={inv.id} className="hover:bg-[#F8FAFD] transition">
                  <td className="px-3.5 py-2.5 font-mono font-bold text-[#0B1B45]">
                    {inv.invoice_no || inv.original_invoice_no || `Held #${inv.id}`}
                  </td>
                  <td className="px-3.5 py-2.5 font-semibold text-slate-900">{inv.customer_name || 'Walk-in'}</td>
                  <td className="px-3.5 py-2.5 text-slate-700 font-mono text-xs font-semibold">{inv.invoice_date}</td>
                  <td className="px-3.5 py-2.5 text-right font-black text-[#2449C6] whitespace-nowrap">₹{inv.grand_total}</td>
                  <td className="px-3.5 py-2.5">
                    <Badge variant={STATUS_VARIANT[inv.payment_status] || 'neutral'}>
                      {inv.payment_status || '-'}
                    </Badge>
                  </td>
                  <td className="px-3.5 py-2.5 capitalize font-bold text-slate-800">
                    {inv.status}{inv.edited_at ? ' (edited)' : ''}
                  </td>
                  <td className="px-3.5 py-2.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        title="View"
                        onClick={() => setViewingId(inv.id)}
                        className="rounded-lg border border-[#D5E3F7] bg-white p-1.5 text-slate-600 hover:bg-[#EDF5FF] hover:text-[#2449C6] transition shadow-2xs"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        title="Print"
                        onClick={() => setPrintingId(inv.id)}
                        className="rounded-lg border border-[#D5E3F7] bg-white p-1.5 text-slate-600 hover:bg-[#EDF5FF] hover:text-[#2449C6] transition shadow-2xs"
                      >
                        <Printer size={14} />
                      </button>
                      {canEdit && inv.status === 'completed' && (
                        <button
                          title="Edit"
                          onClick={() => setEditingId(inv.id)}
                          className="rounded-lg border border-[#D5E3F7] bg-white p-1.5 text-amber-600 hover:bg-amber-50 transition shadow-2xs"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {canCancel && inv.status === 'completed' && (
                        <button
                          title="Cancel"
                          onClick={() => { setCancelling(inv); setCancelError(''); }}
                          className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100 transition shadow-2xs"
                        >
                          <Ban size={14} />
                        </button>
                      )}
                      {canDelete && inv.status === 'completed' && (
                        <button
                          title="Delete"
                          onClick={() => { setDeleting(inv); setDeleteError(''); }}
                          className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100 transition shadow-2xs"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-xs font-semibold">
                    No invoices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          total={total}
          limit={10}
          onPageChange={setPage}
          label="invoices"
        />
      </div>

      {viewingId && <ViewModal id={viewingId} onClose={() => setViewingId(null)} />}
      {printingId && <PrintPreviewModal invoiceId={printingId} onClose={() => setPrintingId(null)} />}
      {editingId && <EditModal id={editingId} onClose={() => setEditingId(null)} />}
      {cancelling && (
        <CancelModal
          invoice={cancelling}
          error={cancelError}
          onClose={() => setCancelling(null)}
          onConfirm={(reason) => cancelMutation.mutate({ id: cancelling.id, reason })}
        />
      )}
      {deleting && (
        <DeleteModal
          invoice={deleting}
          error={deleteError}
          onClose={() => setDeleting(null)}
          onConfirm={(reason) => deleteMutation.mutate({ id: deleting.id, reason })}
        />
      )}
    </div>
  );
}
