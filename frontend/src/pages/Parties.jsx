import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users, Truck, MapPin, Building2, CheckCircle2, Power, Edit2, Trash2, Search, Plus, Phone, CreditCard, Tag,
  ClipboardList, ShoppingBag, Receipt
} from 'lucide-react';
import { routesApi, citiesApi, customersApi, suppliersApi } from '../api/parties';
import { routeSuppliersApi } from '../api/purchasing';
import { Tabs } from '../components/Tabs';
import { Button } from '../components/Button.jsx';
import { usePermission } from '../hooks/usePermission';
import { GrnPanel, SupplierPaymentsPanel } from './Purchasing.jsx';
import { SupplierRequestPanel } from './OrderManagement.jsx';

// CUSTOMERS PANEL (Left Form, Right Directory Table)
function CustomersPanel({ canManage }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const routesQuery = useQuery({ queryKey: ['routes'], queryFn: routesApi.list });
  const citiesQuery = useQuery({ queryKey: ['cities'], queryFn: citiesApi.list });

  const routes = routesQuery.data || [];
  const cities = citiesQuery.data || [];

  const [editingId, setEditingId] = useState(null);
  const [ledgerName, setLedgerName] = useState('');
  const [phone, setPhone] = useState('');
  const [routeId, setRouteId] = useState('');
  const [cityId, setCityId] = useState('');
  const [creditLimit, setCreditLimit] = useState('0');
  const [isLocalCustomer, setIsLocalCustomer] = useState('1');
  const [isActive, setIsActive] = useState(true);
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [customerGroup, setCustomerGroup] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [doj, setDoj] = useState('');
  const [dob, setDob] = useState('');
  const [pricingType, setPricingType] = useState('normal');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['customers'] });

  const createMutation = useMutation({
    mutationFn: customersApi.create,
    onSuccess: () => {
      invalidate();
      resetForm();
      showSuccess('Customer created successfully!');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => customersApi.update(id, data),
    onSuccess: () => {
      invalidate();
      resetForm();
      showSuccess('Customer updated successfully!');
    },
  });

  const removeMutation = useMutation({
    mutationFn: customersApi.remove,
    onSuccess: () => {
      invalidate();
      showSuccess('Customer deleted.');
    },
  });

  const resetForm = () => {
    setEditingId(null);
    setLedgerName('');
    setPhone('');
    setRouteId('');
    setCityId('');
    setCreditLimit('0');
    setIsLocalCustomer('1');
    setIsActive(true);
    setGstin('');
    setAddress('');
    setCustomerGroup('');
    setOpeningBalance('0');
    setDoj('');
    setDob('');
    setPricingType('normal');
    setFormError('');
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setLedgerName(item.ledger_name || item.name || '');
    setPhone(item.phone || '');
    setRouteId(item.route_id ? String(item.route_id) : '');
    setCityId(item.city_id ? String(item.city_id) : '');
    setCreditLimit(String(item.credit_limit ?? '0'));
    setIsLocalCustomer(String(item.is_local_customer ?? '1'));
    setIsActive(item.status === 'inactive' || item.is_active === 0 || item.is_active === false ? false : true);
    setGstin(item.gstin || '');
    setAddress(item.address || '');
    setCustomerGroup(item.customer_group || '');
    setOpeningBalance(String(item.opening_balance ?? '0'));
    setDoj(item.doj || '');
    setDob(item.dob || '');
    setPricingType(item.pricing_type || 'normal');
    setFormError('');
  };

  const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!ledgerName.trim()) {
      setFormError('Customer name is required.');
      return;
    }
    const trimmedGstin = gstin.trim().toUpperCase();
    if (trimmedGstin && !GSTIN_PATTERN.test(trimmedGstin)) {
      setFormError('Invalid GSTIN format.');
      return;
    }
    const payload = {
      ledger_name: ledgerName.trim(),
      phone: phone.trim(),
      route_id: routeId ? Number(routeId) : null,
      city_id: cityId ? Number(cityId) : null,
      credit_limit: Number(creditLimit || 0),
      opening_balance: Number(openingBalance || 0),
      is_local_customer: Number(isLocalCustomer ?? 1),
      is_active: isActive ? 1 : 0,
      status: isActive ? 'active' : 'inactive',
      gstin: trimmedGstin || null,
      address: address.trim() || null,
      customer_group: customerGroup.trim() || null,
      doj: doj || null,
      dob: dob || null,
      pricing_type: pricingType,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const rows = query.data || [];
  const routeMap = new Map(routes.map((r) => [r.id, r.name]));
  const cityMap = new Map(cities.map((c) => [c.id, c.name]));

  const filtered = rows.filter((r) => {
    const nameStr = (r.ledger_name || r.name || '').toLowerCase();
    const phoneStr = (r.phone || '').toLowerCase();
    const matchesSearch = nameStr.includes(searchQuery.toLowerCase()) || phoneStr.includes(searchQuery.toLowerCase());

    const cActive = r.status !== 'inactive' && r.is_active !== 0 && r.is_active !== false;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && cActive) ||
      (statusFilter === 'inactive' && !cActive);
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* LEFT FORM */}
      <div className="lg:col-span-5">
        <div className="overflow-hidden rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-5 sticky top-4">
          <div className="flex items-center justify-between border-b border-[#EAF1FA] pb-3 mb-4">
            <h2 className="text-sm font-bold text-[#0B1B45] flex items-center gap-2">
              <Users className="h-5 w-5 text-[#2449C6]" />
              {editingId ? 'Edit Customer' : 'Create Customer'}
            </h2>
            {editingId && (
              <span className="rounded-full bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                Editing #{editingId}
              </span>
            )}
          </div>

          {successMsg && (
            <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-700 border border-emerald-200 flex items-center gap-1.5 shadow-2xs">
              <CheckCircle2 size={16} className="text-emerald-600" /> {successMsg}
            </div>
          )}

          {formError && (
            <div className="mb-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700 border border-rose-200">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Customer Name / Ledger <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={ledgerName}
                onChange={(e) => setLedgerName(e.target.value)}
                placeholder="e.g., Sri Ragavendra Traders"
                disabled={!canManage}
                className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g., 9876543210"
                disabled={!canManage}
                className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Route</label>
                <select value={routeId} onChange={(e) => setRouteId(e.target.value)} disabled={!canManage} className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15">
                  <option value="">-- Select Route --</option>
                  {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">City</label>
                <select value={cityId} onChange={(e) => setCityId(e.target.value)} disabled={!canManage} className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15">
                  <option value="">-- Select City --</option>
                  {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Credit Limit (Rs.)</label>
                <input
                  type="number"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  placeholder="0"
                  disabled={!canManage}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Opening Balance (Rs.)</label>
                <input
                  type="number"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  placeholder="0"
                  disabled={!canManage}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Customer Type</label>
                <select value={isLocalCustomer} onChange={(e) => setIsLocalCustomer(e.target.value)} disabled={!canManage} className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15">
                  <option value="1">Local Customer</option>
                  <option value="0">Outstation Customer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Pricing Type</label>
                <select value={pricingType} onChange={(e) => setPricingType(e.target.value)} disabled={!canManage} className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15">
                  <option value="normal">Normal</option>
                  <option value="retail">Retail</option>
                  <option value="wholesale">Wholesale</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">GST No / GSTIN</label>
                <input
                  type="text"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                  placeholder="e.g., 33AAAAA0000A1Z5"
                  disabled={!canManage}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Group</label>
                <input
                  type="text"
                  value={customerGroup}
                  onChange={(e) => setCustomerGroup(e.target.value)}
                  placeholder="e.g., Wholesaler"
                  disabled={!canManage}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Address</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                placeholder="Full address"
                disabled={!canManage}
                className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Date of Joining</label>
                <input
                  type="date"
                  value={doj}
                  onChange={(e) => setDoj(e.target.value)}
                  disabled={!canManage}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  disabled={!canManage}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Status</label>
              <div className="flex items-center gap-4 bg-[#F8FAFD] p-3 rounded-xl border border-[#D5E3F7]">
                <label className="flex items-center gap-2 text-sm font-bold cursor-pointer text-[#0B1B45]">
                  <input
                    type="radio"
                    name="cust_status"
                    checked={isActive}
                    onChange={() => setIsActive(true)}
                    disabled={!canManage}
                    className="accent-[#2449C6] h-4 w-4"
                  />
                  <span className="flex items-center gap-1.5 text-emerald-700"><Power size={14} /> Active</span>
                </label>

                <label className="flex items-center gap-2 text-sm font-bold cursor-pointer text-slate-500">
                  <input
                    type="radio"
                    name="cust_status"
                    checked={!isActive}
                    onChange={() => setIsActive(false)}
                    disabled={!canManage}
                    className="accent-slate-400 h-4 w-4"
                  />
                  <span className="flex items-center gap-1.5 text-slate-500"><Power size={14} /> Inactive</span>
                </label>
              </div>
            </div>

            {canManage && (
              <div className="flex items-center gap-2 pt-2">
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="flex-1 justify-center py-2 text-xs font-bold">
                  {editingId ? 'Update Customer' : 'Save Customer'}
                </Button>
                {editingId && (
                  <Button type="button" variant="secondary" onClick={resetForm} className="py-2 text-xs font-bold">
                    Cancel
                  </Button>
                )}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* RIGHT TABLE */}
      <div className="lg:col-span-7">
        <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
          <div className="p-4 border-b border-[#D5E3F7] bg-gradient-to-r from-white via-[#F8FAFD] to-white flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-bold text-[#0B1B45] flex items-center gap-2">
              <span>Customer Directory</span>
              <span className="rounded-full bg-[#EDF5FF] border border-[#D5E3F7] px-2.5 py-0.5 text-xs font-bold text-[#2449C6]">{filtered.length} Total</span>
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Search customers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all w-44 sm:w-52"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-1.5 text-xs font-medium text-slate-800 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all w-28"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              {canManage && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => customersApi.downloadExport()}>Export Excel</Button>
                  <Button variant="secondary" size="sm" onClick={() => setImportOpen((v) => !v)}>Import Excel</Button>
                </>
              )}
            </div>
          </div>

          {importOpen && (
            <div className="border-b border-[#D5E3F7] bg-[#F5F8FF] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => customersApi.downloadImportTemplate()}>Download Template</Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => { setImportFile(e.target.files[0] || null); setImportResult(null); }}
                  className="text-xs text-slate-600 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#EDF5FF] file:text-[#2449C6] hover:file:bg-[#2449C6] hover:file:text-white transition-all cursor-pointer"
                />
                <Button
                  size="sm"
                  disabled={!importFile}
                  onClick={async () => { setImportResult(await customersApi.importPreview(importFile)); }}
                >
                  Preview
                </Button>
                {importResult && !importResult.committed && (
                  <Button
                    size="sm"
                    disabled={importResult.valid_rows === 0}
                    onClick={async () => {
                      const result = await customersApi.importCommit(importFile);
                      setImportResult(result);
                      invalidate();
                      if (result.invalid_rows === 0 && (result.inserted > 0 || result.updated > 0)) {
                        showSuccess(`Import successful — ${result.inserted} added, ${result.updated} updated.`);
                      }
                    }}
                  >
                    Commit Import ({importResult.valid_rows} valid rows)
                  </Button>
                )}
              </div>
              {importResult && (
                <div className="mt-3 text-xs">
                  <div className="font-semibold text-slate-700">
                    Total: {importResult.total_rows} · Valid: {importResult.valid_rows} · Invalid: {importResult.invalid_rows}
                    {importResult.committed && ` · Inserted: ${importResult.inserted} · Updated: ${importResult.updated}`}
                  </div>
                  {importResult.rows.filter((r) => r.errors.length > 0).length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-red-200 bg-red-50 p-2.5">
                      {importResult.rows.filter((r) => r.errors.length > 0).map((r) => (
                        <div key={r.row} className="text-red-800">
                          Row {r.row} ({r.customer || 'unnamed'}): {r.errors.join(', ')}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#D5E3F7] bg-[#F8FAFD] text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-3.5 py-2.5">#</th>
                  <th className="px-3.5 py-2.5">Customer Name</th>
                  <th className="px-3.5 py-2.5">Phone</th>
                  <th className="px-3.5 py-2.5">Route / City</th>
                  <th className="px-3.5 py-2.5">GSTIN</th>
                  <th className="px-3.5 py-2.5 text-center">Pricing Type</th>
                  <th className="px-3.5 py-2.5 text-right">Credit Limit</th>
                  <th className="px-3.5 py-2.5 text-center">Status</th>
                  {canManage && <th className="px-3.5 py-2.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAF1FA]">
                {filtered.map((r, index) => {
                  const cActive = r.status !== 'inactive' && r.is_active !== 0 && r.is_active !== false;
                  return (
                    <tr key={r.id} className="hover:bg-[#F5F8FF]/80 transition-colors">
                      <td className="px-3.5 py-2.5 font-semibold text-slate-400">{index + 1}</td>
                      <td className="px-3.5 py-2.5 font-bold text-[#0B1B45]">{r.ledger_name || r.name}</td>
                      <td className="px-3.5 py-2.5 font-medium text-slate-600">{r.phone || '-'}</td>
                      <td className="px-3.5 py-2.5 font-medium text-slate-600">
                        {routeMap.get(r.route_id) || 'No Route'} {cityMap.get(r.city_id) ? `(${cityMap.get(r.city_id)})` : ''}
                      </td>
                      <td className="px-3.5 py-2.5 font-medium text-slate-600">{r.gstin || '-'}</td>
                      <td className="px-3.5 py-2.5 text-center">
                        <span className="inline-flex items-center rounded-lg bg-[#EDF5FF] border border-[#D5E3F7] px-2 py-0.5 text-xs font-bold capitalize text-[#2449C6]">
                          {r.pricing_type || 'normal'}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap font-bold text-[#2449C6]">Rs. {Number(r.credit_limit || 0).toLocaleString()}</td>
                      <td className="px-3.5 py-2.5 text-center">
                        {cActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500 border border-slate-200">
                            Inactive
                          </span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-3.5 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleEdit(r)}
                              className="rounded-lg bg-slate-50 border border-[#D5E3F7] p-1.5 text-slate-600 hover:bg-[#EDF5FF] hover:text-[#2449C6] hover:border-[#2449C6]/30 transition-all"
                              title="Edit"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => { if (confirm(`Delete "${r.ledger_name || r.name}"?`)) removeMutation.mutate(r.id); }}
                              className="rounded-lg bg-slate-50 border border-[#D5E3F7] p-1.5 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={canManage ? 9 : 8} className="px-3.5 py-8 text-center text-slate-400 font-medium">No customers found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// SUPPLIERS PANEL (Left Form, Right Directory Table)
function SuppliersPanel({ canManage }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list });
  const balancesQuery = useQuery({ queryKey: ['suppliers', 'balances'], queryFn: suppliersApi.balances });

  const balanceById = new Map((balancesQuery.data || []).map((b) => [b.id, b]));

  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [isActive, setIsActive] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['suppliers'] });

  const createMutation = useMutation({
    mutationFn: suppliersApi.create,
    onSuccess: () => { invalidate(); resetForm(); showSuccess('Supplier created successfully!'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => suppliersApi.update(id, data),
    onSuccess: () => { invalidate(); resetForm(); showSuccess('Supplier updated successfully!'); },
  });

  const removeMutation = useMutation({
    mutationFn: suppliersApi.remove,
    onSuccess: () => { invalidate(); showSuccess('Supplier deleted.'); },
  });

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setPhone('');
    setGstin('');
    setOpeningBalance('0');
    setIsActive(true);
    setFormError('');
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setName(item.name || '');
    setPhone(item.phone || '');
    setGstin(item.gstin || '');
    setOpeningBalance(String(item.opening_balance ?? '0'));
    setIsActive(item.status === 'inactive' || item.is_active === 0 || item.is_active === false ? false : true);
    setFormError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Supplier name is required.');
      return;
    }
    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      gstin: gstin.trim(),
      opening_balance: Number(openingBalance || 0),
      is_active: isActive ? 1 : 0,
      status: isActive ? 'active' : 'inactive',
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const rows = query.data || [];
  const filtered = rows.filter((r) => {
    const matchesSearch = r.name?.toLowerCase().includes(searchQuery.toLowerCase()) || r.gstin?.toLowerCase().includes(searchQuery.toLowerCase());
    const sActive = r.status !== 'inactive' && r.is_active !== 0 && r.is_active !== false;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && sActive) ||
      (statusFilter === 'inactive' && !sActive);
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* LEFT FORM */}
      <div className="lg:col-span-4">
        <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-5 sticky top-4">
          <div className="flex items-center justify-between border-b border-[#D5E3F7] pb-3 mb-4">
            <h2 className="text-base font-bold text-[#0B1B45] flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EDF5FF] text-[#2449C6]">
                <Truck className="h-4 w-4" />
              </span>
              {editingId ? 'Edit Supplier' : 'Create Supplier'}
            </h2>
            {editingId && <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">Editing #{editingId}</span>}
          </div>

          {successMsg && <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 border border-emerald-200 flex items-center gap-1.5"><CheckCircle2 size={16} /> {successMsg}</div>}
          {formError && <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-800 border border-red-200">{formError}</div>}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Supplier Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., HUL Distributors"
                disabled={!canManage}
                className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g., 9443322110"
                disabled={!canManage}
                className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">GSTIN Number</label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                placeholder="e.g., 33AAAAA0000A1Z5"
                disabled={!canManage}
                className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Opening Balance (Rs.)</label>
              <input
                type="number"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0"
                disabled={!canManage}
                className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">Status</label>
              <div className="flex items-center gap-4 bg-[#F8FAFD] p-2.5 rounded-xl border border-[#D5E3F7]">
                <label className="flex items-center gap-2 text-sm font-bold cursor-pointer text-slate-800">
                  <input type="radio" name="sup_status" checked={isActive} onChange={() => setIsActive(true)} disabled={!canManage} className="accent-[#2449C6] h-4 w-4" />
                  <span className="flex items-center gap-1 text-emerald-700"><Power size={13} /> Active</span>
                </label>
                <label className="flex items-center gap-2 text-sm font-bold cursor-pointer text-slate-800">
                  <input type="radio" name="sup_status" checked={!isActive} onChange={() => setIsActive(false)} disabled={!canManage} className="accent-rose-600 h-4 w-4" />
                  <span className="flex items-center gap-1 text-slate-500"><Power size={13} /> Inactive</span>
                </label>
              </div>
            </div>

            {canManage && (
              <div className="flex items-center gap-2 pt-2">
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="flex-1 justify-center py-2 text-sm font-bold">
                  {editingId ? 'Update Supplier' : 'Save Supplier'}
                </Button>
                {editingId && <Button type="button" variant="secondary" onClick={resetForm} className="py-2 text-sm font-bold">Cancel</Button>}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* RIGHT TABLE */}
      <div className="lg:col-span-8">
        <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
          <div className="p-4 border-b border-[#D5E3F7] bg-gradient-to-r from-white via-[#F8FAFD] to-white flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-bold text-[#0B1B45] flex items-center gap-2">
              <span>Supplier Directory</span>
              <span className="rounded-full bg-[#EDF5FF] border border-[#D5E3F7] px-2.5 py-0.5 text-xs font-bold text-[#2449C6]">{filtered.length} Total</span>
            </h2>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Search suppliers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all w-44 sm:w-56"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-1.5 text-xs font-medium text-slate-800 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all w-28"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#D5E3F7] bg-[#F8FAFD] text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-3.5 py-2.5">#</th>
                  <th className="px-3.5 py-2.5">Supplier Name</th>
                  <th className="px-3.5 py-2.5">Phone</th>
                  <th className="px-3.5 py-2.5">GSTIN</th>
                  <th className="px-3.5 py-2.5 text-right">Outstanding</th>
                  <th className="px-3.5 py-2.5 text-center">Status</th>
                  {canManage && <th className="px-3.5 py-2.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAF1FA]">
                {filtered.map((r, index) => {
                  const sActive = r.status !== 'inactive' && r.is_active !== 0 && r.is_active !== false;
                  const val = Number(balanceById.get(r.id)?.current_outstanding ?? 0);
                  return (
                    <tr key={r.id} className="hover:bg-[#F5F8FF]/80 transition-colors">
                      <td className="px-3.5 py-2.5 font-semibold text-slate-400">{index + 1}</td>
                      <td className="px-3.5 py-2.5 font-bold text-[#0B1B45]">{r.name}</td>
                      <td className="px-3.5 py-2.5 font-medium text-slate-600">{r.phone || '-'}</td>
                      <td className="px-3.5 py-2.5 font-medium text-slate-600">{r.gstin || '-'}</td>
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap font-bold">
                        <span className={val > 0 ? 'text-rose-600' : 'text-emerald-600'}>Rs. {val.toFixed(2)}</span>
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        {sActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500 border border-slate-200">
                            Inactive
                          </span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-3.5 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleEdit(r)}
                              className="rounded-lg bg-slate-50 border border-[#D5E3F7] p-1.5 text-slate-600 hover:bg-[#EDF5FF] hover:text-[#2449C6] hover:border-[#2449C6]/30 transition-all"
                              title="Edit"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => { if (confirm(`Delete "${r.name}"?`)) removeMutation.mutate(r.id); }}
                              className="rounded-lg bg-slate-50 border border-[#D5E3F7] p-1.5 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={canManage ? 7 : 6} className="px-3.5 py-8 text-center text-slate-400 font-medium">No suppliers found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ROUTES PANEL (Left Form, Right Directory Table & Mapping)
function RoutesPanel({ canManage }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['routes'], queryFn: routesApi.list });

  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['routes'] });

  const createMutation = useMutation({
    mutationFn: routesApi.create,
    onSuccess: () => { invalidate(); resetForm(); showSuccess('Route created successfully!'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => routesApi.update(id, data),
    onSuccess: () => { invalidate(); resetForm(); showSuccess('Route updated successfully!'); },
  });

  const removeMutation = useMutation({
    mutationFn: routesApi.remove,
    onSuccess: () => { invalidate(); showSuccess('Route deleted.'); },
  });

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setIsActive(true);
    setFormError('');
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setName(item.name || '');
    setIsActive(item.is_active === undefined ? true : Boolean(Number(item.is_active)));
    setFormError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Route name is required.');
      return;
    }
    const payload = {
      name: name.trim(),
      is_active: isActive ? 1 : 0,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const rows = query.data || [];
  const filtered = rows.filter((r) => r.name?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT FORM */}
        <div className="lg:col-span-4">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-5 sticky top-4">
            <div className="flex items-center justify-between border-b border-[#D5E3F7] pb-3 mb-4">
              <h2 className="text-base font-bold text-[#0B1B45] flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EDF5FF] text-[#2449C6]">
                  <MapPin className="h-4 w-4" />
                </span>
                {editingId ? 'Edit Route' : 'Create Route'}
              </h2>
              {editingId && <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">Editing #{editingId}</span>}
            </div>

            {successMsg && <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 border border-emerald-200 flex items-center gap-1.5"><CheckCircle2 size={16} /> {successMsg}</div>}
            {formError && <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-800 border border-red-200">{formError}</div>}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">Route Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., North Town Route"
                  disabled={!canManage}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">Status</label>
                <div className="flex items-center gap-4 bg-[#F8FAFD] p-2.5 rounded-xl border border-[#D5E3F7]">
                  <label className="flex items-center gap-2 text-xs font-bold cursor-pointer text-slate-800">
                    <input type="radio" name="route_status" checked={isActive} onChange={() => setIsActive(true)} disabled={!canManage} className="accent-[#2449C6] h-4 w-4" />
                    <span className="flex items-center gap-1 text-emerald-700"><Power size={13} /> Active</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-bold cursor-pointer text-slate-800">
                    <input type="radio" name="route_status" checked={!isActive} onChange={() => setIsActive(false)} disabled={!canManage} className="accent-rose-600 h-4 w-4" />
                    <span className="flex items-center gap-1 text-slate-500"><Power size={13} /> Inactive</span>
                  </label>
                </div>
              </div>

              {canManage && (
                <div className="flex items-center gap-2 pt-2">
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="flex-1 justify-center py-2 text-xs font-bold">
                    {editingId ? 'Update Route' : 'Save Route'}
                  </Button>
                  {editingId && <Button type="button" variant="secondary" onClick={resetForm} className="py-2 text-xs font-bold">Cancel</Button>}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* RIGHT TABLE */}
        <div className="lg:col-span-8">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
            <div className="p-4 border-b border-[#D5E3F7] bg-gradient-to-r from-white via-[#F8FAFD] to-white flex items-center justify-between">
              <h2 className="text-base font-bold text-[#0B1B45] flex items-center gap-2">
                <span>Routes Directory</span>
                <span className="rounded-full bg-[#EDF5FF] border border-[#D5E3F7] px-2.5 py-0.5 text-xs font-bold text-[#2449C6]">{filtered.length} Total</span>
              </h2>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Search routes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all w-48"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#D5E3F7] bg-[#F8FAFD] text-xs font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-3.5 py-2.5">#</th>
                    <th className="px-3.5 py-2.5">Route Name</th>
                    <th className="px-3.5 py-2.5 text-center">Status</th>
                    {canManage && <th className="px-3.5 py-2.5 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAF1FA]">
                  {filtered.map((r, index) => {
                    const rActive = r.is_active === undefined ? true : Boolean(Number(r.is_active));
                    return (
                      <tr key={r.id} className="hover:bg-[#F5F8FF]/80 transition-colors">
                        <td className="px-3.5 py-2.5 font-semibold text-slate-400">{index + 1}</td>
                        <td className="px-3.5 py-2.5 font-bold text-[#0B1B45]">{r.name}</td>
                        <td className="px-3.5 py-2.5 text-center">
                          {rActive ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500 border border-slate-200">
                              Inactive
                            </span>
                          )}
                        </td>
                        {canManage && (
                          <td className="px-3.5 py-2.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => handleEdit(r)}
                                className="rounded-lg bg-slate-50 border border-[#D5E3F7] p-1.5 text-slate-600 hover:bg-[#EDF5FF] hover:text-[#2449C6] hover:border-[#2449C6]/30 transition-all"
                                title="Edit"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => { if (confirm(`Delete "${r.name}"?`)) removeMutation.mutate(r.id); }}
                                className="rounded-lg bg-slate-50 border border-[#D5E3F7] p-1.5 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={canManage ? 4 : 3} className="px-3.5 py-8 text-center text-slate-400 font-medium">No routes found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <RouteSupplierMappingPanel canManage={canManage} />
    </div>
  );
}

// CITIES PANEL (Left Form, Right Directory Table)
function CitiesPanel({ canManage }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['cities'], queryFn: citiesApi.list });
  const routesQuery = useQuery({ queryKey: ['routes'], queryFn: routesApi.list });

  const routes = routesQuery.data || [];
  const routeMap = new Map(routes.map((r) => [r.id, r.name]));

  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [routeId, setRouteId] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cities'] });

  const createMutation = useMutation({
    mutationFn: citiesApi.create,
    onSuccess: () => { invalidate(); resetForm(); showSuccess('City created successfully!'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => citiesApi.update(id, data),
    onSuccess: () => { invalidate(); resetForm(); showSuccess('City updated successfully!'); },
  });

  const removeMutation = useMutation({
    mutationFn: citiesApi.remove,
    onSuccess: () => { invalidate(); showSuccess('City deleted.'); },
  });

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setRouteId('');
    setIsActive(true);
    setFormError('');
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setName(item.name || '');
    setRouteId(item.route_id ? String(item.route_id) : '');
    setIsActive(item.is_active === undefined ? true : Boolean(Number(item.is_active)));
    setFormError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !routeId) {
      setFormError('City name and Route selection are required.');
      return;
    }
    const payload = {
      name: name.trim(),
      route_id: Number(routeId),
      is_active: isActive ? 1 : 0,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const rows = query.data || [];
  const filtered = rows.filter((r) => r.name?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* LEFT FORM */}
      <div className="lg:col-span-4">
        <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-5 sticky top-4">
          <div className="flex items-center justify-between border-b border-[#D5E3F7] pb-3 mb-4">
            <h2 className="text-base font-bold text-[#0B1B45] flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EDF5FF] text-[#2449C6]">
                <Building2 className="h-4 w-4" />
              </span>
              {editingId ? 'Edit City' : 'Create City'}
            </h2>
            {editingId && <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">Editing #{editingId}</span>}
          </div>

          {successMsg && <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 border border-emerald-200 flex items-center gap-1.5"><CheckCircle2 size={16} /> {successMsg}</div>}
          {formError && <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-800 border border-red-200">{formError}</div>}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">City Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Madurai, Trichy"
                disabled={!canManage}
                className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">Assigned Route <span className="text-red-500">*</span></label>
              <select
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
                disabled={!canManage}
                className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all disabled:opacity-60"
              >
                <option value="">-- Select Route --</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">Status</label>
              <div className="flex items-center gap-4 bg-[#F8FAFD] p-2.5 rounded-xl border border-[#D5E3F7]">
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer text-slate-800">
                  <input type="radio" name="city_status" checked={isActive} onChange={() => setIsActive(true)} disabled={!canManage} className="accent-[#2449C6] h-4 w-4" />
                  <span className="flex items-center gap-1 text-emerald-700"><Power size={13} /> Active</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer text-slate-800">
                  <input type="radio" name="city_status" checked={!isActive} onChange={() => setIsActive(false)} disabled={!canManage} className="accent-rose-600 h-4 w-4" />
                  <span className="flex items-center gap-1 text-slate-500"><Power size={13} /> Inactive</span>
                </label>
              </div>
            </div>

            {canManage && (
              <div className="flex items-center gap-2 pt-2">
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="flex-1 justify-center py-2 text-xs font-bold">
                  {editingId ? 'Update City' : 'Save City'}
                </Button>
                {editingId && <Button type="button" variant="secondary" onClick={resetForm} className="py-2 text-xs font-bold">Cancel</Button>}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* RIGHT TABLE */}
      <div className="lg:col-span-8">
        <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
          <div className="p-4 border-b border-[#D5E3F7] bg-gradient-to-r from-white via-[#F8FAFD] to-white flex items-center justify-between">
            <h2 className="text-base font-bold text-[#0B1B45] flex items-center gap-2">
              <span>Cities Directory</span>
              <span className="rounded-full bg-[#EDF5FF] border border-[#D5E3F7] px-2.5 py-0.5 text-xs font-bold text-[#2449C6]">{filtered.length} Total</span>
            </h2>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Search cities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all w-48"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#D5E3F7] bg-[#F8FAFD] text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-3.5 py-2.5">#</th>
                  <th className="px-3.5 py-2.5">City Name</th>
                  <th className="px-3.5 py-2.5">Route</th>
                  <th className="px-3.5 py-2.5 text-center">Status</th>
                  {canManage && <th className="px-3.5 py-2.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAF1FA]">
                {filtered.map((r, index) => {
                  const rActive = r.is_active === undefined ? true : Boolean(Number(r.is_active));
                  return (
                    <tr key={r.id} className="hover:bg-[#F5F8FF]/80 transition-colors">
                      <td className="px-3.5 py-2.5 font-semibold text-slate-400">{index + 1}</td>
                      <td className="px-3.5 py-2.5 font-bold text-[#0B1B45]">{r.name}</td>
                      <td className="px-3.5 py-2.5 font-semibold text-[#2449C6]">{routeMap.get(r.route_id) || '-'}</td>
                      <td className="px-3.5 py-2.5 text-center">
                        {rActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500 border border-slate-200">
                            Inactive
                          </span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-3.5 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleEdit(r)}
                              className="rounded-lg bg-slate-50 border border-[#D5E3F7] p-1.5 text-slate-600 hover:bg-[#EDF5FF] hover:text-[#2449C6] hover:border-[#2449C6]/30 transition-all"
                              title="Edit"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => { if (confirm(`Delete "${r.name}"?`)) removeMutation.mutate(r.id); }}
                              className="rounded-lg bg-slate-50 border border-[#D5E3F7] p-1.5 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={canManage ? 5 : 4} className="px-3.5 py-8 text-center text-slate-400 font-medium">No cities found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function RouteSupplierMappingPanel({ canManage }) {
  const [routeId, setRouteId] = useState('');
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState('');
  const routesQuery = useQuery({ queryKey: ['routes'], queryFn: routesApi.list });
  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list });

  const saveMutation = useMutation({
    mutationFn: () => routeSuppliersApi.set(routeId, selected),
    onSuccess: () => {
      setMessage('Route-Supplier mapping saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    },
  });

  const routes = routesQuery.data || [];
  const suppliers = suppliersQuery.data || [];

  const pickRoute = async (id) => {
    setRouteId(id);
    if (id) {
      const data = await routeSuppliersApi.get(id);
      setSelected(data.supplier_ids || []);
    } else {
      setSelected([]);
    }
  };

  const toggle = (supplierId) => {
    setSelected((prev) => (prev.includes(supplierId) ? prev.filter((s) => s !== supplierId) : [...prev, supplierId]));
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 border-t border-[#D5E3F7] pt-6">
      {/* LEFT FORM */}
      <div className="lg:col-span-5">
        <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-5 sticky top-4 space-y-4">
          <div className="border-b border-[#D5E3F7] pb-3">
            <h2 className="text-base font-bold text-[#0B1B45] flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EDF5FF] text-[#2449C6]">
                <MapPin className="h-4 w-4" />
              </span>
              Route → Supplier Mapping
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Restrict which suppliers can be picked for a Purchase Request raised on this route.
            </p>
          </div>

          {message && (
            <div className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
              <CheckCircle2 size={16} /> {message}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Select Route
            </label>
            <select
              value={routeId}
              onChange={(e) => pickRoute(e.target.value)}
              disabled={!canManage}
              className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all disabled:opacity-60"
            >
              <option value="">-- Choose Route --</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          {routeId && (
            <>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Allowed Suppliers
                </label>
                <div className="max-h-60 overflow-y-auto space-y-2 p-3 bg-[#F8FAFD] rounded-xl border border-[#D5E3F7]">
                  {suppliers.map((s) => (
                    <label key={s.id} className="flex items-center gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer p-1.5 rounded-lg hover:bg-white transition-colors">
                      <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} disabled={!canManage} className="accent-[#2449C6] h-4 w-4 rounded" />
                      <span>{s.name}</span>
                      {s.phone && <span className="text-[10px] text-slate-400">({s.phone})</span>}
                    </label>
                  ))}
                  {suppliers.length === 0 && <p className="text-xs text-slate-400">No suppliers found.</p>}
                </div>
              </div>

              {canManage && (
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full justify-center py-2 text-xs font-bold">
                  Save Route Mapping
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* RIGHT LIST */}
      <div className="lg:col-span-7">
        <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden p-4">
          <h2 className="text-base font-bold text-[#0B1B45] mb-3 flex items-center justify-between border-b border-[#D5E3F7] pb-3">
            <span>Mapped Route Overview</span>
            <span className="rounded-full bg-[#EDF5FF] border border-[#D5E3F7] px-2.5 py-0.5 text-xs font-bold text-[#2449C6]">{routes.length} Routes</span>
          </h2>

          <div className="space-y-2.5 max-h-[70vh] overflow-y-auto pr-1">
            {routes.map((r) => (
              <div
                key={r.id}
                onClick={() => pickRoute(r.id)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  String(routeId) === String(r.id)
                    ? 'border-[#2449C6] bg-[#EDF5FF] ring-2 ring-[#2449C6]/20 shadow-xs'
                    : 'border-[#D5E3F7] bg-white hover:border-[#2449C6]/40 hover:bg-[#F5F8FF]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-[#0B1B45]">{r.name}</span>
                  <span className="text-[11px] font-bold text-[#2449C6] flex items-center gap-1 hover:underline">
                    Select &amp; Edit →
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Parties({ defaultTab }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const validTabs = ['customers', 'suppliers', 'routes', 'cities', 'purchasing', 'purchase-orders', 'grn'];
  const tabFromUrl = searchParams.get('tab');
  
  // Normalize legacy tab aliases
  let initialTab = tabFromUrl;
  if (initialTab === 'payments') initialTab = 'purchasing';
  if (initialTab === 'orders' || initialTab === 'requests' || initialTab === 'indents') initialTab = 'purchase-orders';
  if (!initialTab && defaultTab) initialTab = defaultTab;

  const activeTab = validTabs.includes(initialTab) ? initialTab : 'customers';

  const canManageCustomers = usePermission('parties.manage_customers');
  const canManageSuppliers = usePermission('parties.manage_suppliers');
  const canGrn = usePermission('purchases.create_grn');
  const canEditGrn = usePermission('purchases.edit_grn');
  const canDeleteGrn = usePermission('purchases.delete_grn');
  const canViewCost = usePermission('purchases.view_purchase_cost');
  const canSettle = usePermission('purchases.settle_supplier_payment');

  return (
    <div className="space-y-4 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B1B45] to-[#2449C6] text-white shadow-md shadow-[#2449C6]/20 ring-4 ring-[#EDF5FF]">
            <Users className="h-5 w-5 text-[#E8C985]" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#0B1B45] tracking-tight">Parties &amp; Purchasing</h1>
            <p className="text-xs sm:text-sm font-medium text-slate-500">Manage customers, suppliers, routes, purchase orders, and goods receipts (GRN)</p>
          </div>
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onTabChange={(k) => setSearchParams({ tab: k })}
        tabs={[
          { key: 'customers', label: 'Customers', icon: Users, content: <CustomersPanel canManage={canManageCustomers} /> },
          { key: 'suppliers', label: 'Suppliers', icon: Truck, content: <SuppliersPanel canManage={canManageSuppliers} /> },
          { key: 'routes', label: 'Routes', icon: MapPin, content: <RoutesPanel canManage={canManageCustomers} /> },
          { key: 'cities', label: 'Cities', icon: Building2, content: <CitiesPanel canManage={canManageCustomers} /> },
          { key: 'purchasing', label: 'Purchasing', icon: CreditCard, content: <SupplierPaymentsPanel canManage={canSettle} /> },
          { key: 'purchase-orders', label: 'Purchase Orders', icon: ClipboardList, content: <SupplierRequestPanel /> },
          { key: 'grn', label: 'Goods Receipt (GRN)', icon: ShoppingBag, content: <GrnPanel canManage={canGrn} canEdit={canEditGrn} canViewCost={canViewCost} canDelete={canDeleteGrn} /> },
        ]}
      />
    </div>
  );
}

