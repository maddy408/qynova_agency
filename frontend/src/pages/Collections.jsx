import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, Square, CreditCard, Wallet, X, CheckCircle2 } from 'lucide-react';
import { collectionsApi } from '../api/postsale';
import { usePermission } from '../hooks/usePermission';
import { Button } from '../components/Button.jsx';

function CollectModal({ customer, onClose }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState('fifo');
  const [amount, setAmount] = useState('');
  const [checkedIds, setCheckedIds] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const unpaidQuery = useQuery({
    queryKey: ['unpaid-invoices', customer.customer_id],
    queryFn: () => collectionsApi.unpaidInvoices(customer.customer_id),
  });
  const createMutation = useMutation({
    mutationFn: collectionsApi.create,
    onSuccess: (data) => {
      setSuccess(data);
      queryClient.invalidateQueries({ queryKey: ['collections-pending'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['unpaid-invoices', customer.customer_id] });
    },
  });

  const unpaid = unpaidQuery.data || [];

  let remaining = Number(amount || 0);
  const fifoPreview = unpaid.map((inv) => {
    const due = Number(inv.balance_due);
    const applied = Math.max(0, Math.min(remaining, due));
    remaining -= applied;
    return { ...inv, applied, remAfter: due - applied };
  });

  const toggleChecked = (id) => setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const checkedTotal = unpaid.filter((inv) => checkedIds.includes(inv.id)).reduce((sum, inv) => sum + Number(inv.balance_due), 0);

  const submit = async () => {
    setError('');
    try {
      if (mode === 'manual') {
        const allocations = unpaid
          .filter((inv) => checkedIds.includes(inv.id))
          .map((inv) => ({ invoice_id: inv.id, allocated_amount: Number(inv.balance_due) }));
        await createMutation.mutateAsync({
          customer_id: customer.customer_id,
          amount: checkedTotal,
          payment_method: paymentMethod,
          allocations,
        });
      } else {
        await createMutation.mutateAsync({ customer_id: customer.customer_id, amount: Number(amount), payment_method: paymentMethod });
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save');
    }
  };

  const canSubmit = mode === 'manual' ? checkedIds.length > 0 : !!amount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-[520px] rounded-3xl border border-[#D5E3F7] bg-white p-6 shadow-2xl">
        <div className="mb-2 flex items-center justify-between border-b border-[#EAF1FA] pb-3">
          <div className="text-lg font-bold text-[#0B1B45]">Collect from {customer.ledger_name}</div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-4 rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] p-3 text-xs font-medium text-slate-600 space-y-1">
          <div><span className="font-bold text-slate-500">Route:</span> {customer.route_id || '-'}</div>
          <div><span className="font-bold text-slate-500">Credit Limit:</span> ₹{customer.credit_limit} · <span className="font-bold text-rose-600">Outstanding:</span> ₹{customer.total_due}</div>
        </div>

        <div className="mb-4 flex gap-1 rounded-xl border border-[#D5E3F7] bg-[#EDF5FF] p-1 text-xs">
          <button
            type="button"
            onClick={() => setMode('fifo')}
            className={`flex-1 rounded-lg py-2 font-bold transition ${
              mode === 'fifo' ? 'bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs' : 'text-slate-600 hover:text-[#2449C6]'
            }`}
          >
            Auto (Oldest Bill First)
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`flex-1 rounded-lg py-2 font-bold transition ${
              mode === 'manual' ? 'bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs' : 'text-slate-600 hover:text-[#2449C6]'
            }`}
          >
            Select Invoices
          </button>
        </div>

        {mode === 'fifo' ? (
          <>
            <div className="mb-4 flex gap-2.5">
              <input
                type="number"
                step="any"
                placeholder="Amount collected"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full flex-1 rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 transition focus:border-[#2449C6] focus:outline-none"
              />
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-32 rounded-xl border border-[#D5E3F7] bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition focus:border-[#2449C6] focus:outline-none"
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="mb-4 max-h-56 overflow-auto rounded-2xl border border-[#D5E3F7]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F5F8FF] text-left text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-[#D5E3F7]">
                    <th className="px-3.5 py-2">Invoice</th>
                    <th className="px-3.5 py-2 text-right">Pending</th>
                    <th className="px-3.5 py-2 text-right">This Pay</th>
                    <th className="px-3.5 py-2 text-right">Rem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAF1FA]">
                  {fifoPreview.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#F8FAFD]">
                      <td className="px-3.5 py-2 font-mono font-bold text-[#0B1B45]">{inv.invoice_no}</td>
                      <td className="px-3.5 py-2 text-right font-semibold text-slate-600 whitespace-nowrap">₹{inv.balance_due}</td>
                      <td className="px-3.5 py-2 text-right font-black text-amber-600 whitespace-nowrap">₹{inv.applied.toFixed(2)}</td>
                      <td className="px-3.5 py-2 text-right font-semibold text-slate-500 whitespace-nowrap">₹{inv.remAfter.toFixed(2)}</td>
                    </tr>
                  ))}
                  {unpaid.length === 0 && (
                    <tr><td colSpan={4} className="px-3.5 py-6 text-center text-slate-400 text-sm font-semibold">No unpaid invoices.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {remaining > 0 && Number(amount) > 0 && (
              <div className="mb-4 rounded-xl bg-indigo-50 border border-indigo-200 p-3 text-xs text-indigo-700 font-medium">
                Note: ₹{remaining.toFixed(2)} extra amount will be credited to customer's advance balance and recorded in revenue/collections.
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-4 max-h-56 overflow-auto rounded-2xl border border-[#D5E3F7] divide-y divide-[#EAF1FA]">
              {unpaid.map((inv) => (
                <label key={inv.id} className="flex cursor-pointer items-center justify-between p-3 text-xs hover:bg-[#F8FAFD] transition">
                  <span className="flex items-center gap-2.5">
                    <input type="checkbox" checked={checkedIds.includes(inv.id)} onChange={() => toggleChecked(inv.id)} className="hidden" />
                    {checkedIds.includes(inv.id) ? (
                      <CheckSquare size={16} className="text-[#2449C6]" />
                    ) : (
                      <Square size={16} className="text-slate-400" />
                    )}
                    <span className="font-mono font-bold text-[#0B1B45]">{inv.invoice_no}</span>
                  </span>
                  <span className="font-black text-rose-600">₹{inv.balance_due}</span>
                </label>
              ))}
              {unpaid.length === 0 && (
                <div className="px-3 py-6 text-center text-xs font-semibold text-slate-400">No unpaid invoices.</div>
              )}
            </div>
            <div className="mb-4 flex items-center justify-between rounded-xl border border-[#D5E3F7] bg-gradient-to-r from-[#F8FAFD] to-[#EDF5FF] px-4 py-2.5">
              <span className="text-xs font-semibold text-slate-600">Selected Invoice Total</span>
              <span className="font-black text-[#0B1B45]">₹{checkedTotal.toFixed(2)}</span>
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-600">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 transition focus:border-[#2449C6] focus:outline-none"
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>
            </div>
          </>
        )}

        {error && <p className="mb-3 text-xs font-semibold text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">{error}</p>}
        {success && (
          <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Collected ₹{success.allocated_total} across {Object.keys(success.allocations).length} invoice(s).
          </div>
        )}

        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} className="border-[#D5E3F7]">Close</Button>
          <Button
            onClick={submit}
            disabled={!canSubmit}
            loading={createMutation.isPending}
            className="bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs"
          >
            Pay Now
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Collections({ hideHeader = false }) {
  const canCollect = usePermission('collections.field_collection_entry');
  const canViewAll = usePermission('credit.view_shopwide_outstanding');
  const [selected, setSelected] = useState(null);

  const pendingQuery = useQuery({ queryKey: ['collections-pending'], queryFn: () => collectionsApi.pending(), enabled: canViewAll });
  const historyQuery = useQuery({ queryKey: ['collections'], queryFn: collectionsApi.list });

  const pending = pendingQuery.data || [];
  const history = historyQuery.data || [];
  const routeTotal = pending.reduce((sum, c) => sum + Number(c.total_due), 0);
  const historyTotal = history.reduce((sum, c) => sum + Number(c.amount), 0);

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D5E3F7] pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#0B1B45] flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0B1B45] to-[#2449C6] text-white shadow-xs">
                <CreditCard className="w-5 h-5" />
              </span>
              Credit &amp; Collections Management
            </h1>
            <p className="text-xs font-semibold text-slate-500 mt-1">Customer credit balances, payments, and receipts</p>
          </div>
        </div>
      )}

      {canViewAll && (
        <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EAF1FA] flex flex-col sm:flex-row items-center justify-between gap-2 bg-gradient-to-r from-[#F5F8FF] to-white">
            <h3 className="font-bold text-[#0B1B45] text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[#2449C6]" />
              Route Pending Credit Balances
            </h3>
            <span className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
              Total pending: ₹{routeTotal.toFixed(2)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#D5E3F7] bg-[#F5F8FF] text-xs font-bold uppercase tracking-wider text-slate-600">
                  <th className="px-3.5 py-2.5">Customer</th>
                  <th className="px-3.5 py-2.5">Phone</th>
                  <th className="px-3.5 py-2.5 text-center">Unpaid Bills</th>
                  <th className="px-3.5 py-2.5 text-right">Total Due</th>
                  <th className="px-3.5 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAF1FA]">
                {pending.map((c) => (
                  <tr key={c.customer_id} className="hover:bg-[#F8FAFD] transition">
                    <td className="px-3.5 py-2.5 font-bold text-[#0B1B45]">{c.ledger_name}</td>
                    <td className="px-3.5 py-2.5 font-medium text-slate-600">{c.phone || '-'}</td>
                    <td className="px-3.5 py-2.5 text-center font-bold text-slate-700">{c.unpaid_invoice_count}</td>
                    <td className="px-3.5 py-2.5 text-right font-black text-rose-600 whitespace-nowrap">₹{c.total_due}</td>
                    <td className="px-3.5 py-2.5 text-right">
                      {canCollect && (
                        <button
                          onClick={() => setSelected(c)}
                          className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white text-xs font-bold shadow-xs hover:from-[#142B5C] hover:to-[#315BFF] transition"
                        >
                          Collect
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {pending.length === 0 && (
                  <tr><td colSpan={5} className="px-3.5 py-10 text-center text-slate-400 text-sm font-semibold">No customers with an outstanding balance.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EAF1FA] flex flex-col sm:flex-row items-center justify-between gap-2 bg-gradient-to-r from-[#F5F8FF] to-white">
          <h3 className="font-bold text-[#0B1B45] text-sm flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-[#2449C6]" />
            Past Collection Receipts
          </h3>
          <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
            Total collected: ₹{historyTotal.toFixed(2)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#D5E3F7] bg-[#F5F8FF] text-xs font-bold uppercase tracking-wider text-slate-600">
                <th className="px-3.5 py-2.5">Receipt #</th>
                <th className="px-3.5 py-2.5">Customer</th>
                <th className="px-3.5 py-2.5 text-right">Amount</th>
                <th className="px-3.5 py-2.5">Mode</th>
                <th className="px-3.5 py-2.5">Collected By</th>
                <th className="px-3.5 py-2.5">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAF1FA]">
              {history.map((c) => (
                <tr key={c.id} className="hover:bg-[#F8FAFD] transition">
                  <td className="px-3.5 py-2.5 font-mono font-bold text-[#0B1B45]">{c.receipt_no}</td>
                  <td className="px-3.5 py-2.5 font-semibold text-slate-800">{c.customer_name}</td>
                  <td className="px-3.5 py-2.5 text-right font-black text-[#2449C6] whitespace-nowrap">₹{c.amount}</td>
                  <td className="px-3.5 py-2.5 capitalize">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#EDF5FF] text-[#2449C6] border border-[#D5E3F7]">
                      {c.payment_method}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-slate-500 font-medium">{c.collected_by_name}</td>
                  <td className="px-3.5 py-2.5 text-slate-400 font-mono text-xs">{c.collected_at}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={6} className="px-3.5 py-10 text-center text-slate-400 text-sm font-semibold">No collections yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <CollectModal customer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
