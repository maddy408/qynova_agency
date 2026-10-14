import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CheckCircle2, ArrowRightLeft, ShieldCheck } from 'lucide-react';
import { cashHandoversApi } from '../api/postsale';
import { usePermission } from '../hooks/usePermission';

export function CashHandover({ hideHeader = false }) {
  const queryClient = useQueryClient();
  const canSubmit = usePermission('handover.submit_cash_handover');
  const canVerify = usePermission('handover.verify_reconcile');
  const [submittedAmounts, setSubmittedAmounts] = useState({});
  const [verifyAmounts, setVerifyAmounts] = useState({});

  const pendingQuery = useQuery({ queryKey: ['handover-pending'], queryFn: cashHandoversApi.pending });
  const registerQuery = useQuery({ queryKey: ['handovers'], queryFn: cashHandoversApi.list });

  const submitMutation = useMutation({
    mutationFn: cashHandoversApi.submit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['handover-pending'] });
      queryClient.invalidateQueries({ queryKey: ['handovers'] });
    },
  });
  const verifyMutation = useMutation({
    mutationFn: ({ id, amount }) => cashHandoversApi.verify(id, amount),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['handovers'] }),
  });

  const pending = pendingQuery.data || [];
  const register = registerQuery.data || [];

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D5E3F7] pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#0B1B45] flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0B1B45] to-[#2449C6] text-white shadow-xs">
                <Banknote className="w-5 h-5" />
              </span>
              Cash Handover &amp; Reconciliation
            </h1>
            <p className="text-xs font-semibold text-slate-500 mt-1">
              Salesman daily collection cash transfers and end-of-day reconciliation verification
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EAF1FA] flex items-center justify-between bg-gradient-to-r from-[#F5F8FF] to-white">
          <h3 className="font-bold text-[#0B1B45] text-sm flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-[#2449C6]" />
            Pending Salesman Collections Ready for Handover
          </h3>
          <span className="text-xs font-semibold text-slate-500">{pending.length} pending salesman handover(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#D5E3F7] bg-[#F5F8FF] text-xs font-bold uppercase tracking-wider text-slate-600">
                <th className="px-3.5 py-2.5">Salesman</th>
                <th className="px-3.5 py-2.5 text-right">Cash Collected</th>
                <th className="px-3.5 py-2.5 text-right">Digital/UPI</th>
                <th className="px-3.5 py-2.5 text-right">Total</th>
                <th className="px-3.5 py-2.5 text-center">Cash Being Handed Over</th>
                <th className="px-3.5 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAF1FA]">
              {pending.map((p) => (
                <tr key={p.employee_id} className="hover:bg-[#F8FAFD] transition">
                  <td className="px-3.5 py-2.5 font-bold text-[#0B1B45]">{p.employee_name}</td>
                  <td className="px-3.5 py-2.5 text-right font-black text-emerald-700 whitespace-nowrap">₹{p.cash_amount}</td>
                  <td className="px-3.5 py-2.5 text-right font-semibold text-slate-600 whitespace-nowrap">₹{p.digital_amount}</td>
                  <td className="px-3.5 py-2.5 text-right font-black text-[#2449C6] whitespace-nowrap">₹{p.total_amount}</td>
                  <td className="px-3.5 py-2.5 text-center">
                    <input
                      type="number"
                      step="any"
                      placeholder={p.cash_amount}
                      value={submittedAmounts[p.employee_id] ?? ''}
                      onChange={(e) => setSubmittedAmounts((prev) => ({ ...prev, [p.employee_id]: e.target.value }))}
                      className="w-32 rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-1.5 text-sm font-semibold text-slate-800 transition focus:border-[#2449C6] focus:bg-white focus:outline-none"
                    />
                  </td>
                  <td className="px-3.5 py-2.5 text-right">
                    {canSubmit && (
                      <button
                        onClick={() =>
                          submitMutation.mutate({
                            employee_id: p.employee_id,
                            submitted_amount: Number(submittedAmounts[p.employee_id] ?? p.cash_amount),
                          })
                        }
                        disabled={submitMutation.isPending}
                        className="rounded-xl bg-gradient-to-r from-[#0B1B45] to-[#2449C6] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:from-[#142B5C] hover:to-[#315BFF] transition disabled:opacity-60"
                      >
                        Handover Cash
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {pending.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3.5 py-10 text-center text-slate-400 text-sm font-semibold">
                    Nothing pending handover.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EAF1FA] flex items-center justify-between bg-gradient-to-r from-[#F5F8FF] to-white">
          <h3 className="font-bold text-[#0B1B45] text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#2449C6]" />
            Reconciliation Audit Register
          </h3>
          <span className="text-xs font-semibold text-slate-500">{register.length} record(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#D5E3F7] bg-[#F5F8FF] text-xs font-bold uppercase tracking-wider text-slate-600">
                <th className="px-3.5 py-2.5">Handover #</th>
                <th className="px-3.5 py-2.5">Salesman</th>
                <th className="px-3.5 py-2.5 text-right">Submitted</th>
                <th className="px-3.5 py-2.5 text-right">Verified</th>
                <th className="px-3.5 py-2.5 text-right">Discrepancy</th>
                <th className="px-3.5 py-2.5 text-center">Status</th>
                <th className="px-3.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAF1FA]">
              {register.map((h) => (
                <tr key={h.id} className="hover:bg-[#F8FAFD] transition">
                  <td className="px-3.5 py-2.5 font-mono font-bold text-[#0B1B45]">{h.handover_no}</td>
                  <td className="px-3.5 py-2.5 font-medium text-slate-800">{h.employee_name}</td>
                  <td className="px-3.5 py-2.5 text-right font-black text-slate-800 whitespace-nowrap">₹{h.submitted_amount}</td>
                  <td className="px-3.5 py-2.5 text-right font-bold text-[#2449C6] whitespace-nowrap">{h.verified_amount ? `₹${h.verified_amount}` : '-'}</td>
                  <td className={`px-3.5 py-2.5 text-right font-black whitespace-nowrap ${h.discrepancy && Math.abs(h.discrepancy) > 0.009 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {h.discrepancy !== null && h.discrepancy !== undefined ? `₹${h.discrepancy}` : '-'}
                  </td>
                  <td className="px-3.5 py-2.5 text-center capitalize">
                    {h.status === 'verified' || h.status === 'approved' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        {h.status.replace('_', ' ')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        {h.status.replace('_', ' ')}
                      </span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 text-right">
                    {h.status === 'pending' && canVerify && (
                      <div className="flex items-center justify-end gap-1.5">
                        <input
                          type="number"
                          step="any"
                          placeholder="Counted"
                          value={verifyAmounts[h.id] ?? ''}
                          onChange={(e) => setVerifyAmounts((prev) => ({ ...prev, [h.id]: e.target.value }))}
                          className="w-24 rounded-lg border border-[#D5E3F7] bg-[#F8FAFD] px-2.5 py-1 text-sm font-semibold text-slate-800 transition focus:border-[#2449C6] focus:bg-white focus:outline-none"
                        />
                        <button
                          onClick={() => verifyMutation.mutate({ id: h.id, amount: Number(verifyAmounts[h.id] ?? h.submitted_amount) })}
                          disabled={verifyMutation.isPending}
                          className="rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 px-2.5 py-1 text-xs font-bold text-white shadow-xs hover:from-emerald-700 hover:to-emerald-800 transition"
                        >
                          Verify
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {register.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3.5 py-10 text-center text-slate-400 text-sm font-semibold">
                    No handovers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
