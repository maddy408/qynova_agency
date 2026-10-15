import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as ImageIcon, Pencil, Trash2, Upload, X, Plus, RotateCcw, Search } from 'lucide-react';
import { categoriesApi, brandsApi, productLinesApi, taxCodesApi, stockUnitsApi, itemsApi, categoryBrandsApi } from '../api/catalog';
import { suppliersApi } from '../api/parties';
import { branchesApi } from '../api/branches';
import { Button } from '../components/Button.jsx';
import { Toast } from '../components/Toast.jsx';
import { resolveImageUrl } from '../utils/media';

const emptyForm = {
  item_name: '', category_id: '', brand_id: '', product_line_id: '', supplier_id: '',
  hsn_code: '', barcode: '', base_unit_id: '', secondary_unit_id: '', tax_code_id: '',
  purchase_price: '', cost_price: '', wholesale_price: '', retail_price: '', mrp: '', min_stock_threshold: '',
  net_srate: '', net_purrate: '', secondary_mrp: '', secondary_net_srate: '', secondary_net_purrate: '',
  is_active: true, opening_stock: '',
};

function toNullableInt(v) {
  return v === '' || v === null || v === undefined ? null : Number(v);
}

// Blank means "no override" — sent as null, never 0, so the backend's
// NET_SRATE/NET_PURRATE fallback to the legacy price columns (or the
// primary-unit rate, for the secondary fields) stays in effect.
function toNullableNumber(v) {
  return v === '' || v === null || v === undefined ? null : Number(v);
}

function ItemFormModal({ item, onClose }) {
  const queryClient = useQueryClient();
  const isEdit = !!item;
  const [form, setForm] = useState(() =>
    item
      ? {
          item_name: item.item_name, category_id: item.category_id ?? '', brand_id: item.brand_id ?? '',
          product_line_id: item.product_line_id ?? '', supplier_id: item.supplier_id ?? '',
          hsn_code: item.hsn_code ?? '', barcode: item.barcode ?? '', base_unit_id: item.base_unit_id ?? '',
          secondary_unit_id: item.secondary_unit_id ?? '', tax_code_id: item.tax_code_id ?? '',
          purchase_price: item.purchase_price, cost_price: item.cost_price, wholesale_price: item.wholesale_price,
          retail_price: item.retail_price, mrp: item.mrp, min_stock_threshold: item.min_stock_threshold,
          net_srate: item.net_srate ?? '', net_purrate: item.net_purrate ?? '',
          secondary_mrp: item.secondary_mrp ?? '', secondary_net_srate: item.secondary_net_srate ?? '',
          secondary_net_purrate: item.secondary_net_purrate ?? '',
          is_active: !!Number(item.is_active), opening_stock: item.opening_stock ?? '',
        }
      : emptyForm
  );
  const [selectedBranches, setSelectedBranches] = useState(item?.branch_ids ?? []);
  const [extraUnits, setExtraUnits] = useState(() =>
    (item?.unit_conversions || [])
      .filter((uc) => uc.unit_id !== item?.secondary_unit_id)
      .map((uc) => ({ unit_id: uc.unit_id, conversion_to_base: uc.conversion_to_base, is_purchase_unit: !!Number(uc.is_purchase_unit), is_sale_unit: !!Number(uc.is_sale_unit) }))
  );
  const [checkedUnitIds, setCheckedUnitIds] = useState(() => {
    const ids = new Set();
    if (item?.base_unit_id) ids.add(item.base_unit_id);
    if (item?.secondary_unit_id) ids.add(item.secondary_unit_id);
    (item?.unit_conversions || []).forEach((uc) => ids.add(uc.unit_id));
    return ids;
  });
  const [error, setError] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(item?.image ? resolveImageUrl(item.image) : null);
  const fileInputRef = useRef(null);

  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });
  const brandsQuery = useQuery({ queryKey: ['brands'], queryFn: brandsApi.list });
  const productLinesQuery = useQuery({ queryKey: ['product-lines'], queryFn: productLinesApi.list });
  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list });
  const taxCodesQuery = useQuery({ queryKey: ['tax-codes'], queryFn: taxCodesApi.list });
  const stockUnitsQuery = useQuery({ queryKey: ['stock-units'], queryFn: stockUnitsApi.list });
  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: branchesApi.list });

  const [allowedBrandIds, setAllowedBrandIds] = useState(null);
  useEffect(() => {
    if (!form.category_id) {
      setAllowedBrandIds(null);
      return;
    }
    categoryBrandsApi.get(form.category_id).then((res) => {
      setAllowedBrandIds(res.brand_ids && res.brand_ids.length > 0 ? res.brand_ids : null);
    });
  }, [form.category_id]);

  const categories = categoriesQuery.data || [];
  const allBrands = brandsQuery.data || [];
  const brands = allowedBrandIds ? allBrands.filter((b) => allowedBrandIds.includes(b.id)) : allBrands;
  const productLines = productLinesQuery.data || [];
  const suppliers = suppliersQuery.data || [];
  const taxCodes = taxCodesQuery.data || [];
  const stockUnits = stockUnitsQuery.data || [];
  const branches = branchesQuery.data || [];

  const update = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

  const toggleBranch = (id) => {
    setSelectedBranches((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  };

  const toggleUnit = (unitId) => {
    setCheckedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
        if (form.base_unit_id === unitId) update('base_unit_id', '');
        if (form.secondary_unit_id === unitId) update('secondary_unit_id', '');
        setExtraUnits((eu) => eu.filter((u) => u.unit_id !== unitId));
      } else {
        next.add(unitId);
      }
      return next;
    });
  };

  const otherCheckedUnits = [...checkedUnitIds].filter((id) => id !== form.base_unit_id && id !== Number(form.secondary_unit_id || 0) && id !== form.secondary_unit_id);

  const createMutation = useMutation({ mutationFn: itemsApi.create });
  const updateMutation = useMutation({ mutationFn: ({ id, data }) => itemsApi.update(id, data) });
  const uploadImageMutation = useMutation({ mutationFn: ({ id, file }) => itemsApi.uploadImage(id, file) });
  const removeImageMutation = useMutation({ mutationFn: itemsApi.removeImage });

  const handleImagePick = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleRemoveImage = async () => {
    setImageFile(null);
    setImagePreview(null);
    if (isEdit && item.image) {
      await removeImageMutation.mutateAsync(item.id);
      queryClient.invalidateQueries({ queryKey: ['items'] });
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    const unitConversions = otherCheckedUnits.map((unitId) => {
      const existing = extraUnits.find((u) => u.unit_id === unitId);
      return {
        unit_id: unitId,
        conversion_to_base: existing?.conversion_to_base ?? 1,
        is_purchase_unit: existing?.is_purchase_unit ?? true,
        is_sale_unit: existing?.is_sale_unit ?? true,
      };
    });

    const payload = {
      ...form,
      category_id: toNullableInt(form.category_id),
      brand_id: toNullableInt(form.brand_id),
      product_line_id: toNullableInt(form.product_line_id),
      supplier_id: toNullableInt(form.supplier_id),
      base_unit_id: toNullableInt(form.base_unit_id),
      secondary_unit_id: toNullableInt(form.secondary_unit_id),
      tax_code_id: toNullableInt(form.tax_code_id),
      purchase_price: Number(form.purchase_price || 0),
      cost_price: Number(form.cost_price || 0),
      wholesale_price: Number(form.wholesale_price || 0),
      retail_price: Number(form.retail_price || 0),
      mrp: Number(form.mrp || 0),
      net_srate: toNullableNumber(form.net_srate),
      net_purrate: toNullableNumber(form.net_purrate),
      secondary_mrp: toNullableNumber(form.secondary_mrp),
      secondary_net_srate: toNullableNumber(form.secondary_net_srate),
      secondary_net_purrate: toNullableNumber(form.secondary_net_purrate),
      min_stock_threshold: Number(form.min_stock_threshold || 0),
      opening_stock: Number(form.opening_stock || 0),
      is_active: form.is_active ? 1 : 0,
      branch_ids: selectedBranches,
      unit_conversions: unitConversions,
    };

    try {
      let savedId = item?.id;
      if (isEdit) {
        await updateMutation.mutateAsync({ id: item.id, data: payload });
      } else {
        const created = await createMutation.mutateAsync(payload);
        savedId = created.id;
      }
      if (imageFile && savedId) {
        await uploadImageMutation.mutateAsync({ id: savedId, file: imageFile });
      }
      queryClient.invalidateQueries({ queryKey: ['items'] });
      onClose();
    } catch (err) {
      setError(err?.response?.data?.errors?.join(', ') || err?.response?.data?.error || 'Save failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <form onSubmit={submit} className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white border border-[#D8E6F7] shadow-2xl p-6 space-y-5 text-[#0F1E4A]">
        <div className="flex items-center justify-between border-b border-[#D8E6F7] pb-3.5">
          <div className="text-lg font-black text-[#0F1E4A] tracking-tight">{isEdit ? 'Edit Item' : 'New Item'}</div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-[#64789D] hover:bg-[#EDF5FF] hover:text-[#0F1E4A] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-4 bg-[#F8FAFD] p-3.5 rounded-2xl border border-[#D8E6F7]">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-[#B8D5FF] bg-[#F5F8FF] shadow-2xs">
            {imagePreview ? <img src={imagePreview} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={28} className="text-[#9BB4D8]" />}
          </div>
          <div className="flex flex-col gap-1.5">
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImagePick} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-1.5 text-xs font-bold text-[#0F1E4A] hover:bg-[#EDF5FF] shadow-2xs transition-all active:scale-95"
            >
              <Upload size={14} className="text-[#315BFF]" />
              <span>{imagePreview ? 'Change Image' : 'Upload Image'}</span>
            </button>
            {imagePreview && (
              <button type="button" onClick={handleRemoveImage} className="text-left text-xs font-bold text-[#E11D48] hover:underline">
                Remove image
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
          <Field label="Item name *"><input required value={form.item_name} onChange={(e) => update('item_name', e.target.value)} className="input" /></Field>
          <Field label="Category">
            <select value={form.category_id} onChange={(e) => update('category_id', e.target.value)} className="input">
              <option value="">--</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Brand">
            <select value={form.brand_id} onChange={(e) => update('brand_id', e.target.value)} className="input">
              <option value="">--</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Product line">
            <select value={form.product_line_id} onChange={(e) => update('product_line_id', e.target.value)} className="input">
              <option value="">--</option>
              {productLines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Supplier">
            <select value={form.supplier_id} onChange={(e) => update('supplier_id', e.target.value)} className="input">
              <option value="">--</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="HSN code"><input value={form.hsn_code} onChange={(e) => update('hsn_code', e.target.value)} className="input" /></Field>
          <Field label="Barcode"><input value={form.barcode} onChange={(e) => update('barcode', e.target.value)} className="input" /></Field>
          <Field label="Tax code (GST%)">
            <select value={form.tax_code_id} onChange={(e) => update('tax_code_id', e.target.value)} className="input">
              <option value="">--</option>
              {taxCodes.map((t) => <option key={t.id} value={t.id}>{t.code} ({t.gst_percent}%)</option>)}
            </select>
          </Field>
          <Field label="Purchase price"><input type="number" step="any" value={form.purchase_price} onChange={(e) => update('purchase_price', e.target.value)} className="input" /></Field>
          <Field label="Cost price"><input type="number" step="any" value={form.cost_price} onChange={(e) => update('cost_price', e.target.value)} className="input" /></Field>
          <Field label="Wholesale price"><input type="number" step="any" value={form.wholesale_price} onChange={(e) => update('wholesale_price', e.target.value)} className="input" /></Field>
          <Field label="Retail price"><input type="number" step="any" value={form.retail_price} onChange={(e) => update('retail_price', e.target.value)} className="input" /></Field>
          <Field label="MRP"><input type="number" step="any" value={form.mrp} onChange={(e) => update('mrp', e.target.value)} className="input" /></Field>
          <Field label="NET SALE RATE"><input type="number" step="any" value={form.net_srate} onChange={(e) => update('net_srate', e.target.value)} className="input" placeholder={form.retail_price || '0.00'} /></Field>
          <Field label="NET PURCHASE RATE"><input type="number" step="any" value={form.net_purrate} onChange={(e) => update('net_purrate', e.target.value)} className="input" placeholder={form.purchase_price || '0.00'} /></Field>
          <Field label="Min stock threshold"><input type="number" step="any" value={form.min_stock_threshold} onChange={(e) => update('min_stock_threshold', e.target.value)} className="input" /></Field>
          <Field label="Opening stock">
            <input type="number" step="any" min="0" value={form.opening_stock} onChange={(e) => update('opening_stock', e.target.value)} className="input" placeholder="0" />
          </Field>
          <Field label="Active?">
            <select value={form.is_active ? '1' : '0'} onChange={(e) => update('is_active', e.target.value === '1')} className="input">
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
          </Field>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-[#5A6E8C]">Units — check every unit this item can be billed/purchased in *</div>
          <div className="flex flex-wrap gap-2.5 rounded-2xl border border-[#D8E6F7] bg-[#F8FAFD] p-3.5">
            {stockUnits.map((u) => (
              <label key={u.id} className="inline-flex items-center gap-1.5 rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-xs font-bold text-[#0F1E4A] shadow-2xs cursor-pointer hover:border-[#315BFF] transition-all">
                <input type="checkbox" checked={checkedUnitIds.has(u.id)} onChange={() => toggleUnit(u.id)} className="accent-[#315BFF] rounded" />
                <span>{u.name}</span>
                <span className="text-[#64789D]">({u.short_code})</span>
              </label>
            ))}
          </div>
          {checkedUnitIds.size > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-bold text-[#0F1E4A]">
              <label className="flex items-center gap-2">
                Primary:
                <select required value={form.base_unit_id} onChange={(e) => update('base_unit_id', Number(e.target.value))} className="input w-36 py-1.5 text-xs">
                  <option value="">--</option>
                  {[...checkedUnitIds].map((id) => (
                    <option key={id} value={id}>{stockUnits.find((u) => u.id === id)?.short_code}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                Secondary:
                <select value={form.secondary_unit_id} onChange={(e) => update('secondary_unit_id', e.target.value ? Number(e.target.value) : '')} className="input w-36 py-1.5 text-xs">
                  <option value="">None</option>
                  {[...checkedUnitIds].filter((id) => id !== form.base_unit_id).map((id) => (
                    <option key={id} value={id}>{stockUnits.find((u) => u.id === id)?.short_code}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {otherCheckedUnits.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5 rounded-2xl border border-[#D8E6F7] bg-[#F8FAFD] p-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#5A6E8C]">Conversion to base unit, for each extra unit:</span>
              {otherCheckedUnits.map((unitId) => {
                const existing = extraUnits.find((u) => u.unit_id === unitId) || { conversion_to_base: 1 };
                return (
                  <div key={unitId} className="flex items-center gap-2 text-xs font-semibold text-[#0F1E4A]">
                    <span className="w-20 font-bold">{stockUnits.find((u) => u.id === unitId)?.short_code}</span>
                    <span className="text-[#64789D]">1 {stockUnits.find((u) => u.id === unitId)?.short_code} =</span>
                    <input
                      type="number" step="any" value={existing.conversion_to_base}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setExtraUnits((prev) => {
                          const others = prev.filter((u) => u.unit_id !== unitId);
                          return [...others, { ...existing, unit_id: unitId, conversion_to_base: val }];
                        });
                      }}
                      className="input w-24 py-1 text-xs"
                    />
                    <span className="text-[#64789D]">base units</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {form.secondary_unit_id && (
          <div className="rounded-2xl border border-[#CDE1F8] bg-gradient-to-br from-[#F5F9FF] to-[#EBF4FF] p-4">
            <div className="mb-2 text-xs font-bold text-[#0F1E4A]">
              Secondary unit pricing ({stockUnits.find((u) => u.id === Number(form.secondary_unit_id))?.short_code || 'S-UNIT'}) —
              used automatically when a sale/purchase line is in this unit instead of the primary unit
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="S-MRP"><input type="number" step="any" value={form.secondary_mrp} onChange={(e) => update('secondary_mrp', e.target.value)} className="input" placeholder={form.mrp || '0.00'} /></Field>
              <Field label="S-NET_SRATE"><input type="number" step="any" value={form.secondary_net_srate} onChange={(e) => update('secondary_net_srate', e.target.value)} className="input" placeholder={form.net_srate || '0.00'} /></Field>
              <Field label="S-NET_PURRATE"><input type="number" step="any" value={form.secondary_net_purrate} onChange={(e) => update('secondary_net_purrate', e.target.value)} className="input" placeholder={form.net_purrate || '0.00'} /></Field>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-[#5A6E8C]">Available at branches</div>
          <div className="flex flex-wrap gap-2.5 rounded-2xl border border-[#D8E6F7] bg-[#F8FAFD] p-3.5">
            {branches.map((b) => (
              <label key={b.id} className="inline-flex items-center gap-1.5 rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-xs font-bold text-[#0F1E4A] shadow-2xs cursor-pointer hover:border-[#315BFF] transition-all">
                <input type="checkbox" checked={selectedBranches.includes(b.id)} onChange={() => toggleBranch(b.id)} className="accent-[#315BFF] rounded" />
                <span>{b.branch_name}</span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="rounded-xl bg-[#FEF2F2] p-3 text-xs font-bold text-[#E11D48] border border-[#FECDD3]">{error}</p>}

        <div className="flex justify-end gap-2.5 pt-2 border-t border-[#D8E6F7]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#D5E3F7] bg-white px-4 py-2 text-xs font-bold text-[#5A6E8C] hover:bg-[#EDF5FF] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-r from-[#0B1B45] via-[#142B5C] to-[#2449C6] px-5 py-2 text-xs font-bold text-white shadow-xs hover:brightness-110 active:scale-95 transition-all"
          >
            {isEdit ? 'Save Changes' : 'Create Item'}
          </button>
        </div>
      </form>
    </div>
  );
}

const PAGE_SIZE = 10;

export function ItemsPanel({ canManage }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // active | inactive | all
  const [page, setPage] = useState(1);
  const [modalItem, setModalItem] = useState(undefined); // undefined = closed, null = create, object = edit
  const [importResult, setImportResult] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState('');
  const fileInputRef = useRef(null);

  const itemsQuery = useQuery({
    queryKey: ['items', search, statusFilter],
    queryFn: () => itemsApi.list(search, statusFilter),
  });
  const invalidateItems = () => queryClient.invalidateQueries({ queryKey: ['items'] });
  const deleteItem = useMutation({ mutationFn: itemsApi.remove, onSuccess: invalidateItems });
  const reactivateItem = useMutation({
    mutationFn: (id) => itemsApi.update(id, { is_active: 1 }),
    onSuccess: invalidateItems,
  });

  const handleSearchChange = (value) => {
    setSearch(value);
    setPage(1); // a new search always starts back at page 1
  };

  const handleStatusFilterChange = (value) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Deactivate "${item.item_name}"? It will be hidden from Billing and the active Items list, but its history is kept.`)) return;
    await deleteItem.mutateAsync(item.id);
  };

  const handleReactivate = async (item) => {
    await reactivateItem.mutateAsync(item.id);
  };

  const openEdit = async (item) => {
    const full = await itemsApi.get(item.id);
    setModalItem(full);
  };

  const handleImportFile = (e) => {
    setImportFile(e.target.files[0] || null);
    setImportResult(null);
  };

  const handlePreview = async () => {
    if (!importFile) return;
    const result = await itemsApi.importPreview(importFile);
    setImportResult(result);
  };

  const handleCommit = async () => {
    if (!importFile) return;
    setImportSuccessMsg('');
    const result = await itemsApi.importCommit(importFile);
    setImportResult(result);
    invalidateItems();
    if (result.invalid_rows === 0 && (result.inserted > 0 || result.updated > 0)) {
      setImportSuccessMsg(`Import successful — ${result.inserted} item(s) added, ${result.updated} updated.`);
      setTimeout(() => setImportSuccessMsg(''), 4000);
    }
  };

  const items = itemsQuery.data || [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4 font-sans">
      <Toast message={importSuccessMsg} onClose={() => setImportSuccessMsg('')} />
      <div className="card rounded-2xl border border-[#D8E6F7] bg-white shadow-[0_2px_12px_rgba(15,30,65,0.04)] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D8E6F7] px-5 py-3.5 bg-white">
          <div className="flex items-center gap-2">
            <span className="font-black text-[#0F1E4A] tracking-tight">Items Directory</span>
            <span className="rounded-full bg-[#EEF5FF] text-[#315BFF] border border-[#D5E5FC] px-2.5 py-0.5 text-xs font-bold">
              {items.length} Total
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-xl border border-[#D5E3F7] p-0.5 bg-[#F8FAFD] text-xs">
              {[
                ['active', 'Active'],
                ['inactive', 'Deactivated'],
                ['all', 'All'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleStatusFilterChange(value)}
                  className={`rounded-lg px-3 py-1 font-bold transition-all ${
                    statusFilter === value
                      ? 'bg-gradient-to-r from-[#0B1B45] to-[#1C3675] text-[#E8C985] shadow-xs'
                      : 'text-[#64789D] hover:text-[#0F1E4A]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7E92B2]" size={14} />
              <input
                type="text"
                placeholder="Search name / code / barcode"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="input pl-8 py-1.5 text-xs w-48 sm:w-60"
              />
            </div>
            <button
              type="button"
              onClick={() => itemsApi.downloadExport()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-1.5 text-xs font-bold text-[#0F1E4A] hover:bg-[#EDF5FF] shadow-2xs transition-all active:scale-95"
            >
              Export Excel
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => setModalItem(null)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0B1B45] via-[#142B5C] to-[#2449C6] px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:brightness-110 active:scale-95 transition-all"
              >
                <Plus size={14} className="text-[#E8C985]" />
                <span>Add Item</span>
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#D8E6F7] bg-[#F1F5F9] text-left text-[11px] font-bold uppercase tracking-wider text-slate-800">
                <th className="px-4 py-3"></th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">MRP</th>
                <th className="px-4 py-3">NET_SRATE</th>
                <th className="px-4 py-3">NET_PURRATE</th>
                <th className="px-4 py-3">Opening Stock</th>
                <th className="px-4 py-3">GST%</th>
                <th className="px-4 py-3">HSN</th>
                {statusFilter === 'all' && <th className="px-4 py-3">Status</th>}
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAF1FA]">
              {pagedItems.map((item) => (
                <tr key={item.id} className="hover:bg-[#F8FAFD]/70 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-[#F5F8FF] border border-[#D5E5FC] shadow-2xs">
                      {item.image ? (
                        <img
                          src={resolveImageUrl(item.image)}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
                        />
                      ) : null}
                      <ImageIcon size={16} className="text-[#9BB4D8]" style={{ display: item.image ? 'none' : 'flex' }} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-bold text-[#1E293B]">{item.item_code}</td>
                  <td className="px-4 py-2.5 font-bold text-[#0F1E4A]">{item.item_name}</td>
                  <td className="px-4 py-2.5 font-semibold text-[#334155]">{item.category_name || '—'}</td>
                  <td className="px-4 py-2.5 font-semibold text-[#0F1E4A]">{item.base_unit_code}</td>
                  <td className="px-4 py-2.5 font-bold text-[#0F1E4A]">Rs. {item.mrp}</td>
                  <td className="px-4 py-2.5 font-semibold text-[#2449C6]">Rs. {item.net_srate ?? item.retail_price}</td>
                  <td className="px-4 py-2.5 font-semibold text-[#334155]">Rs. {item.net_purrate ?? item.purchase_price}</td>
                  <td className="px-4 py-2.5 font-bold text-[#0F1E4A]">{item.opening_stock ?? 0}</td>
                  <td className="px-4 py-2.5 font-semibold text-[#334155]">{item.gst_percent ? `${item.gst_percent}%` : '—'}</td>
                  <td className="px-4 py-2.5 font-semibold text-[#334155]">{item.hsn_code || '—'}</td>
                  {statusFilter === 'all' && (
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                        Number(item.is_active)
                          ? 'bg-[#ECFDF5] text-[#059669] border-[#C6F6D5]'
                          : 'bg-[#FEF2F2] text-[#E11D48] border-[#FECDD3]'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${Number(item.is_active) ? 'bg-[#059669]' : 'bg-[#E11D48]'}`}></span>
                        {Number(item.is_active) ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                  )}
                  {canManage && (
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(item)}
                          title="Edit"
                          className="rounded-lg bg-[#F0F4FA] p-1.5 text-[#315BFF] hover:bg-[#EEF5FF] transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        {Number(item.is_active) ? (
                          <button
                            onClick={() => handleDelete(item)}
                            title="Deactivate"
                            className="rounded-lg bg-[#F0F4FA] p-1.5 text-[#E11D48] hover:bg-[#FEF2F2] transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(item)}
                            title="Reactivate"
                            className="rounded-lg bg-[#F0F4FA] p-1.5 text-[#059669] hover:bg-[#ECFDF5] transition-colors"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={11 + (canManage ? 1 : 0) + (statusFilter === 'all' ? 1 : 0)} className="px-4 py-8 text-center text-[#7E92B2] font-medium">
                    No items found matching your filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {items.length > 0 && (
          <div className="flex items-center justify-between border-t border-[#D8E6F7] bg-[#F8FAFD]/60 px-5 py-3 text-xs">
            <span className="text-[#1E293B] font-semibold">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, items.length)} of {items.length} items
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 font-bold text-[#0F1E4A] hover:bg-[#EDF5FF] shadow-2xs disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <span className="text-[#1E293B] font-bold px-2">Page {currentPage} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 font-bold text-[#0F1E4A] hover:bg-[#EDF5FF] shadow-2xs disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {canManage && (
        <div className="card rounded-2xl border border-[#D8E6F7] bg-white p-5 shadow-[0_2px_12px_rgba(15,30,65,0.04)]">
          <div className="mb-3 font-bold text-[#0F1E4A] flex items-center gap-2">
            <Upload size={16} className="text-[#315BFF]" />
            <span>Bulk Import (Excel / CSV)</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => itemsApi.downloadImportTemplate()}
              className="rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-1.5 text-xs font-bold text-[#0F1E4A] hover:bg-[#EDF5FF] shadow-2xs transition-all active:scale-95"
            >
              Download Template
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportFile}
              className="text-xs text-[#5A6E8C] file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border file:border-[#D5E3F7] file:text-xs file:font-bold file:bg-[#F8FAFD] file:text-[#0F1E4A] hover:file:bg-[#EDF5FF] cursor-pointer"
            />
            <button
              type="button"
              disabled={!importFile}
              onClick={handlePreview}
              className="rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-1.5 text-xs font-bold text-[#0F1E4A] hover:bg-[#EDF5FF] shadow-2xs disabled:opacity-40 transition-all active:scale-95"
            >
              Preview
            </button>
            <button
              type="button"
              disabled={!importFile || !importResult}
              onClick={handleCommit}
              className="rounded-xl bg-gradient-to-r from-[#0B1B45] via-[#142B5C] to-[#2449C6] px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:brightness-110 active:scale-95 disabled:opacity-40 transition-all"
            >
              Commit Import
            </button>
          </div>

          {importResult && (
            <div className="mt-3.5 text-xs">
              <p className="mb-2 text-[#5A6E8C] font-medium">
                {importResult.total_rows} rows — {importResult.valid_rows} valid, {importResult.invalid_rows} invalid.
                {importResult.committed && ` Inserted ${importResult.inserted}, updated ${importResult.updated}.`}
              </p>
              <div className="max-h-64 overflow-auto rounded-xl border border-[#D8E6F7]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#F8FAFD] text-left text-[11px] font-bold uppercase tracking-wider text-[#5A6E8C]">
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">Opening Stock</th>
                      <th className="px-3 py-2">Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EAF1FA]">
                    {importResult.rows.map((r) => (
                      <tr key={r.row} className={r.errors.length ? 'bg-[#FEF2F2]' : 'hover:bg-[#F8FAFD]'}>
                        <td className="px-3 py-1.5 font-semibold text-[#64789D]">{r.row}</td>
                        <td className="px-3 py-1.5 font-bold text-[#0F1E4A]">{r.item_name}</td>
                        <td className="px-3 py-1.5 text-[#0F1E4A]">{r.opening_stock ?? '—'}</td>
                        <td className="px-3 py-1.5 font-semibold text-[#E11D48]">{r.errors.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {modalItem !== undefined && <ItemFormModal item={modalItem} onClose={() => setModalItem(undefined)} />}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold uppercase tracking-wider text-[#5A6E8C]">{label}</span>
      {children}
    </label>
  );
}
