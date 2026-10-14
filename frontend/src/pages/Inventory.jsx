import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Search, Plus, Trash2, CheckCircle2, AlertTriangle, Truck, SlidersHorizontal, X, FileSpreadsheet, FileDown } from 'lucide-react';
import { itemsApi } from '../api/catalog';
import { usersApi } from '../api/users';
import { stockAdjustmentsApi, stockHubApi, vanStockApi, vanStockIssuesApi } from '../api/purchasing';
import { Tabs } from '../components/Tabs';
import { usePermission } from '../hooks/usePermission';
import { Button } from '../components/Button.jsx';
import { downloadReportPdf, downloadVanIssuePdf } from '../utils/reportPdf';

function StockHubPanel() {
  const [ownerType, setOwnerType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const stockQuery = useQuery({
    queryKey: ['stock-hub', ownerType],
    queryFn: () => stockHubApi.list(ownerType ? { owner_type: ownerType } : {}),
  });
  const lowStockQuery = useQuery({ queryKey: ['stock-hub-low'], queryFn: stockHubApi.lowStock });

  const rows = stockQuery.data || [];
  const low = lowStockQuery.data || [];

  const filteredRows = rows.filter((r) => {
    return (
      r.item_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.item_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.owner_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const [exportError, setExportError] = useState('');
  const [exportingExcel, setExportingExcel] = useState(false);

  // Excel export goes server-side with the same owner_type filter (a fresh,
  // authoritative re-fetch); PDF is built client-side from filteredRows so
  // it also honors the live search box, which the server-side export can't
  // see. Both only ever include what's currently in view, never a full dump.
  const handleExportExcel = async () => {
    setExportError('');
    setExportingExcel(true);
    try {
      await stockHubApi.downloadExport(ownerType ? { owner_type: ownerType } : {});
    } catch (err) {
      setExportError(err?.response?.data?.error || err?.message || 'Unable to generate the Excel file. Please try again.');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPdf = () => {
    setExportError('');
    try {
      downloadReportPdf({
        title: 'Van / Salesman Stock',
        filtersText: ownerType ? `Owner type: ${ownerType}${searchQuery ? ` · Search: "${searchQuery}"` : ''}` : (searchQuery ? `Search: "${searchQuery}"` : 'All locations/owners'),
        columns: {
          item_name: 'Item', item_code: 'SKU', barcode: 'Barcode', unit_code: 'Unit', quantity_on_hand: 'Quantity',
          cost_price: 'Cost Price', selling_price: 'Selling Price', stock_value: 'Stock Value',
          owner_name: 'Van/Salesman', branch_name: 'Branch',
        },
        rows: filteredRows,
        filename: `van_salesman_stock_${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    } catch (err) {
      setExportError(err?.message || 'Unable to generate the PDF. Please try again.');
    }
  };

  return (
    <div className="space-y-4">
      {low.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 shadow-xs flex items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <strong className="font-bold text-amber-900">{low.length} Item(s) At or Below Minimum Stock:</strong>
            <p className="text-amber-800/90 mt-1 font-medium">{low.map((i) => `${i.item_name} (${i.item_code})`).join(', ')}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column Controls */}
        <div className="lg:col-span-4">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-6 space-y-5 sticky top-6">
            <div className="border-b border-[#EAF1FA] pb-3.5 flex items-center justify-between">
              <h2 className="font-bold text-[#0B1B45] text-base flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EDF5FF] border border-[#D5E3F7] text-[#2449C6]">
                  <SlidersHorizontal className="w-4 h-4" />
                </span>
                Filter Stock Hub
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Owner Location Type</label>
                <select
                  value={ownerType}
                  onChange={(e) => setOwnerType(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs text-slate-800 transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/20 focus:outline-none"
                >
                  <option value="">All Locations / Owners</option>
                  <option value="branch">Main Branch / Floor</option>
                  <option value="employee">Salesman Van Stock</option>
                </select>
              </div>

              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#F8FAFD] to-[#EDF5FF] border border-[#D5E3F7] space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-slate-600 font-medium">
                  <span>Total Distinct Records:</span>
                  <strong className="text-base font-black text-[#0B1B45]">{rows.length}</strong>
                </div>
                <div className="flex items-center justify-between text-slate-600 font-medium border-t border-[#D5E3F7]/60 pt-2">
                  <span>Low Stock Alerts:</span>
                  <strong className={`font-bold ${low.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{low.length}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column Table */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search stock by item or owner..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] pl-10 pr-3.5 py-2 text-xs text-slate-800 transition focus:border-[#2449C6] focus:bg-white focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 mr-1">{filteredRows.length} item(s)</span>
              <button
                onClick={handleExportExcel}
                disabled={exportingExcel}
                className="flex items-center gap-1.5 rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-[#EDF5FF] hover:text-[#2449C6] transition disabled:opacity-60"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                {exportingExcel ? 'Exporting…' : 'Export Excel'}
              </button>
              <button
                onClick={handleExportPdf}
                disabled={filteredRows.length === 0}
                className="flex items-center gap-1.5 rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-[#EDF5FF] hover:text-[#2449C6] transition disabled:opacity-60"
              >
                <FileDown className="h-3.5 w-3.5 text-rose-500" />
                Export PDF
              </button>
            </div>
          </div>
          {exportError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-600">
              {exportError}
            </div>
          )}

          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EAF1FA] flex items-center justify-between bg-gradient-to-r from-[#F5F8FF] to-white">
              <h3 className="font-bold text-[#0B1B45] text-sm flex items-center gap-2">
                <Package className="h-4 w-4 text-[#2449C6]" />
                Real-time Stock Inventory
              </h3>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#D5E3F7] bg-[#F5F8FF] text-xs font-bold uppercase tracking-wider text-slate-600">
                  <th className="px-3.5 py-2.5">Item Details</th>
                  <th className="px-3.5 py-2.5">Owner Type</th>
                  <th className="px-3.5 py-2.5">Location / Owner</th>
                  <th className="px-3.5 py-2.5 text-right">On Hand Qty</th>
                  <th className="px-3.5 py-2.5">Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAF1FA]">
                {filteredRows.map((r) => {
                  const isQtyLow = Number(r.quantity_on_hand) <= 0;
                  return (
                    <tr key={r.id} className="hover:bg-[#F8FAFD] transition">
                      <td className="px-3.5 py-2.5 font-medium text-slate-800">
                        <span className="font-bold text-[#0B1B45]">{r.item_name}</span>
                        <span className="text-slate-400 text-xs ml-1.5 font-mono">({r.item_code})</span>
                      </td>
                      <td className="px-3.5 py-2.5 capitalize">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#EDF5FF] text-[#2449C6] border border-[#D5E3F7]">
                          {r.owner_type}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-700 font-semibold">{r.owner_name}</td>
                      <td className="px-3.5 py-2.5 text-right font-black whitespace-nowrap">
                        {isQtyLow ? (
                          <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">{r.quantity_on_hand}</span>
                        ) : (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">{r.quantity_on_hand}</span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 font-semibold text-slate-500">{r.unit_code}</td>
                    </tr>
                  );
                })}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3.5 py-10 text-center text-slate-400 text-sm font-semibold">
                      No stock records matching search filters.
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

function StockAdjustmentPanel({ canManage }) {
  const queryClient = useQueryClient();
  const [itemId, setItemId] = useState('');
  const [adjustmentType, setAdjustmentType] = useState('deduction');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('damage');
  const [remarks, setRemarks] = useState('');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const itemsQuery = useQuery({ queryKey: ['items', ''], queryFn: () => itemsApi.list('') });
  const adjustmentsQuery = useQuery({ queryKey: ['stock-adjustments'], queryFn: stockAdjustmentsApi.list });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] });
    queryClient.invalidateQueries({ queryKey: ['stock-hub'] });
  };

  const createMutation = useMutation({
    mutationFn: stockAdjustmentsApi.create,
    onSuccess: () => {
      invalidate();
      resetForm();
      showSuccess('Stock adjustment logged successfully!');
    },
  });

  const resetForm = () => {
    setItemId('');
    setAdjustmentType('deduction');
    setQty('');
    setReason('damage');
    setRemarks('');
    setFormError('');
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!itemId) {
      setFormError('Please select an item.');
      return;
    }
    if (!qty || Number(qty) <= 0) {
      setFormError('Please enter a valid quantity.');
      return;
    }

    setFormError('');
    createMutation.mutate({
      item_id: Number(itemId),
      adjustment_type: adjustmentType,
      qty: Number(qty),
      reason,
      remarks: remarks || null,
    });
  };

  const items = itemsQuery.data || [];
  const adjustments = adjustmentsQuery.data || [];

  const filteredAdjustments = adjustments.filter((a) => {
    return (
      a.item_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.reason?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.created_by_name?.toLowerCase().includes(searchQuery.toLowerCase())
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
        <div className="lg:col-span-4">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-6 space-y-5 sticky top-6">
            <div className="border-b border-[#EAF1FA] pb-3.5 flex items-center justify-between">
              <h2 className="font-bold text-[#0B1B45] text-base flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EDF5FF] border border-[#D5E3F7] text-[#2449C6]">
                  <Plus className="w-4 h-4" />
                </span>
                New Stock Adjustment
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="text-xs text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-200">
                  {formError}
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Select Item *</label>
                <select
                  required
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/20 focus:outline-none"
                >
                  <option value="">-- Select Item --</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.item_name} ({i.item_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Type *</label>
                  <select
                    value={adjustmentType}
                    onChange={(e) => setAdjustmentType(e.target.value)}
                    className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 transition focus:border-[#2449C6] focus:outline-none capitalize"
                  >
                    <option value="addition">Addition (+)</option>
                    <option value="deduction">Deduction (-)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Qty *</label>
                  <input
                    required
                    type="number"
                    step="any"
                    min="0.01"
                    placeholder="1"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3 py-2.5 text-xs font-bold text-slate-800 transition focus:border-[#2449C6] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Reason *</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 transition focus:border-[#2449C6] focus:outline-none capitalize"
                >
                  <option value="damage">Damage</option>
                  <option value="spoilage">Spoilage</option>
                  <option value="count_correction">Count Correction</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Remarks / Note</label>
                <textarea
                  rows="2"
                  placeholder="Additional explanation..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs text-slate-800 transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/20 focus:outline-none"
                />
              </div>

              {canManage && (
                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={createMutation.isPending}
                    className="w-full bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs py-3"
                  >
                    Save Stock Adjustment
                  </Button>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Right Column Table */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search adjustments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] pl-10 pr-3.5 py-2 text-xs text-slate-800 transition focus:border-[#2449C6] focus:bg-white focus:outline-none"
              />
            </div>
            <span className="text-xs font-semibold text-slate-500">{filteredAdjustments.length} adjustment record(s)</span>
          </div>

          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EAF1FA] flex items-center justify-between bg-gradient-to-r from-[#F5F8FF] to-white">
              <h3 className="font-bold text-[#0B1B45] text-sm flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-[#2449C6]" />
                Stock Adjustment History
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#D5E3F7] bg-[#F5F8FF] text-xs font-bold uppercase tracking-wider text-slate-600">
                    <th className="px-3.5 py-2.5">Item</th>
                    <th className="px-3.5 py-2.5">Type</th>
                    <th className="px-3.5 py-2.5 text-right">Qty</th>
                    <th className="px-3.5 py-2.5">Reason</th>
                    <th className="px-3.5 py-2.5">By</th>
                    <th className="px-3.5 py-2.5">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAF1FA]">
                  {filteredAdjustments.map((a) => (
                    <tr key={a.id} className="hover:bg-[#F8FAFD] transition">
                      <td className="px-3.5 py-2.5 font-bold text-[#0B1B45]">{a.item_name}</td>
                      <td className="px-3.5 py-2.5 capitalize">
                        {a.adjustment_type === 'addition' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            + Addition
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            - Deduction
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-black text-slate-800 whitespace-nowrap">{a.qty}</td>
                      <td className="px-3.5 py-2.5 text-slate-600 font-semibold capitalize">{a.reason?.replace('_', ' ')}</td>
                      <td className="px-3.5 py-2.5 text-slate-500 font-medium">{a.created_by_name}</td>
                      <td className="px-3.5 py-2.5 text-slate-400 font-mono text-xs">{a.created_at}</td>
                    </tr>
                  ))}
                  {filteredAdjustments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3.5 py-10 text-center text-slate-400 text-sm font-semibold">
                        No adjustment records logged yet.
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

function VanStockPanel({ canManage }) {
  const queryClient = useQueryClient();
  const [employeeId, setEmployeeId] = useState('');
  const [mode, setMode] = useState('issue');
  const [lines, setLines] = useState([{ item_id: '', qty: 1 }]);
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);

  const usersQuery = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const itemsQuery = useQuery({ queryKey: ['items', ''], queryFn: () => itemsApi.list('') });
  const pendingQuery = useQuery({
    queryKey: ['van-pending', employeeId],
    queryFn: () => vanStockApi.pending(employeeId),
    enabled: !!employeeId,
  });
  const issuesQuery = useQuery({
    queryKey: ['van-issues', employeeId],
    queryFn: () => vanStockIssuesApi.list(employeeId || undefined),
  });

  const mutation = useMutation({
    mutationFn: (payload) => (mode === 'issue' ? vanStockApi.issue(payload) : vanStockApi.returnStock(payload)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['van-pending', employeeId] });
      queryClient.invalidateQueries({ queryKey: ['van-issues'] });
      queryClient.invalidateQueries({ queryKey: ['stock-hub'] });
      setLines([{ item_id: '', qty: 1 }]);
      setMessage(mode === 'issue' ? 'Stock issued to salesman successfully!' : 'Van stock return recorded.');
      setTimeout(() => setMessage(''), 3000);
    },
  });

  const updateLine = (idx, patch) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, { item_id: '', qty: 1 }]);
  const removeLine = (idx) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!employeeId) {
      setFormError('Please select a salesman.');
      return;
    }
    const validLines = lines.filter((l) => l.item_id);
    if (validLines.length === 0) {
      setFormError('Please add at least one item line.');
      return;
    }

    try {
      await mutation.mutateAsync({
        employee_id: Number(employeeId),
        items: validLines.map((l) => ({ item_id: Number(l.item_id), qty: Number(l.qty) })),
      });
    } catch (err) {
      setFormError(err?.response?.data?.error || 'Failed to process van stock');
    }
  };

  const users = usersQuery.data || [];
  const items = itemsQuery.data || [];
  const pending = pendingQuery.data || [];
  const issues = issuesQuery.data || [];
  const selectedEmployee = users.find((u) => String(u.id) === String(employeeId));

  const handleSelectEmployee = (value) => {
    setEmployeeId(value);
    setSelectedItemIds([]); // never carry a selection across salesmen (section 8)
  };

  const toggleSelectItem = (itemId) => setSelectedItemIds((prev) => (
    prev.includes(itemId) ? prev.filter((x) => x !== itemId) : [...prev, itemId]
  ));
  const toggleSelectAll = () => setSelectedItemIds((prev) => (
    prev.length === pending.length ? [] : pending.map((p) => p.item_id)
  ));

  const handleExportExcel = async () => {
    setExportError('');
    setExporting(true);
    try {
      await vanStockApi.downloadExport(employeeId, selectedItemIds);
    } catch (err) {
      setExportError(err?.response?.data?.error || err?.message || 'Unable to generate the Excel file. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportSelectedExcel = async () => {
    if (selectedItemIds.length === 0) {
      setExportError('Please select at least one record to export.');
      return;
    }
    await handleExportExcel();
  };

  const vanStockPdfRows = () => (selectedItemIds.length > 0 ? pending.filter((p) => selectedItemIds.includes(p.item_id)) : pending);

  const handleExportPdf = () => {
    setExportError('');
    if (pending.length === 0) {
      setExportError('No van stock data to export for this salesman.');
      return;
    }
    try {
      downloadReportPdf({
        title: 'Van / Salesman Stock Report',
        filtersText: `Salesman: ${selectedEmployee?.name || employeeId}${selectedItemIds.length > 0 ? ` · ${selectedItemIds.length} row(s) selected` : ''}`,
        columns: {
          item_name: 'Item', item_code: 'SKU', barcode: 'Barcode', unit_code: 'Unit',
          quantity_on_hand: 'On-hand Qty', cost_price: 'Cost Price', selling_price: 'Selling Price', stock_value: 'Stock Value',
        },
        rows: vanStockPdfRows(),
        filename: `Van_Stock_${(selectedEmployee?.name || employeeId).replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    } catch (err) {
      setExportError(err?.message || 'Unable to generate the PDF. Please try again.');
    }
  };

  const handlePrint = () => {
    setExportError('');
    const rows = vanStockPdfRows();
    if (rows.length === 0) {
      setExportError('No van stock data to print for this salesman.');
      return;
    }
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) {
      setExportError('Could not open the print window — check your browser\'s popup blocker.');
      return;
    }
    const tableRows = rows.map((r) => `
      <tr>
        <td>${r.item_name}</td><td>${r.item_code || '-'}</td><td>${r.unit_code || '-'}</td>
        <td style="text-align:right">${r.quantity_on_hand}</td>
      </tr>`).join('');
    win.document.write(`
      <html><head><title>Van Stock — ${selectedEmployee?.name || ''}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #111; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; font-size: 12px; text-align: left; }
        th { background: #f1f5f9; }
      </style></head>
      <body>
        <h1>SALESMAN VAN STOCK REPORT</h1>
        <div class="meta">Salesman: ${selectedEmployee?.name || employeeId}<br/>Date: ${new Date().toLocaleDateString()}</div>
        <table>
          <thead><tr><th>Item</th><th>SKU</th><th>Unit</th><th>Qty</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  const [selectedIssueIds, setSelectedIssueIds] = useState([]);
  const [issueExportError, setIssueExportError] = useState('');
  const [issueExporting, setIssueExporting] = useState(false);

  const toggleSelectIssue = (id) => setSelectedIssueIds((prev) => (
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  ));
  const toggleSelectAllIssues = () => setSelectedIssueIds((prev) => (
    prev.length === issues.length ? [] : issues.map((i) => i.id)
  ));

  const handleExportIssuesExcel = async () => {
    setIssueExportError('');
    setIssueExporting(true);
    try {
      await vanStockIssuesApi.downloadExport(selectedIssueIds.length > 0 ? selectedIssueIds : issues.map((i) => i.id));
    } catch (err) {
      setIssueExportError(err?.response?.data?.error || err?.message || 'Unable to generate the Excel file. Please try again.');
    } finally {
      setIssueExporting(false);
    }
  };

  const handleExportSelectedIssuesExcel = async () => {
    if (selectedIssueIds.length === 0) {
      setIssueExportError('Please select at least one issue transaction to export.');
      return;
    }
    await handleExportIssuesExcel();
  };

  const handleIssuesPdfOrPrint = async (print) => {
    setIssueExportError('');
    const ids = selectedIssueIds.length > 0 ? selectedIssueIds : issues.map((i) => i.id);
    if (ids.length === 0) {
      setIssueExportError('No issue transactions to export.');
      return;
    }
    setIssueExporting(true);
    try {
      const detailRows = await vanStockIssuesApi.detail(ids);
      if (detailRows.length === 0) {
        setIssueExportError('No issue transactions to export.');
        return;
      }
      const singleIssueNo = ids.length === 1 ? detailRows[0]?.issue_no : null;
      downloadVanIssuePdf(
        detailRows,
        singleIssueNo ? `${singleIssueNo}.pdf` : `Van_Stock_Issues_${new Date().toISOString().slice(0, 10)}.pdf`,
        { print }
      );
    } catch (err) {
      setIssueExportError(err?.response?.data?.error || err?.message || 'Unable to generate the PDF. Please try again.');
    } finally {
      setIssueExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column Form */}
        <div className="lg:col-span-5">
          {canManage && (
            <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-6 space-y-5 sticky top-6">
              <div className="border-b border-[#EAF1FA] pb-3.5 flex items-center justify-between">
                <h2 className="font-bold text-[#0B1B45] text-base flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EDF5FF] border border-[#D5E3F7] text-[#2449C6]">
                    <Truck className="w-4 h-4" />
                  </span>
                  Van Stock Operations
                </h2>
                <div className="flex gap-1 bg-[#EDF5FF] p-1 rounded-xl border border-[#D5E3F7]">
                  <button
                    type="button"
                    onClick={() => setMode('issue')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      mode === 'issue'
                        ? 'bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs'
                        : 'text-slate-600 hover:text-[#2449C6]'
                    }`}
                  >
                    Issue Stock
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('return')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      mode === 'return'
                        ? 'bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs'
                        : 'text-slate-600 hover:text-[#2449C6]'
                    }`}
                  >
                    Day-end Return
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {formError && (
                  <div className="text-xs text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-200">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Salesman *</label>
                  <select
                    required
                    value={employeeId}
                    onChange={(e) => handleSelectEmployee(e.target.value)}
                    className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/20 focus:outline-none"
                  >
                    <option value="">-- Select Salesman --</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role_name})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">Stock Lines *</label>
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
                        min="0.01"
                        placeholder="Qty"
                        value={line.qty}
                        onChange={(e) => updateLine(idx, { qty: e.target.value })}
                        className="rounded-lg border border-[#D5E3F7] bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 w-20 transition focus:border-[#2449C6] focus:outline-none"
                      />
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
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

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={mutation.isPending}
                    disabled={!employeeId}
                    className="w-full bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs py-3"
                  >
                    {mode === 'issue' ? 'Issue Stock to Salesman' : 'Save Van Stock Return'}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Right Column Table */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EAF1FA] flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-[#F5F8FF] to-white">
              <h3 className="font-bold text-[#0B1B45] text-sm flex items-center gap-2">
                <Truck className="h-4 w-4 text-[#2449C6]" />
                Salesman Active Van Stock
              </h3>
              <span className="text-xs font-semibold text-slate-500">
                {selectedEmployee ? `Salesman: ${selectedEmployee.name}` : 'Select salesman to view live balance'}
              </span>
            </div>
            {employeeId && (
              <div className="px-5 py-3 border-b border-[#EAF1FA] flex flex-wrap items-center gap-2 bg-[#F8FAFD]">
                <button
                  onClick={handlePrint}
                  className="rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-[#EDF5FF] hover:text-[#2449C6] transition"
                >
                  Print
                </button>
                <button
                  onClick={handleExportPdf}
                  className="rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-[#EDF5FF] hover:text-[#2449C6] transition"
                >
                  Download PDF
                </button>
                <button
                  onClick={handleExportExcel}
                  disabled={exporting}
                  className="rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-[#EDF5FF] hover:text-[#2449C6] transition disabled:opacity-60"
                >
                  {exporting ? 'Exporting…' : 'Export Excel'}
                </button>
                <button
                  onClick={handleExportSelectedExcel}
                  disabled={exporting}
                  className="rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-[#EDF5FF] hover:text-[#2449C6] transition disabled:opacity-60"
                >
                  Export Selected
                </button>
                {selectedItemIds.length > 0 && (
                  <span className="text-xs font-bold text-[#2449C6] ml-auto">{selectedItemIds.length} selected</span>
                )}
              </div>
            )}
            {exportError && (
              <div className="mx-5 mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-600">
                {exportError}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#D5E3F7] bg-[#F5F8FF] text-xs font-bold uppercase tracking-wider text-slate-600">
                    <th className="w-8 px-3.5 py-2.5">
                      {pending.length > 0 && (
                        <input
                          type="checkbox"
                          checked={selectedItemIds.length === pending.length}
                          onChange={toggleSelectAll}
                          className="rounded border-[#D5E3F7] text-[#2449C6] focus:ring-[#2449C6]"
                        />
                      )}
                    </th>
                    <th className="px-3.5 py-2.5">Item</th>
                    <th className="px-3.5 py-2.5">SKU</th>
                    <th className="px-3.5 py-2.5">Unit</th>
                    <th className="px-3.5 py-2.5 text-right">Salesman On-hand Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAF1FA]">
                  {pending.map((p) => (
                    <tr key={p.item_id} className="hover:bg-[#F8FAFD] transition">
                      <td className="px-3.5 py-2.5">
                        <input
                          type="checkbox"
                          checked={selectedItemIds.includes(p.item_id)}
                          onChange={() => toggleSelectItem(p.item_id)}
                          className="rounded border-[#D5E3F7] text-[#2449C6] focus:ring-[#2449C6]"
                        />
                      </td>
                      <td className="px-3.5 py-2.5 font-bold text-[#0B1B45]">{p.item_name}</td>
                      <td className="px-3.5 py-2.5 text-slate-500 font-mono text-xs">{p.item_code || '-'}</td>
                      <td className="px-3.5 py-2.5 font-semibold text-slate-500">{p.unit_code || '-'}</td>
                      <td className="px-3.5 py-2.5 text-right font-black text-emerald-700 whitespace-nowrap">
                        <span className="bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                          {p.quantity_on_hand}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(!employeeId || pending.length === 0) && (
                    <tr>
                      <td colSpan={5} className="px-3.5 py-10 text-center text-slate-400 text-sm font-semibold">
                        {employeeId ? 'No active van stock assigned to this salesman.' : 'Select a salesman on the left form.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EAF1FA] flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-[#F5F8FF] to-white">
              <h3 className="font-bold text-[#0B1B45] text-sm flex items-center gap-2">
                <Truck className="h-4 w-4 text-[#2449C6]" />
                Issue Transactions
              </h3>
              <span className="text-xs font-semibold text-slate-500">
                {selectedEmployee ? `Salesman: ${selectedEmployee.name}` : 'All salesmen'}
              </span>
            </div>
            <div className="px-5 py-3 border-b border-[#EAF1FA] flex flex-wrap items-center gap-2 bg-[#F8FAFD]">
              <button
                onClick={() => handleIssuesPdfOrPrint(true)}
                className="rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-[#EDF5FF] hover:text-[#2449C6] transition"
              >
                Print
              </button>
              <button
                onClick={() => handleIssuesPdfOrPrint(false)}
                className="rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-[#EDF5FF] hover:text-[#2449C6] transition"
              >
                Download PDF
              </button>
              <button
                onClick={handleExportIssuesExcel}
                disabled={issueExporting}
                className="rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-[#EDF5FF] hover:text-[#2449C6] transition disabled:opacity-60"
              >
                {issueExporting ? 'Exporting…' : 'Export Excel'}
              </button>
              <button
                onClick={handleExportSelectedIssuesExcel}
                disabled={issueExporting}
                className="rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-[#EDF5FF] hover:text-[#2449C6] transition disabled:opacity-60"
              >
                Export Selected
              </button>
              {selectedIssueIds.length > 0 && (
                <span className="text-xs font-bold text-[#2449C6] ml-auto">{selectedIssueIds.length} selected</span>
              )}
            </div>
            {issueExportError && (
              <div className="mx-5 mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-600">
                {issueExportError}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#D5E3F7] bg-[#F5F8FF] text-xs font-bold uppercase tracking-wider text-slate-600">
                    <th className="w-8 px-3.5 py-2.5">
                      {issues.length > 0 && (
                        <input
                          type="checkbox"
                          checked={selectedIssueIds.length === issues.length}
                          onChange={toggleSelectAllIssues}
                          className="rounded border-[#D5E3F7] text-[#2449C6] focus:ring-[#2449C6]"
                        />
                      )}
                    </th>
                    <th className="px-3.5 py-2.5">Issue #</th>
                    <th className="px-3.5 py-2.5">Salesman</th>
                    <th className="px-3.5 py-2.5">Date</th>
                    <th className="px-3.5 py-2.5">Items</th>
                    <th className="px-3.5 py-2.5 text-right">Total Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAF1FA]">
                  {issues.map((i) => (
                    <tr key={i.id} className="hover:bg-[#F8FAFD] transition">
                      <td className="px-3.5 py-2.5">
                        <input
                          type="checkbox"
                          checked={selectedIssueIds.includes(i.id)}
                          onChange={() => toggleSelectIssue(i.id)}
                          className="rounded border-[#D5E3F7] text-[#2449C6] focus:ring-[#2449C6]"
                        />
                      </td>
                      <td className="px-3.5 py-2.5 font-mono font-bold text-[#0B1B45]">{i.issue_no}</td>
                      <td className="px-3.5 py-2.5 font-bold text-slate-800">{i.employee_name}</td>
                      <td className="px-3.5 py-2.5 text-slate-500 font-mono text-xs">{i.issued_at}</td>
                      <td className="px-3.5 py-2.5 font-semibold text-slate-600">{i.item_count} item(s)</td>
                      <td className="px-3.5 py-2.5 text-right font-black text-[#2449C6] whitespace-nowrap">{i.total_qty}</td>
                    </tr>
                  ))}
                  {issues.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-xs font-semibold">
                        No issue transactions found.
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

export function Inventory() {
  const canView = usePermission('inventory.view_stock');
  const canAdjust = usePermission('inventory.stock_adjustment');
  const canIssue = usePermission('inventory.issue_van_stock');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D5E3F7] pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#0B1B45] flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0B1B45] to-[#2449C6] text-white shadow-xs">
              <Package className="w-5 h-5" />
            </span>
            Inventory &amp; Stock Hub
          </h1>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            Monitor real-time warehouse inventory, stock adjustments, and van stock allocations
          </p>
        </div>
      </div>

      <Tabs
        tabs={[
          { key: 'hub', label: 'Stock Hub', content: canView ? <StockHubPanel /> : <p className="text-slate-400 p-4 font-semibold">No access.</p> },
          { key: 'adjust', label: 'Stock Adjustment', content: <StockAdjustmentPanel canManage={canAdjust} /> },
          { key: 'van', label: 'Van / Salesman Stock', content: <VanStockPanel canManage={canIssue} /> },
        ]}
      />
    </div>
  );
}

