import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Search, Plus, X, CheckCircle2, Wallet, CreditCard } from 'lucide-react';
import { itemsApi } from '../api/catalog';
import { customersApi, suppliersApi } from '../api/parties';
import { salesReturnsApi, purchaseReturnsApi } from '../api/postsale';
import { invoicesApi } from '../api/invoices';
import { purchasesApi } from '../api/purchasing';
import { Tabs } from '../components/Tabs';
import { usePermission } from '../hooks/usePermission';
import { Button } from '../components/Button.jsx';
import { Collections } from './Collections.jsx';

function ReturnLineEditor({ lines, setLines, items }) {
  const addLine = () => setLines((prev) => [...prev, { item_id: '', qty: 1, rate: 0 }]);
  const updateLine = (idx, patch) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeLine = (idx) => setLines((prev) => prev.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">Return Item Lines *</label>
      {lines.map((line, idx) => (
        <div key={idx} className="flex items-center gap-2 rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] p-2.5">
          <select
            value={line.item_id}
            onChange={(e) => updateLine(idx, { item_id: e.target.value })}
            className="rounded-lg border border-[#D5E3F7] bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 flex-1 transition focus:border-[#2449C6] focus:outline-none"
          >
            <option value="">Select Item</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.item_name}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="any"
            placeholder="Qty"
            value={line.qty}
            onChange={(e) => updateLine(idx, { qty: e.target.value })}
            className="rounded-lg border border-[#D5E3F7] bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 w-16 transition focus:border-[#2449C6] focus:outline-none"
          />
          <input
            type="number"
            step="any"
            placeholder="Rate"
            value={line.rate}
            onChange={(e) => updateLine(idx, { rate: e.target.value })}
            className="rounded-lg border border-[#D5E3F7] bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 w-20 transition focus:border-[#2449C6] focus:outline-none"
          />
          {lines.length > 1 && (
            <button
              type="button"
              onClick={() => removeLine(idx)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
              title="Remove Line"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addLine}
        className="text-xs font-bold text-[#2449C6] hover:text-[#0B1B45] transition flex items-center gap-1 mt-1"
      >
        + Add Another Item
      </button>
    </div>
  );
}

function TraceableReturnLines({ returnableItems, quantities, setQuantities, linkField, sourceLabel }) {
  if (!returnableItems) return null;
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">Items on this {sourceLabel}</label>
      <div className="border border-[#D5E3F7] rounded-2xl divide-y divide-[#EAF1FA] max-h-72 overflow-y-auto bg-white shadow-2xs">
        {returnableItems.map((row) => {
          const lineId = row[linkField];
          const remaining = Number(row.remaining_qty);
          const qty = quantities[lineId] ?? '';
          return (
            <div key={lineId} className="flex items-center gap-3 p-3 text-xs hover:bg-[#F8FAFD] transition">
              <div className="flex-1">
                <div className="font-bold text-[#0B1B45]">{row.item_name}</div>
                <div className="text-slate-500 text-[11px] mt-0.5 font-medium">
                  Original {row.original_qty} · Already returned {row.already_returned_qty} · <span className="font-bold text-emerald-700">Remaining {remaining}</span> @ <span className="font-bold text-[#2449C6]">₹{row.rate}</span>
                </div>
              </div>
              <input
                type="number"
                step="any"
                min="0"
                max={remaining}
                placeholder="Qty"
                value={qty}
                disabled={remaining <= 0}
                onChange={(e) => setQuantities((prev) => ({ ...prev, [lineId]: e.target.value }))}
                className="w-20 rounded-lg border border-[#D5E3F7] bg-white px-2 py-1 text-xs font-bold text-slate-800 transition focus:border-[#2449C6] focus:outline-none disabled:opacity-40 disabled:bg-slate-50"
              />
            </div>
          );
        })}
        {returnableItems.length === 0 && (
          <div className="p-4 text-center text-slate-400 text-xs font-semibold">No lines found on this record.</div>
        )}
      </div>
    </div>
  );
}

function RefundAmountField({ returnTotal, refundAmount, setRefundAmount, touched, setTouched }) {
  useEffect(() => {
    if (!touched) setRefundAmount(returnTotal ? returnTotal.toFixed(2) : '');
  }, [returnTotal, touched, setRefundAmount]);

  const balance = returnTotal - Number(refundAmount || 0);

  return (
    <div className="rounded-2xl border border-[#D5E3F7] bg-[#F5F8FF] p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1">Return Total</label>
          <div className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs font-black text-[#0B1B45] flex items-center">
            ₹{returnTotal.toFixed(2)}
          </div>
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1">Refund / Payment Amount</label>
          <input
            type="number"
            step="any"
            min="0"
            max={returnTotal}
            value={refundAmount}
            onChange={(e) => { setTouched(true); setRefundAmount(e.target.value); }}
            className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs font-bold text-slate-800 transition focus:border-[#2449C6] focus:outline-none"
          />
        </div>
      </div>
      {balance > 0.009 && (
        <div className="text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
          Balance not refunded: ₹{balance.toFixed(2)}
        </div>
      )}
    </div>
  );
}

function SalesReturnsPanel({ canCreate, canApprove }) {
  const queryClient = useQueryClient();
  const [invoiceId, setInvoiceId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [refundAction, setRefundAction] = useState('credit_note');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState([{ item_id: '', qty: 1, rate: 0 }]);
  const [quantities, setQuantities] = useState({});
  const [refundAmount, setRefundAmount] = useState('');
  const [refundTouched, setRefundTouched] = useState(false);

  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const returnsQuery = useQuery({ queryKey: ['sales-returns'], queryFn: salesReturnsApi.list });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const itemsQuery = useQuery({ queryKey: ['items', ''], queryFn: () => itemsApi.list('') });
  const returnableQuery = useQuery({
    queryKey: ['invoice-returnable-items', invoiceId],
    queryFn: () => invoicesApi.returnableItems(invoiceId),
    enabled: !!invoiceId,
  });
  const returnableItems = invoiceId ? returnableQuery.data : null;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['sales-returns'] });

  const createMutation = useMutation({
    mutationFn: salesReturnsApi.create,
    onSuccess: () => {
      invalidate();
      resetForm();
      showSuccess('Sales return logged successfully!');
    },
  });

  const approveMutation = useMutation({
    mutationFn: salesReturnsApi.approve,
    onSuccess: () => {
      invalidate();
      showSuccess('Return approved.');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: salesReturnsApi.reject,
    onSuccess: () => {
      invalidate();
      showSuccess('Return rejected.');
    },
  });

  const resetForm = () => {
    setInvoiceId('');
    setCustomerId('');
    setRefundAction('credit_note');
    setReason('');
    setLines([{ item_id: '', qty: 1, rate: 0 }]);
    setQuantities({});
    setRefundAmount('');
    setRefundTouched(false);
    setFormError('');
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const traceableLines = useMemo(() => {
    if (!returnableItems) return [];
    return returnableItems
      .map((row) => ({ item_id: row.item_id, invoice_item_id: row.invoice_item_id, qty: Number(quantities[row.invoice_item_id] || 0), rate: Number(row.rate) }))
      .filter((l) => l.qty > 0);
  }, [returnableItems, quantities]);

  const manualLines = useMemo(() => lines.filter((l) => l.item_id && Number(l.qty) > 0), [lines]);
  const activeLines = invoiceId ? traceableLines : manualLines;
  const returnTotal = useMemo(() => activeLines.reduce((s, l) => s + Number(l.qty) * Number(l.rate), 0), [activeLines]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (activeLines.length === 0) {
      setFormError('Please add at least one valid item line with a quantity.');
      return;
    }

    try {
      await createMutation.mutateAsync({
        invoice_id: invoiceId ? Number(invoiceId) : null,
        customer_id: customerId ? Number(customerId) : null,
        refund_action: refundAction,
        reason: reason || null,
        refund_amount: refundAmount !== '' ? Number(refundAmount) : undefined,
        items: activeLines.map((l) => ({
          item_id: Number(l.item_id),
          qty: Number(l.qty),
          rate: Number(l.rate),
          invoice_item_id: l.invoice_item_id || undefined,
        })),
      });
    } catch (err) {
      setFormError(err?.response?.data?.error || 'Failed to save return');
    }
  };

  const returns = returnsQuery.data || [];
  const customers = customersQuery.data || [];
  const items = itemsQuery.data || [];

  const filteredReturns = returns.filter((r) => {
    return (
      r.return_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.invoice_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.status?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="space-y-4">
      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column Form */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-6 space-y-5 sticky top-6">
            <div className="border-b border-[#EAF1FA] pb-3.5">
              <h2 className="font-bold text-[#0B1B45] text-base flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EDF5FF] border border-[#D5E3F7] text-[#2449C6]">
                  <Plus className="w-4 h-4" />
                </span>
                New Sales Return
              </h2>
              <p className="text-[11px] font-medium text-slate-500 mt-1">
                Enter an Invoice # to pick exact lines and quantities; leave it blank for an untraceable return (requires approval).
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="text-xs text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-200">
                  {formError}
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Invoice ID (Optional)</label>
                <input
                  type="text"
                  placeholder="Invoice #"
                  value={invoiceId}
                  onChange={(e) => { setInvoiceId(e.target.value); setQuantities({}); setRefundTouched(false); }}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs text-slate-800 transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/20 focus:outline-none"
                />
                {invoiceId && returnableQuery.isError && (
                  <p className="text-[11px] font-semibold text-rose-500 mt-1">Could not load that invoice's items — check the Invoice ID.</p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Customer</label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/20 focus:outline-none"
                >
                  <option value="">Walk-in / Unknown Customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ledger_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Refund Action</label>
                <select
                  value={refundAction}
                  onChange={(e) => setRefundAction(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 transition focus:border-[#2449C6] focus:outline-none"
                >
                  <option value="credit_note">Credit Note</option>
                  <option value="cash_refund">Cash Refund</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Return Reason</label>
                <input
                  type="text"
                  placeholder="Defective, size mismatch, changed mind..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs text-slate-800 transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/20 focus:outline-none"
                />
              </div>

              {invoiceId ? (
                <TraceableReturnLines
                  returnableItems={returnableItems || []}
                  quantities={quantities}
                  setQuantities={setQuantities}
                  linkField="invoice_item_id"
                  sourceLabel="invoice"
                />
              ) : (
                <ReturnLineEditor lines={lines} setLines={setLines} items={items} />
              )}

              <RefundAmountField
                returnTotal={returnTotal}
                refundAmount={refundAmount}
                setRefundAmount={setRefundAmount}
                touched={refundTouched}
                setTouched={setRefundTouched}
              />

              {canCreate && (
                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={createMutation.isPending}
                    className="w-full bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs py-3"
                  >
                    Save Sales Return
                  </Button>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Right Column Table */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search returns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] pl-10 pr-3.5 py-2 text-xs text-slate-800 transition focus:border-[#2449C6] focus:bg-white focus:outline-none"
              />
            </div>
            <span className="text-xs font-semibold text-slate-500">{filteredReturns.length} return record(s)</span>
          </div>

          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EAF1FA] flex items-center justify-between bg-gradient-to-r from-[#F5F8FF] to-white">
              <h3 className="font-bold text-[#0B1B45] text-sm flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-[#2449C6]" />
                Sales Returns Log
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#D5E3F7] bg-[#F5F8FF] text-xs font-bold uppercase tracking-wider text-slate-600">
                    <th className="px-3.5 py-2.5">Return #</th>
                    <th className="px-3.5 py-2.5">Invoice</th>
                    <th className="px-3.5 py-2.5">Customer</th>
                    <th className="px-3.5 py-2.5">Refund</th>
                    <th className="px-3.5 py-2.5 text-right">Amount</th>
                    <th className="px-3.5 py-2.5 text-center">Status</th>
                    <th className="px-3.5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAF1FA]">
                  {filteredReturns.map((r) => (
                    <tr key={r.id} className="hover:bg-[#F8FAFD] transition">
                      <td className="px-3.5 py-2.5 font-mono font-bold text-[#0B1B45]">{r.return_no}</td>
                      <td className="px-3.5 py-2.5">
                        {r.invoice_no ? (
                          <span className="text-slate-600 font-mono text-xs font-semibold">{r.invoice_no}</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Untraceable
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 font-semibold text-slate-800">{r.customer_name || 'Walk-in'}</td>
                      <td className="px-3.5 py-2.5 capitalize text-slate-500 font-medium">{r.refund_action?.replace('_', ' ')}</td>
                      <td className="px-3.5 py-2.5 text-right font-black text-[#2449C6] whitespace-nowrap">₹{Number(r.refund_amount ?? 0).toFixed(2)}</td>
                      <td className="px-3.5 py-2.5 text-center capitalize">
                        {r.status === 'completed' || r.status === 'approved' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            {r.status}
                          </span>
                        ) : r.status === 'pending_approval' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            Pending Approval
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            {r.status}
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        {r.status === 'pending_approval' && canApprove && (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => approveMutation.mutate(r.id)}
                              className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-[10px] font-bold shadow-xs hover:from-emerald-600 hover:to-emerald-700 transition"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => rejectMutation.mutate(r.id)}
                              className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-rose-500 to-rose-600 text-white text-[10px] font-bold shadow-xs hover:from-rose-600 hover:to-rose-700 transition"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredReturns.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-xs font-semibold">
                        No sales returns logged yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PurchaseReturnsPanel({ canManage }) {
  const queryClient = useQueryClient();
  const [purchaseId, setPurchaseId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState([{ item_id: '', qty: 1, rate: 0 }]);
  const [quantities, setQuantities] = useState({});
  const [refundAmount, setRefundAmount] = useState('');
  const [refundTouched, setRefundTouched] = useState(false);

  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const returnsQuery = useQuery({ queryKey: ['purchase-returns'], queryFn: purchaseReturnsApi.list });
  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list });
  const itemsQuery = useQuery({ queryKey: ['items', ''], queryFn: () => itemsApi.list('') });
  const returnableQuery = useQuery({
    queryKey: ['purchase-returnable-items', purchaseId],
    queryFn: () => purchasesApi.returnableItems(purchaseId),
    enabled: !!purchaseId,
  });
  const returnableItems = purchaseId ? returnableQuery.data : null;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['purchase-returns'] });

  const createMutation = useMutation({
    mutationFn: purchaseReturnsApi.create,
    onSuccess: () => {
      invalidate();
      resetForm();
      showSuccess('Purchase return logged successfully!');
    },
  });

  const resetForm = () => {
    setPurchaseId('');
    setSupplierId('');
    setReason('');
    setLines([{ item_id: '', qty: 1, rate: 0 }]);
    setQuantities({});
    setRefundAmount('');
    setRefundTouched(false);
    setFormError('');
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const traceableLines = useMemo(() => {
    if (!returnableItems) return [];
    return returnableItems
      .map((row) => ({ item_id: row.item_id, purchase_item_id: row.purchase_item_id, qty: Number(quantities[row.purchase_item_id] || 0), rate: Number(row.rate) }))
      .filter((l) => l.qty > 0);
  }, [returnableItems, quantities]);

  const manualLines = useMemo(() => lines.filter((l) => l.item_id && Number(l.qty) > 0), [lines]);
  const activeLines = purchaseId ? traceableLines : manualLines;
  const returnTotal = useMemo(() => activeLines.reduce((s, l) => s + Number(l.qty) * Number(l.rate), 0), [activeLines]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!supplierId) {
      setFormError('Please select a supplier.');
      return;
    }
    if (activeLines.length === 0) {
      setFormError('Please add at least one valid item line with a quantity.');
      return;
    }

    try {
      await createMutation.mutateAsync({
        purchase_id: purchaseId ? Number(purchaseId) : null,
        supplier_id: Number(supplierId),
        reason: reason || null,
        refund_amount: refundAmount !== '' ? Number(refundAmount) : undefined,
        items: activeLines.map((l) => ({
          item_id: Number(l.item_id),
          qty: Number(l.qty),
          rate: Number(l.rate),
          purchase_item_id: l.purchase_item_id || undefined,
        })),
      });
    } catch (err) {
      setFormError(err?.response?.data?.error || 'Failed to save purchase return');
    }
  };

  const returns = returnsQuery.data || [];
  const suppliers = suppliersQuery.data || [];
  const items = itemsQuery.data || [];

  const filteredReturns = returns.filter((r) => {
    return (
      r.return_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.grn_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reason?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="space-y-4">
      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column Form */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-6 space-y-5 sticky top-6">
            <div className="border-b border-[#EAF1FA] pb-3.5">
              <h2 className="font-bold text-[#0B1B45] text-base flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EDF5FF] border border-[#D5E3F7] text-[#2449C6]">
                  <Plus className="w-4 h-4" />
                </span>
                New Purchase Return
              </h2>
              <p className="text-[11px] font-medium text-slate-500 mt-1">
                Enter a Purchase/GRN ID to pick exact lines and quantities.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="text-xs text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-200">
                  {formError}
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Purchase / GRN ID (Optional)</label>
                <input
                  type="text"
                  placeholder="Purchase #"
                  value={purchaseId}
                  onChange={(e) => { setPurchaseId(e.target.value); setQuantities({}); setRefundTouched(false); }}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs text-slate-800 transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/20 focus:outline-none"
                />
                {purchaseId && returnableQuery.isError && (
                  <p className="text-[11px] font-semibold text-rose-500 mt-1">Could not load that purchase's items — check the ID.</p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Supplier *</label>
                <select
                  required
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/20 focus:outline-none"
                >
                  <option value="">-- Select Supplier --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Return Reason</label>
                <input
                  type="text"
                  placeholder="Damaged batch, expired goods, wrong delivery..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs text-slate-800 transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/20 focus:outline-none"
                />
              </div>

              {purchaseId ? (
                <TraceableReturnLines
                  returnableItems={returnableItems || []}
                  quantities={quantities}
                  setQuantities={setQuantities}
                  linkField="purchase_item_id"
                  sourceLabel="GRN"
                />
              ) : (
                <ReturnLineEditor lines={lines} setLines={setLines} items={items} />
              )}

              <RefundAmountField
                returnTotal={returnTotal}
                refundAmount={refundAmount}
                setRefundAmount={setRefundAmount}
                touched={refundTouched}
                setTouched={setRefundTouched}
              />

              {canManage && (
                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={createMutation.isPending}
                    className="w-full bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs py-3"
                  >
                    Save Purchase Return
                  </Button>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Right Column Table */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search purchase returns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] pl-10 pr-3.5 py-2 text-xs text-slate-800 transition focus:border-[#2449C6] focus:bg-white focus:outline-none"
              />
            </div>
            <span className="text-xs font-semibold text-slate-500">{filteredReturns.length} return record(s)</span>
          </div>

          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EAF1FA] flex items-center justify-between bg-gradient-to-r from-[#F5F8FF] to-white">
              <h3 className="font-bold text-[#0B1B45] text-sm flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-[#2449C6]" />
                Purchase Returns History
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#D5E3F7] bg-[#F5F8FF] text-xs font-bold uppercase tracking-wider text-slate-600">
                    <th className="px-3.5 py-2.5">Return #</th>
                    <th className="px-3.5 py-2.5">GRN #</th>
                    <th className="px-3.5 py-2.5">Supplier</th>
                    <th className="px-3.5 py-2.5 text-right">Amount</th>
                    <th className="px-3.5 py-2.5">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAF1FA]">
                  {filteredReturns.map((r) => (
                    <tr key={r.id} className="hover:bg-[#F8FAFD] transition">
                      <td className="px-3.5 py-2.5 font-mono font-bold text-[#0B1B45]">{r.return_no}</td>
                      <td className="px-3.5 py-2.5 font-mono text-slate-500 text-xs">{r.grn_no || '-'}</td>
                      <td className="px-3.5 py-2.5 font-bold text-[#0B1B45]">{r.supplier_name}</td>
                      <td className="px-3.5 py-2.5 text-right font-black text-[#2449C6] whitespace-nowrap">₹{Number(r.refund_amount ?? 0).toFixed(2)}</td>
                      <td className="px-3.5 py-2.5 text-slate-500 font-medium">{r.reason || '-'}</td>
                    </tr>
                  ))}
                  {filteredReturns.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-xs font-semibold">
                        No purchase returns recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Returns({ defaultTab }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const validTabs = ['returns', 'credit'];
  const tabFromUrl = searchParams.get('tab');
  
  let initialTab = tabFromUrl;
  if (initialTab === 'sales' || initialTab === 'purchase') initialTab = 'returns';
  if (initialTab === 'collections') initialTab = 'credit';
  if (!initialTab && defaultTab) initialTab = defaultTab;

  const activeTab = validTabs.includes(initialTab) ? initialTab : 'returns';

  const canSalesReturn = usePermission('returns.sales_return');
  const canApprove = usePermission('returns.approve_untraceable_return');
  const canPurchaseReturn = usePermission('returns.purchase_return');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D5E3F7] pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#0B1B45] flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0B1B45] to-[#2449C6] text-white shadow-xs">
              <RotateCcw className="w-5 h-5 text-[#E8C985]" />
            </span>
            Returns &amp; Credit Management
          </h1>
          <p className="text-xs font-semibold text-slate-500 mt-1">Manage customer sales returns, credit notes, supplier returns, and credit collections</p>
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onTabChange={(k) => setSearchParams({ tab: k })}
        tabs={[
          {
            key: 'returns',
            label: 'Returns',
            icon: RotateCcw,
            content: (
              <div className="space-y-4">
                <Tabs
                  tabs={[
                    { key: 'sales', label: 'Sales Returns', content: <SalesReturnsPanel canCreate={canSalesReturn} canApprove={canApprove} /> },
                    { key: 'purchase', label: 'Purchase Returns', content: <PurchaseReturnsPanel canManage={canPurchaseReturn} /> },
                  ]}
                />
              </div>
            ),
          },
          {
            key: 'credit',
            label: 'Credit',
            icon: Wallet,
            content: <Collections hideHeader />,
          },
        ]}
      />
    </div>
  );
}
