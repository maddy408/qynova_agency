import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, Search, Plus, Trash2, CheckCircle2, Pencil, X, DollarSign, CreditCard, FileSpreadsheet } from 'lucide-react';
import { itemsApi } from '../api/catalog';
import { suppliersApi } from '../api/parties';
import { purchasesApi, supplierPaymentsApi } from '../api/purchasing';
import { Tabs } from '../components/Tabs';
import { Button } from '../components/Button.jsx';
import { usePermission } from '../hooks/usePermission';
import { resolveUnitPricing } from '../utils/pricing';
import { downloadReportPdf, downloadGrnPdf } from '../utils/reportPdf';

function priceGrnLine(line) {
  const qty = Number(line.qty || 0);
  const freeQty = Number(line.free_qty || 0);
  const rate = Number(line.rate || 0);
  const gross = round2(qty * rate);
  const discountPercent = Number(line.discount_percent || 0);
  const discountAmount =
    line.discount_mode === 'amount' && line.discount_amount !== ''
      ? Number(line.discount_amount || 0)
      : round2((gross * discountPercent) / 100);
  const taxable = round2(gross - discountAmount);
  const taxPercent = Number(line.tax_percent || 0);
  const taxAmount = round2((taxable * taxPercent) / 100);
  return {
    qty,
    freeQty,
    totalQty: round2(qty + freeQty),
    gross,
    discountAmount,
    taxable,
    taxAmount,
    netAmount: round2(taxable + taxAmount),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function PurchaseItemLineEditor({ lines, setLines, items, unitsByItemId, onPickItem }) {
  const addLine = () =>
    setLines((prev) => [
      ...prev,
      {
        key: `${Date.now()}`,
        item_id: '',
        unit_id: '',
        qty: 1,
        free_qty: 0,
        mrp: '',
        rate: '',
        discount_mode: 'percent',
        discount_percent: 0,
        discount_amount: '',
        tax_percent: 0,
      },
    ]);
  const updateLine = (key, patch) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key) => setLines((prev) => prev.filter((l) => l.key !== key));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">GRN Item Lines <span className="text-red-500">*</span></label>
      </div>

      {lines.map((line) => {
        const item = items.find((i) => i.id === Number(line.item_id));
        const priced = priceGrnLine(line);
        const availableUnits = unitsByItemId[line.item_id] || (item ? [{ id: item.base_unit_id, short_code: item.base_unit_code }] : []);
        return (
          <div key={line.key} className="rounded-xl border border-[#D5E3F7] p-3.5 bg-[#F8FAFD] space-y-2.5">
            <div className="flex items-center gap-2">
              <select
                value={line.item_id}
                onChange={(e) => {
                  const picked = items.find((i) => i.id === Number(e.target.value));
                  const pricing = picked ? resolveUnitPricing(picked, picked.base_unit_id) : null;
                  updateLine(line.key, {
                    item_id: e.target.value,
                    unit_id: picked ? picked.base_unit_id : '',
                    mrp: pricing ? pricing.mrp : '',
                    rate: pricing ? pricing.net_purrate : '',
                  });
                  if (picked) onPickItem(picked.id);
                }}
                className="flex-1 rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
              >
                <option value="">Select Item</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.item_name} ({i.item_code})
                  </option>
                ))}
              </select>
              <select
                value={line.unit_id}
                onChange={(e) => {
                  const unitId = e.target.value;
                  if (item) {
                    const pricing = resolveUnitPricing(item, unitId ? Number(unitId) : null);
                    updateLine(line.key, { unit_id: unitId, mrp: pricing.mrp, rate: pricing.net_purrate });
                  } else {
                    updateLine(line.key, { unit_id: unitId });
                  }
                }}
                className="w-24 rounded-xl border border-[#D5E3F7] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
              >
                <option value="">Unit</option>
                {availableUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.short_code}
                  </option>
                ))}
              </select>
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                  title="Remove Line"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5">Qty</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={line.qty}
                  onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                  className="w-full rounded-lg border border-[#D5E3F7] bg-white px-2 py-1 text-xs font-semibold text-slate-900 focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5">Free Qty</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={line.free_qty}
                  onChange={(e) => updateLine(line.key, { free_qty: e.target.value })}
                  className="w-full rounded-lg border border-[#D5E3F7] bg-white px-2 py-1 text-xs font-semibold text-slate-900 focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5">MRP</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={line.mrp}
                  onChange={(e) => updateLine(line.key, { mrp: e.target.value })}
                  className="w-full rounded-lg border border-[#D5E3F7] bg-white px-2 py-1 text-xs font-semibold text-slate-900 focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5">Pur Rate</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={line.rate}
                  onChange={(e) => updateLine(line.key, { rate: e.target.value })}
                  className="w-full rounded-lg border border-[#D5E3F7] bg-white px-2 py-1 text-xs font-semibold text-slate-900 focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5">Disc (%)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  value={line.discount_percent}
                  onChange={(e) => updateLine(line.key, { discount_percent: e.target.value })}
                  className="w-full rounded-lg border border-[#D5E3F7] bg-white px-2 py-1 text-xs font-semibold text-slate-900 focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5">Tax (%)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={line.tax_percent}
                  onChange={(e) => updateLine(line.key, { tax_percent: e.target.value })}
                  className="w-full rounded-lg border border-[#D5E3F7] bg-white px-2 py-1 text-xs font-semibold text-slate-900 focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-600 pt-1.5 border-t border-[#D5E3F7]">
              <span>Total Qty: <strong className="text-slate-900">{priced.totalQty}</strong></span>
              <span>Net: <strong className="text-[#2449C6] font-bold">₹{priced.netAmount.toFixed(2)}</strong></span>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addLine}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2449C6] hover:text-[#142B5C] py-1 transition"
      >
        <Plus size={14} /> Add Another Item
      </button>
    </div>
  );
}

const emptyGrnLine = () => ({
  key: `${Date.now()}-${Math.random()}`,
  item_id: '',
  unit_id: '',
  qty: 1,
  free_qty: 0,
  mrp: '',
  rate: '',
  discount_mode: 'percent',
  discount_percent: 0,
  discount_amount: '',
  tax_percent: 0,
});

function GrnFormCard({ editing, onDone, items, unitsByItemId, onPickItem }) {
  const queryClient = useQueryClient();
  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list });
  const [supplierId, setSupplierId] = useState(editing?.supplier_id ?? '');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState(editing?.supplier_invoice_no ?? '');
  const [paymentMode, setPaymentMode] = useState(editing?.payment_mode ?? 'credit');
  const [paidAmount, setPaidAmount] = useState(editing?.paid_amount ?? 0);
  const [lines, setLines] = useState(
    editing
      ? editing.items.map((it) => ({
          key: `${it.id}`,
          item_id: it.item_id,
          unit_id: it.unit_id,
          qty: Number(it.qty),
          free_qty: Number(it.free_qty),
          mrp: it.mrp ?? '',
          rate: Number(it.rate),
          discount_mode: Number(it.discount_amount) > 0 && Number(it.discount_percent) === 0 ? 'amount' : 'percent',
          discount_percent: Number(it.discount_percent),
          discount_amount: Number(it.discount_amount) || '',
          tax_percent: Number(it.tax_percent),
        }))
      : [emptyGrnLine()]
  );
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  const suppliers = suppliersQuery.data || [];
  const isEdit = !!editing;

  const buildPayload = () => ({
    supplier_id: Number(supplierId),
    supplier_invoice_no: supplierInvoiceNo || null,
    payment_mode: paymentMode,
    paid_amount: Number(paidAmount || 0),
    items: lines
      .filter((l) => l.item_id)
      .map((l) => ({
        item_id: Number(l.item_id),
        unit_id: l.unit_id ? Number(l.unit_id) : undefined,
        qty: Number(l.qty),
        free_qty: Number(l.free_qty || 0),
        mrp: l.mrp !== '' ? Number(l.mrp) : undefined,
        rate: Number(l.rate),
        ...(l.discount_mode === 'amount'
          ? { discount_amount: Number(l.discount_amount || 0) }
          : { discount_percent: Number(l.discount_percent || 0) }),
        tax_percent: Number(l.tax_percent || 0),
      })),
  });

  const createMutation = useMutation({
    mutationFn: purchasesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      setSupplierId('');
      setSupplierInvoiceNo('');
      setPaymentMode('credit');
      setPaidAmount(0);
      setLines([emptyGrnLine()]);
      onDone();
    },
    onError: (err) => {
      setError(err?.response?.data?.error || 'Failed to save GRN');
      setConfirming(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => purchasesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      onDone();
    },
    onError: (err) => {
      setError(err?.response?.data?.error || 'Failed to update GRN');
      setConfirming(false);
    },
  });

  const submit = () => {
    setError('');
    if (isEdit) updateMutation.mutate({ id: editing.id, data: buildPayload() });
    else createMutation.mutate(buildPayload());
  };

  const validLines = lines.filter((l) => l.item_id);
  const priced = validLines.map((l) => priceGrnLine(l));
  const totals = priced.reduce(
    (acc, p) => ({
      qty: acc.qty + p.qty,
      freeQty: acc.freeQty + p.freeQty,
      totalQty: acc.totalQty + p.totalQty,
      gross: acc.gross + p.gross,
      discount: acc.discount + p.discountAmount,
      net: acc.net + p.netAmount,
    }),
    { qty: 0, freeQty: 0, totalQty: 0, gross: 0, discount: 0, net: 0 }
  );

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-5 space-y-4 sticky top-6">
      <div className="flex items-center justify-between border-b border-[#D5E3F7] pb-3">
        <h2 className="text-base font-bold text-[#0B1B45] flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EDF5FF] text-[#2449C6]">
            {isEdit ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </span>
          {isEdit ? `Edit ${editing.grn_no}` : 'New GRN (Goods Received)'}
        </h2>
        {isEdit && (
          <button onClick={onDone} className="text-xs font-bold text-[#2449C6] hover:underline">
            Cancel Edit
          </button>
        )}
      </div>

      <div className="space-y-3.5">
        {error && <div className="text-xs font-semibold text-red-800 bg-red-50 p-2.5 rounded-xl border border-red-200">{error}</div>}

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">Supplier <span className="text-red-500">*</span></label>
          <select
            required
            disabled={isEdit}
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all disabled:opacity-60"
          >
            <option value="">-- Select Supplier --</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">Supplier Invoice #</label>
            <input
              type="text"
              placeholder="INV-98765"
              value={supplierInvoiceNo}
              onChange={(e) => setSupplierInvoiceNo(e.target.value)}
              className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">Payment Mode</label>
            <select
              disabled={isEdit}
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all disabled:opacity-60"
            >
              <option value="credit">Credit</option>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">Paid Amount (₹)</label>
          <input
            disabled={isEdit}
            type="number"
            step="any"
            placeholder="0.00"
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value)}
            className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all disabled:opacity-60"
          />
        </div>

        <PurchaseItemLineEditor
          lines={lines}
          setLines={setLines}
          items={items}
          unitsByItemId={unitsByItemId}
          onPickItem={onPickItem}
        />

        <div className="p-3.5 rounded-xl bg-gradient-to-br from-[#EDF5FF] to-[#F5F8FF] border border-[#D5E3F7] space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>Total Qty: <strong className="text-slate-900">{totals.qty}</strong></span>
            <span>Free Qty: <strong className="text-slate-900">{totals.freeQty}</strong></span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Gross Total: <strong className="text-slate-900">₹{totals.gross.toFixed(2)}</strong></span>
            <span>Discount: <strong className="text-slate-900">₹{totals.discount.toFixed(2)}</strong></span>
          </div>
          <div className="flex justify-between text-slate-900 font-bold text-sm pt-2 border-t border-[#D5E3F7]">
            <span>Grand Total:</span>
            <span className="text-[#2449C6] text-base font-extrabold">₹{totals.net.toFixed(2)}</span>
          </div>
        </div>

        {confirming && isEdit ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-900 space-y-2">
            <p className="font-bold">Confirm GRN Update?</p>
            <p className="text-[11px] text-amber-700">Stock and supplier balances will be recalculated.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={saving}>
                Back
              </Button>
              <Button variant="primary" onClick={submit} loading={saving}>
                Confirm Update
              </Button>
            </div>
          </div>
        ) : (
          <div className="pt-2">
            <Button
              type="button"
              variant="primary"
              onClick={() => (isEdit ? setConfirming(true) : submit())}
              disabled={!supplierId || validLines.length === 0 || saving}
              loading={saving}
              className="w-full justify-center py-2.5 text-xs font-bold"
            >
              {isEdit ? 'Save Changes' : 'Save GRN & Update Stock'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function GrnPanel({ canManage, canEdit, canViewCost, canDelete }) {
  const queryClient = useQueryClient();
  const [editingGrn, setEditingGrn] = useState(undefined);
  const [unitsByItemId, setUnitsByItemId] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);

  const purchasesQuery = useQuery({ queryKey: ['purchases'], queryFn: purchasesApi.list });
  const itemsQuery = useQuery({ queryKey: ['items', ''], queryFn: () => itemsApi.list('') });

  const deleteMutation = useMutation({
    mutationFn: purchasesApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchases'] }),
  });

  const onPickItem = async (itemId) => {
    if (unitsByItemId[itemId]) return;
    const full = await itemsApi.get(itemId);
    const purchaseUnits = (full.unit_conversions || []).filter((uc) => Number(uc.is_purchase_unit));
    const options = [
      { id: full.base_unit_id, short_code: full.base_unit_code },
      ...purchaseUnits.map((uc) => ({ id: uc.unit_id, short_code: uc.short_code })),
    ];
    // The secondary unit (S-UNIT) lives on the item row, not in
    // item_unit_conversions — add it explicitly so it's selectable here too.
    if (full.secondary_unit_id && !options.some((o) => o.id === full.secondary_unit_id)) {
      options.push({ id: full.secondary_unit_id, short_code: full.secondary_unit_code });
    }
    setUnitsByItemId((prev) => ({ ...prev, [itemId]: options }));
  };

  const openEdit = async (p) => setEditingGrn(await purchasesApi.get(p.id));

  const purchases = purchasesQuery.data || [];
  const items = itemsQuery.data || [];

  const filteredPurchases = purchases.filter((p) => {
    return (
      p.grn_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.supplier_invoice_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.status?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const toggleSelect = (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleSelectAll = () => setSelectedIds((prev) => (
    prev.length === filteredPurchases.length ? [] : filteredPurchases.map((p) => p.id)
  ));

  // Export always honors the current search filter — "selected" narrows
  // further to just the checked rows within that filtered set (section 16).
  const handleExportExcel = async () => {
    setExportError('');
    setExporting(true);
    try {
      await purchasesApi.downloadExport(filteredPurchases.map((p) => p.id));
    } catch (err) {
      setExportError(err?.response?.data?.error || err?.message || 'Unable to generate the Excel file. Please try again.');
    } finally {
      setExporting(false);
    }
  };
  const handleExportSelectedExcel = async () => {
    if (selectedIds.length === 0) {
      setExportError('Please select at least one record to export.');
      return;
    }
    setExportError('');
    setExporting(true);
    try {
      await purchasesApi.downloadExport(selectedIds);
    } catch (err) {
      setExportError(err?.response?.data?.error || err?.message || 'Unable to generate the Excel file. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Download PDF / Print both build a real item-level GRN document (one
  // page per GRN, with supplier + item + totals detail) from the backend's
  // flattened line rows — never a header-only summary table.
  const handleExportPdf = async () => {
    setExportError('');
    const ids = selectedIds.length > 0 ? selectedIds : filteredPurchases.map((p) => p.id);
    if (ids.length === 0) {
      setExportError('No GRN records to export.');
      return;
    }
    setExporting(true);
    try {
      const detailRows = await purchasesApi.detail(ids);
      if (detailRows.length === 0) {
        setExportError('No GRN records to export.');
        return;
      }
      const singleGrnNo = ids.length === 1 ? detailRows[0]?.grn_no : null;
      downloadGrnPdf(detailRows, singleGrnNo ? `${singleGrnNo}.pdf` : `GRN_Purchases_${new Date().toISOString().slice(0, 10)}.pdf`, { print: false });
    } catch (err) {
      setExportError(err?.response?.data?.error || err?.message || 'Unable to generate the PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = async () => {
    setExportError('');
    const ids = selectedIds.length > 0 ? selectedIds : filteredPurchases.map((p) => p.id);
    if (ids.length === 0) {
      setExportError('No GRN records to print.');
      return;
    }
    setExporting(true);
    try {
      const detailRows = await purchasesApi.detail(ids);
      if (detailRows.length === 0) {
        setExportError('No GRN records to print.');
        return;
      }
      const singleGrnNo = ids.length === 1 ? detailRows[0]?.grn_no : null;
      downloadGrnPdf(detailRows, singleGrnNo ? `${singleGrnNo}.pdf` : `GRN_Purchases_${new Date().toISOString().slice(0, 10)}.pdf`, { print: true });
    } catch (err) {
      setExportError(err?.response?.data?.error || err?.message || 'Unable to generate the PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left Column Form */}
      <div className="lg:col-span-5">
        {(canManage || editingGrn) && (
          <GrnFormCard
            key={editingGrn?.id ?? 'create'}
            editing={editingGrn}
            onDone={() => setEditingGrn(undefined)}
            items={items}
            unitsByItemId={unitsByItemId}
            onPickItem={onPickItem}
          />
        )}
      </div>

      {/* Right Column Table */}
      <div className="lg:col-span-7 space-y-4">
        <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search GRNs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
            />
          </div>
          <span className="rounded-full bg-[#EDF5FF] border border-[#D5E3F7] px-2.5 py-0.5 text-xs font-bold text-[#2449C6]">{filteredPurchases.length} record(s)</span>
        </div>

        <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-[#D5E3F7] bg-gradient-to-r from-white via-[#F8FAFD] to-white flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-[#0B1B45] text-sm">GRN Register</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={handlePrint}>Print</Button>
              <Button variant="secondary" size="sm" onClick={handleExportPdf}>Download PDF</Button>
              <Button variant="excel" size="sm" icon={<FileSpreadsheet size={14} className="text-emerald-100" />} onClick={handleExportExcel} disabled={exporting}>
                {exporting ? 'Exporting…' : 'Export Excel'}
              </Button>
              <Button variant="excel" size="sm" onClick={handleExportSelectedExcel} disabled={exporting}>
                Export Selected
              </Button>
              {selectedIds.length > 0 && <span className="text-xs font-bold text-[#2449C6]">{selectedIds.length} selected</span>}
            </div>
          </div>
          {exportError && <div className="mx-5 mt-3 text-xs font-semibold text-red-800 bg-red-50 p-2.5 rounded-xl border border-red-200">{exportError}</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#D5E3F7] bg-[#F8FAFD] text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="w-8 px-3.5 py-2.5">
                    {filteredPurchases.length > 0 && (
                      <input type="checkbox" checked={selectedIds.length === filteredPurchases.length} onChange={toggleSelectAll} className="accent-[#2449C6] rounded" />
                    )}
                  </th>
                  <th className="px-3.5 py-2.5">GRN #</th>
                  <th className="px-3.5 py-2.5">Supplier</th>
                  {canViewCost && <th className="px-3.5 py-2.5 text-right">Grand Total</th>}
                  {canViewCost && <th className="px-3.5 py-2.5 text-right">Pending</th>}
                  <th className="px-3.5 py-2.5 text-center">Status</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAF1FA]">
                {filteredPurchases.map((p) => (
                  <tr
                    key={p.id}
                    className={`hover:bg-[#F5F8FF]/80 transition ${
                      p.status === 'cancelled' ? 'opacity-50 line-through' : ''
                    }`}
                  >
                    <td className="px-3.5 py-2.5">
                      <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} className="accent-[#2449C6] rounded" />
                    </td>
                    <td className="px-3.5 py-2.5 font-mono font-bold text-[#0B1B45]">
                      {p.grn_no}
                      {p.supplier_invoice_no && <div className="text-[10px] text-slate-400 font-mono font-normal">{p.supplier_invoice_no}</div>}
                    </td>
                    <td className="px-3.5 py-2.5 font-semibold text-slate-800">{p.supplier_name}</td>
                    {canViewCost && <td className="px-3.5 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">₹{Number(p.grand_total).toFixed(2)}</td>}
                    {canViewCost && (
                      <td className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">
                        {Number(p.pending_balance) > 0 ? (
                          <span className="font-bold text-rose-600">₹{Number(p.pending_balance).toFixed(2)}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">Paid</span>
                        )}
                      </td>
                    )}
                    <td className="px-3.5 py-2.5 text-center capitalize">
                      {p.status === 'active' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          {p.status}
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        {canEdit && p.status === 'active' && (
                          <button
                            onClick={() => openEdit(p)}
                            className="rounded-lg bg-slate-50 border border-[#D5E3F7] p-1.5 text-slate-600 hover:bg-[#EDF5FF] hover:text-[#2449C6] hover:border-[#2449C6]/30 transition"
                            title="Edit GRN"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        {canDelete && p.status === 'active' && (
                          <button
                            onClick={() => deleteMutation.mutate(p.id)}
                            className="rounded-lg bg-slate-50 border border-[#D5E3F7] p-1.5 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition"
                            title="Delete GRN"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredPurchases.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400 font-medium">
                      No GRN records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SupplierPaymentsPanel({ canManage }) {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('bank_transfer');
  const [referenceNo, setReferenceNo] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPaymentIds, setSelectedPaymentIds] = useState([]);
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);

  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list });
  const unpaidQuery = useQuery({
    queryKey: ['unpaid-grns', supplierId],
    queryFn: () => supplierPaymentsApi.unpaidGrns(supplierId),
    enabled: !!supplierId,
  });
  const paymentsQuery = useQuery({ queryKey: ['supplier-payments'], queryFn: supplierPaymentsApi.list });

  const createMutation = useMutation({
    mutationFn: supplierPaymentsApi.create,
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['unpaid-grns', supplierId] });
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
    },
  });

  const unpaid = unpaidQuery.data || [];
  const suppliers = suppliersQuery.data || [];
  const payments = paymentsQuery.data || [];

  const preview = (() => {
    let remaining = Number(amount || 0);
    return unpaid.map((grn) => {
      const pending = Number(grn.pending_balance);
      const applied = Math.max(0, Math.min(remaining, pending));
      remaining -= applied;
      return { ...grn, applied, remAfter: pending - applied };
    });
  })();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    try {
      await createMutation.mutateAsync({
        supplier_id: Number(supplierId),
        amount: Number(amount),
        payment_mode: paymentMode,
        reference_no: referenceNo || null,
      });
      setAmount('');
      setReferenceNo('');
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to record payment');
    }
  };

  const filteredPayments = payments.filter((p) => {
    return (
      p.payment_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.reference_no?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const togglePaymentSelect = (id) => setSelectedPaymentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const togglePaymentSelectAll = () => setSelectedPaymentIds((prev) => (
    prev.length === filteredPayments.length ? [] : filteredPayments.map((p) => p.id)
  ));

  const handlePaymentsExportExcel = async () => {
    setExportError('');
    setExporting(true);
    try {
      await supplierPaymentsApi.downloadExport(filteredPayments.map((p) => p.id));
    } catch (err) {
      setExportError(err?.response?.data?.error || err?.message || 'Unable to generate the Excel file. Please try again.');
    } finally {
      setExporting(false);
    }
  };
  const handlePaymentsExportSelectedExcel = async () => {
    if (selectedPaymentIds.length === 0) {
      setExportError('Please select at least one record to export.');
      return;
    }
    setExportError('');
    setExporting(true);
    try {
      await supplierPaymentsApi.downloadExport(selectedPaymentIds);
    } catch (err) {
      setExportError(err?.response?.data?.error || err?.message || 'Unable to generate the Excel file. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const paymentsPdfColumns = {
    payment_code: 'Payment ID', paid_at: 'Date', supplier_name: 'Supplier', payment_mode: 'Payment Mode',
    amount: 'Amount', reference_no: 'Reference No',
  };

  const handlePaymentsExportPdf = () => {
    setExportError('');
    const rows = selectedPaymentIds.length > 0 ? filteredPayments.filter((p) => selectedPaymentIds.includes(p.id)) : filteredPayments;
    if (rows.length === 0) {
      setExportError('No supplier payment records to export.');
      return;
    }
    try {
      downloadReportPdf({
        title: 'Supplier Payments Register',
        filtersText: searchQuery ? `Search: "${searchQuery}"` : `${selectedPaymentIds.length > 0 ? `${rows.length} selected` : 'All'} payment records`,
        columns: paymentsPdfColumns,
        rows,
        filename: `Supplier_Payments_${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    } catch (err) {
      setExportError(err?.message || 'Unable to generate the PDF. Please try again.');
    }
  };

  const handlePaymentsPrint = () => {
    setExportError('');
    const rows = selectedPaymentIds.length > 0 ? filteredPayments.filter((p) => selectedPaymentIds.includes(p.id)) : filteredPayments;
    if (rows.length === 0) {
      setExportError('No supplier payment records to print.');
      return;
    }
    const win = window.open('', '_blank', 'width=900,height=900');
    if (!win) {
      setExportError('Could not open the print window — check your browser\'s popup blocker.');
      return;
    }
    const tableRows = rows.map((p) => `
      <tr>
        <td>${p.payment_code}</td><td>${p.paid_at}</td><td>${p.supplier_name}</td>
        <td>${p.payment_mode?.replace('_', ' ')}</td><td style="text-align:right">${Number(p.amount).toFixed(2)}</td><td>${p.reference_no || '-'}</td>
      </tr>`).join('');
    win.document.write(`
      <html><head><title>Supplier Payments</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #111; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; font-size: 12px; text-align: left; }
        th { background: #f1f5f9; }
      </style></head>
      <body>
        <h1>SUPPLIER PAYMENTS REGISTER</h1>
        <div class="meta">Generated: ${new Date().toLocaleString()}${selectedPaymentIds.length > 0 ? ` · ${rows.length} selected record(s)` : ''}</div>
        <table>
          <thead><tr><th>Payment ID</th><th>Date</th><th>Supplier</th><th>Mode</th><th>Amount</th><th>Reference</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left Column Form */}
      <div className="lg:col-span-5">
        {canManage && (
          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-5 space-y-4 sticky top-6">
            <div className="border-b border-[#D5E3F7] pb-3">
              <h2 className="text-base font-bold text-[#0B1B45] flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EDF5FF] text-[#2449C6]">
                  <CreditCard className="w-4 h-4" />
                </span>
                Record Supplier Payment
              </h2>
            </div>

            <form onSubmit={submit} className="space-y-3.5">
              {error && <div className="text-xs font-semibold text-red-800 bg-red-50 p-2.5 rounded-xl border border-red-200">{error}</div>}
              {result && (
                <div className="text-xs font-semibold text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Allocated ₹{result.allocated_total} across {Object.keys(result.allocations).length} GRN(s).
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Supplier <span className="text-red-500">*</span></label>
                <select
                  required
                  value={supplierId}
                  onChange={(e) => {
                    setSupplierId(e.target.value);
                    setResult(null);
                  }}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-sm font-medium text-slate-900 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
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
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Payment Amount (₹) <span className="text-red-500">*</span></label>
                <input
                  required
                  type="number"
                  step="any"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-sm font-medium text-slate-900 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Ref / UTR #</label>
                  <input
                    type="text"
                    placeholder="Ref #"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
                  />
                </div>
              </div>

              {supplierId && unpaid.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">FIFO Allocation Preview</label>
                  <div className="overflow-hidden rounded-xl border border-[#D5E3F7]">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#D5E3F7] bg-[#F8FAFD] text-xs font-bold uppercase tracking-wider text-slate-500">
                          <th className="px-3 py-1.5">GRN #</th>
                          <th className="px-3 py-1.5 text-right">Pending</th>
                          <th className="px-3 py-1.5 text-right">Applied</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EAF1FA]">
                        {preview.map((g) => (
                          <tr key={g.id} className="hover:bg-[#F5F8FF]/80">
                            <td className="px-3 py-1.5 font-mono font-bold text-[#0B1B45]">{g.grn_no}</td>
                            <td className="px-3 py-1.5 text-right font-medium text-slate-600 whitespace-nowrap">₹{g.pending_balance}</td>
                            <td className="px-3 py-1.5 text-right font-bold text-emerald-600 whitespace-nowrap">₹{g.applied.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  loading={createMutation.isPending}
                  disabled={!supplierId || !amount}
                  className="w-full justify-center py-2.5 text-sm font-bold"
                >
                  Settle Supplier Balance
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Right Column Table */}
      <div className="lg:col-span-7 space-y-4">
        <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search payments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
            />
          </div>
          <span className="rounded-full bg-[#EDF5FF] border border-[#D5E3F7] px-2.5 py-0.5 text-xs font-bold text-[#2449C6]">{filteredPayments.length} payment record(s)</span>
        </div>

        <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-[#D5E3F7] bg-gradient-to-r from-white via-[#F8FAFD] to-white flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-[#0B1B45] text-sm">Supplier Payment Register</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={handlePaymentsPrint}>Print</Button>
              <Button variant="secondary" size="sm" onClick={handlePaymentsExportPdf}>Download PDF</Button>
              <Button variant="excel" size="sm" icon={<FileSpreadsheet size={14} className="text-emerald-100" />} onClick={handlePaymentsExportExcel} disabled={exporting}>
                {exporting ? 'Exporting…' : 'Export Excel'}
              </Button>
              <Button variant="excel" size="sm" onClick={handlePaymentsExportSelectedExcel} disabled={exporting}>
                Export Selected
              </Button>
              {selectedPaymentIds.length > 0 && <span className="text-xs font-bold text-[#2449C6]">{selectedPaymentIds.length} selected</span>}
            </div>
          </div>
          {exportError && <div className="mx-5 mt-3 text-xs font-semibold text-red-800 bg-red-50 p-2.5 rounded-xl border border-red-200">{exportError}</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#D5E3F7] bg-[#F8FAFD] text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="w-8 px-3.5 py-2.5">
                    {filteredPayments.length > 0 && (
                      <input type="checkbox" checked={selectedPaymentIds.length === filteredPayments.length} onChange={togglePaymentSelectAll} className="accent-[#2449C6] rounded" />
                    )}
                  </th>
                  <th className="px-3.5 py-2.5">Code</th>
                  <th className="px-3.5 py-2.5">Supplier</th>
                  <th className="px-3.5 py-2.5">Mode</th>
                  <th className="px-3.5 py-2.5">Reference</th>
                  <th className="px-3.5 py-2.5 text-right">Amount</th>
                  <th className="px-3.5 py-2.5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAF1FA]">
                {filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-[#F5F8FF]/80 transition">
                    <td className="px-3.5 py-2.5">
                      <input type="checkbox" checked={selectedPaymentIds.includes(p.id)} onChange={() => togglePaymentSelect(p.id)} className="accent-[#2449C6] rounded" />
                    </td>
                    <td className="px-3.5 py-2.5 font-mono font-bold text-[#0B1B45]">{p.payment_code}</td>
                    <td className="px-3.5 py-2.5 font-semibold text-slate-800">{p.supplier_name}</td>
                    <td className="px-3.5 py-2.5">
                      <span className="px-2 py-0.5 rounded-lg text-[10px] uppercase font-bold tracking-wide bg-[#EDF5FF] text-[#2449C6] border border-[#D5E3F7]">
                        {p.payment_mode?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-500 font-mono text-xs">{p.reference_no || '-'}</td>
                    <td className="px-3.5 py-2.5 text-right font-bold text-emerald-600 whitespace-nowrap">₹{Number(p.amount).toFixed(2)}</td>
                    <td className="px-3.5 py-2.5 text-slate-500 font-medium text-xs">{p.paid_at}</td>
                  </tr>
                ))}
                {filteredPayments.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400 font-medium">
                      No supplier payment records logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Purchasing() {
  const canGrn = usePermission('purchases.create_grn');
  const canEditGrn = usePermission('purchases.edit_grn');
  const canDeleteGrn = usePermission('purchases.delete_grn');
  const canViewCost = usePermission('purchases.view_purchase_cost');
  const canSettle = usePermission('purchases.settle_supplier_payment');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B1B45] to-[#2449C6] text-white shadow-md shadow-[#2449C6]/20 ring-4 ring-[#EDF5FF]">
          <ShoppingBag className="h-5 w-5 text-[#E8C985]" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-[#0B1B45] tracking-tight">Purchasing &amp; Goods Receipt</h1>
          <p className="text-xs font-medium text-slate-500">Manage Goods Received Notes (GRN), inventory batch creation, and supplier settlements</p>
        </div>
      </div>

      <Tabs
        tabs={[
          {
            key: 'grn',
            label: 'GRN (Purchases)',
            icon: ShoppingBag,
            content: (
              <GrnPanel
                canManage={canGrn}
                canEdit={canEditGrn}
                canViewCost={canViewCost}
                canDelete={canDeleteGrn}
              />
            ),
          },
          {
            key: 'payments',
            label: 'Supplier Payments',
            icon: CreditCard,
            content: <SupplierPaymentsPanel canManage={canSettle} />,
          },
        ]}
      />
    </div>
  );
}

