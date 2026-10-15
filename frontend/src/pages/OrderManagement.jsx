import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw, Plus, Trash2, Eye, Printer, Ban, CheckCircle2, Image as ImageIcon, X, Search, Truck, FileSpreadsheet
} from 'lucide-react';
import { itemsApi } from '../api/catalog';
import { customersApi, suppliersApi, routesApi } from '../api/parties';
import { usersApi } from '../api/users';
import { purchaseRequestsApi, purchasesApi, routeSuppliersApi, customerPrebookingsApi } from '../api/purchasing';
import { resolveImageUrl } from '../utils/media';
import { Tabs } from '../components/Tabs.jsx';
import { Card } from '../components/Card.jsx';
import { Badge } from '../components/Badge.jsx';
import { Button } from '../components/Button.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { usePermission } from '../hooks/usePermission';

const BOOKING_SOURCES = [
  { value: 'direct', label: 'Direct Walk-in' },
  { value: 'salesman', label: 'Salesman' },
  { value: 'phone', label: 'Phone' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const PREBOOKING_STATUS_VARIANT = {
  pending: 'warning', confirmed: 'gold', processing: 'gold', ready: 'success', completed: 'success', cancelled: 'danger',
};
const PREBOOKING_NEXT_STATUS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
};

const REQUEST_STATUS_VARIANT = {
  open: 'warning', approved: 'gold', partially_received: 'gold', converted_to_grn: 'success', cancelled: 'danger',
};

function ItemLineEditor({ lines, setLines, items, rateLabel = 'Rate' }) {
  const addLine = () => setLines((prev) => [...prev, { item_id: '', qty: 1, rate: 0 }]);
  const updateLine = (idx, patch) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeLine = (idx) => setLines((prev) => prev.filter((_, i) => i !== idx));
  const itemById = (id) => items.find((i) => i.id === Number(id));

  return (
    <div className="flex flex-col gap-2.5">
      {lines.map((line, idx) => {
        const item = itemById(line.item_id);
        const lineTotal = Number(line.qty || 0) * Number(line.rate || 0);
        return (
          <div key={idx} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#D5E3F7] p-2.5 bg-[#F8FAFD]">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white border border-[#D5E3F7] shadow-2xs shrink-0">
              {item?.image ? (
                <img src={resolveImageUrl(item.image)} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon size={15} className="text-slate-400" />
              )}
            </div>
            <select
              value={line.item_id}
              onChange={(e) => {
                const picked = itemById(e.target.value);
                updateLine(idx, {
                  item_id: e.target.value,
                  rate: picked ? picked.retail_price || 0 : line.rate,
                });
              }}
              className="w-48 rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
            >
              <option value="">Select item</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.item_name} ({i.item_code})
                </option>
              ))}
            </select>
            <input
              type="number"
              step="any"
              min="0"
              placeholder="Qty"
              value={line.qty}
              onChange={(e) => updateLine(idx, { qty: e.target.value })}
              className="w-20 rounded-xl border border-[#D5E3F7] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
            />
            <input
              type="number"
              step="any"
              min="0"
              placeholder={rateLabel}
              value={line.rate}
              onChange={(e) => updateLine(idx, { rate: e.target.value })}
              className="w-24 rounded-xl border border-[#D5E3F7] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
            />
            {item?.gst_percent > 0 && <Badge variant="gst">GST {item.gst_percent}%</Badge>}
            <span className="ml-auto text-xs font-bold text-[#2449C6]">₹{lineTotal.toFixed(2)}</span>
            <button
              type="button"
              onClick={() => removeLine(idx)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addLine}
        className="inline-flex items-center gap-1.5 self-start text-xs font-bold text-[#2449C6] hover:text-[#142B5C] py-1 transition"
      >
        <Plus size={14} /> Add item
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Customer Pre-Booking
// ---------------------------------------------------------------------

function PrebookingPrintView({ data, onClose }) {
  if (!data || !data.items) return null;
  const subtotal = data.items.reduce((s, l) => s + Number(l.qty || 0) * Number(l.rate || 0), 0);
  const gst = data.items.reduce(
    (s, l) => s + Number(l.qty || 0) * Number(l.rate || 0) * (Number(l.tax_percent || 0) / 100),
    0
  );
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[#D5E3F7] bg-white p-8 text-sm text-slate-900 shadow-2xl print:max-h-none print:shadow-none">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            Print
          </Button>
        </div>
        <div className="mb-4 text-center">
          <div className="text-2xl font-black text-[#0B1B45] tracking-tight">AJ AGENCY</div>
          <div className="text-xs text-slate-500 font-medium">Distributor Management System</div>
          <div className="mt-2 inline-block rounded-xl bg-[#EDF5FF] border border-[#D5E3F7] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#2449C6]">
            Pre-Booking / Order Request
          </div>
          <div className="text-[10px] font-bold uppercase text-rose-600 mt-1">Not an invoice</div>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs bg-[#F8FAFD] p-4 rounded-2xl border border-[#D5E3F7]">
          <div><b className="text-slate-600">Order Number:</b> <span className="font-mono font-bold text-[#0B1B45]">{data.prebooking_no}</span></div>
          <div><b className="text-slate-600">Date:</b> {data.created_at}</div>
          <div><b className="text-slate-600">Customer:</b> <span className="font-bold text-slate-900">{data.customer_name}</span></div>
          <div><b className="text-slate-600">Phone:</b> {data.customer_phone || '-'}</div>
          <div><b className="text-slate-600">Route:</b> {data.route_name || '-'}</div>
          <div><b className="text-slate-600">Booking Source:</b> {data.booking_source}</div>
          <div><b className="text-slate-600">Salesman/Employee:</b> {data.employee_name || '-'}</div>
          <div><b className="text-slate-600">Status:</b> <span className="capitalize font-bold text-[#2449C6]">{data.status}</span></div>
        </div>
        <table className="mb-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#D5E3F7] bg-[#F8FAFD] text-xs font-bold uppercase tracking-wider text-slate-500 text-left">
              <th className="py-2.5 px-3">S.No</th>
              <th className="py-2.5 px-3">Product</th>
              <th className="py-2.5 px-3">Code</th>
              <th className="py-2.5 px-3">Qty</th>
              <th className="py-2.5 px-3 text-right">Rate</th>
              <th className="py-2.5 px-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAF1FA]">
            {data.items.map((l, idx) => (
              <tr key={l.id || idx}>
                <td className="py-2.5 px-3 font-semibold text-slate-400">{idx + 1}</td>
                <td className="py-2.5 px-3 font-bold text-[#0B1B45]">{l.item_name}</td>
                <td className="py-2.5 px-3 font-mono text-slate-500">{l.item_code}</td>
                <td className="py-2.5 px-3 font-semibold text-slate-900">{l.qty}</td>
                <td className="py-2.5 px-3 text-right font-medium text-slate-600 whitespace-nowrap">₹{l.rate}</td>
                <td className="py-2.5 px-3 text-right font-bold text-[#2449C6] whitespace-nowrap">₹{(Number(l.qty) * Number(l.rate)).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mb-4 flex justify-end">
          <div className="w-56 text-xs bg-[#F8FAFD] p-3.5 rounded-xl border border-[#D5E3F7] space-y-1">
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-slate-600"><span>GST</span><span>₹{gst.toFixed(2)}</span></div>
            <div className="flex justify-between border-t border-[#D5E3F7] pt-1.5 font-bold text-slate-900">
              <span>Estimated Total</span><span className="text-[#2449C6] text-sm">₹{(subtotal + gst).toFixed(2)}</span>
            </div>
          </div>
        </div>
        {data.notes && <div className="mb-3 text-xs bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-amber-900"><b>Notes / Instructions:</b> {data.notes}</div>}
        <div className="text-xs text-slate-400 font-medium">Created by {data.created_by_name || '-'}</div>
      </div>
    </div>
  );
}

function PrebookingEditModal({ booking, onClose }) {
  const queryClient = useQueryClient();
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const routesQuery = useQuery({ queryKey: ['routes'], queryFn: routesApi.list });
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const itemsQuery = useQuery({ queryKey: ['items', ''], queryFn: () => itemsApi.list('') });

  const [customerId, setCustomerId] = useState(booking?.customer_id ?? '');
  const [routeId, setRouteId] = useState(booking?.route_id ?? '');
  const [employeeId, setEmployeeId] = useState(booking?.employee_id ?? '');
  const [bookingSource, setBookingSource] = useState(booking?.booking_source ?? 'direct');
  const [notes, setNotes] = useState(booking?.notes ?? '');
  const [lines, setLines] = useState(
    booking?.items?.map((l) => ({ item_id: l.item_id, qty: Number(l.qty), rate: Number(l.rate) })) ?? [
      { item_id: '', qty: 1, rate: 0 },
    ]
  );
  const [error, setError] = useState('');

  const items = itemsQuery.data || [];
  const customers = customersQuery.data || [];
  const routes = routesQuery.data || [];
  const users = usersQuery.data || [];

  const validLines = lines.filter((l) => l.item_id);
  const subtotal = validLines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.rate || 0), 0);
  const gst = validLines.reduce((s, l) => {
    const item = items.find((i) => i.id === Number(l.item_id));
    return s + Number(l.qty || 0) * Number(l.rate || 0) * (Number(item?.gst_percent || 0) / 100);
  }, 0);

  const updateMutation = useMutation({ mutationFn: ({ id, data }) => customerPrebookingsApi.update(id, data) });

  const submit = async () => {
    setError('');
    const payload = {
      customer_id: Number(customerId),
      route_id: routeId ? Number(routeId) : null,
      employee_id: employeeId ? Number(employeeId) : null,
      booking_source: bookingSource,
      notes: notes || null,
      items: validLines.map((l) => ({ item_id: Number(l.item_id), qty: Number(l.qty), rate: Number(l.rate) })),
    };
    try {
      await updateMutation.mutateAsync({ id: booking.id, data: payload });
      queryClient.invalidateQueries({ queryKey: ['customer-prebookings'] });
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save');
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[#D5E3F7] bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-[#D5E3F7] pb-3">
          <div className="text-lg font-bold text-[#0B1B45]">Edit Pre-Booking {booking.prebooking_no}</div>
          <button onClick={onClose} className="rounded-xl p-1.5 text-slate-400 hover:bg-[#EDF5FF] hover:text-[#2449C6] transition"><X size={18} /></button>
        </div>

        <div className="mb-3.5 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Customer <span className="text-red-500">*</span></span>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
            >
              <option value="">Select customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.ledger_name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Booking Source</span>
            <select
              value={bookingSource}
              onChange={(e) => setBookingSource(e.target.value)}
              className="rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
            >
              {BOOKING_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Route</span>
            <select
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              className="rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
            >
              <option value="">--</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Salesman / Employee</span>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
            >
              <option value="">--</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        </div>

        <div className="mb-3.5">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-600">Items</div>
          <ItemLineEditor lines={lines} setLines={setLines} items={items} />
        </div>

        <label className="mb-3.5 flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Notes / Instructions</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] p-3 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all h-16 resize-none"
          />
        </label>

        <div className="mb-4 rounded-xl bg-gradient-to-br from-[#EDF5FF] to-[#F5F8FF] border border-[#D5E3F7] p-3.5 text-xs space-y-1">
          <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-600"><span>GST</span><span>₹{gst.toFixed(2)}</span></div>
          <div className="mt-1 flex justify-between border-t border-[#D5E3F7] pt-1.5 font-bold text-slate-900">
            <span>Estimated Grand Total</span><span className="text-[#2449C6] text-sm">₹{(subtotal + gst).toFixed(2)}</span>
          </div>
        </div>

        {error && <p className="mb-3 text-xs font-semibold text-red-800 bg-red-50 p-2.5 rounded-xl border border-red-200">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!customerId || validLines.length === 0}>
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}

function CustomerPrebookingPanel() {
  const canCreate = usePermission('orders.create_prebooking');
  const canManageStatus = usePermission('orders.manage_prebooking_status');
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editingBooking, setEditingBooking] = useState(null);
  const [printingId, setPrintingId] = useState(null);
  const [viewingId, setViewingId] = useState(null);

  // Left side form state
  const [customerId, setCustomerId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [bookingSource, setBookingSource] = useState('direct');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([{ item_id: '', qty: 1, rate: 0 }]);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const listQuery = useQuery({
    queryKey: ['customer-prebookings', page, search],
    queryFn: () => customerPrebookingsApi.list({ page, limit: 10, search: search.trim() || undefined }),
  });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const routesQuery = useQuery({ queryKey: ['routes'], queryFn: routesApi.list });
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const itemsQuery = useQuery({ queryKey: ['items', ''], queryFn: () => itemsApi.list('') });

  const printQuery = useQuery({
    queryKey: ['customer-prebooking', printingId],
    queryFn: () => customerPrebookingsApi.get(printingId),
    enabled: !!printingId,
  });
  const viewQuery = useQuery({
    queryKey: ['customer-prebooking', viewingId],
    queryFn: () => customerPrebookingsApi.get(viewingId),
    enabled: !!viewingId,
  });

  const createMutation = useMutation({
    mutationFn: customerPrebookingsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-prebookings'] });
      resetForm();
      showSuccess('Pre-booking created successfully!');
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => customerPrebookingsApi.setStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-prebookings'] }),
  });
  const cancelMutation = useMutation({
    mutationFn: (id) => customerPrebookingsApi.cancel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-prebookings'] }),
  });

  const resetForm = () => {
    setCustomerId('');
    setRouteId('');
    setEmployeeId('');
    setBookingSource('direct');
    setNotes('');
    setLines([{ item_id: '', qty: 1, rate: 0 }]);
    setFormError('');
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const items = itemsQuery.data || [];
  const customers = customersQuery.data || [];
  const routes = routesQuery.data || [];
  const users = usersQuery.data || [];

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!customerId) {
      setFormError('Please select a customer.');
      return;
    }
    const validLines = lines.filter((l) => l.item_id);
    if (validLines.length === 0) {
      setFormError('Please add at least one valid item line.');
      return;
    }

    try {
      await createMutation.mutateAsync({
        customer_id: Number(customerId),
        route_id: routeId ? Number(routeId) : null,
        employee_id: employeeId ? Number(employeeId) : null,
        booking_source: bookingSource,
        notes: notes || null,
        items: validLines.map((l) => ({ item_id: Number(l.item_id), qty: Number(l.qty), rate: Number(l.rate) })),
      });
    } catch (err) {
      setFormError(err?.response?.data?.error || 'Failed to save pre-booking');
    }
  };

  const openEdit = async (row) => {
    const full = await customerPrebookingsApi.get(row.id);
    setEditingBooking(full);
  };

  const rows = Array.isArray(listQuery.data) ? listQuery.data : (listQuery.data?.data || []);
  const total = Array.isArray(listQuery.data) ? listQuery.data.length : (listQuery.data?.total ?? rows.length);

  return (
    <div className="space-y-4">
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-3 rounded-xl flex items-center gap-2 font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column Form */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-5 space-y-4 sticky top-6">
            <div className="flex items-center justify-between border-b border-[#D5E3F7] pb-3">
              <h2 className="text-base font-bold text-[#0B1B45] flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EDF5FF] text-[#2449C6]">
                  <Plus className="w-4 h-4" />
                </span>
                New Customer Pre-Booking
              </h2>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-3.5">
              {formError && <div className="text-xs font-semibold text-red-800 bg-red-50 p-2.5 rounded-xl border border-red-200">{formError}</div>}

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">Customer <span className="text-red-500">*</span></label>
                <select
                  required
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
                >
                  <option value="">Select customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ledger_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">Booking Source</label>
                  <select
                    value={bookingSource}
                    onChange={(e) => setBookingSource(e.target.value)}
                    className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
                  >
                    {BOOKING_SOURCES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">Route</label>
                  <select
                    value={routeId}
                    onChange={(e) => setRouteId(e.target.value)}
                    className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
                  >
                    <option value="">-- None --</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">Salesman / Employee</label>
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
                >
                  <option value="">-- None --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <ItemLineEditor lines={lines} setLines={setLines} items={items} />

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">Notes / Instructions</label>
                <textarea
                  rows="2"
                  placeholder="Delivery notes, special instructions..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] p-3 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all resize-none"
                />
              </div>

              {canCreate && (
                <div className="pt-2">
                  <Button type="submit" variant="primary" loading={createMutation.isPending} disabled={!customerId} className="w-full justify-center py-2.5 text-xs font-bold">
                    Create Pre-Booking
                  </Button>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Right Column Table */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search pre-bookings..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 outline-none transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="excel"
                size="sm"
                icon={<FileSpreadsheet size={14} className="text-emerald-100" />}
                onClick={() => customerPrebookingsApi.downloadExport()}
              >
                Export Excel
              </Button>
              <span className="rounded-full bg-[#EDF5FF] border border-[#D5E3F7] px-2.5 py-0.5 text-xs font-bold text-[#2449C6]">{total} order(s)</span>
            </div>
          </div>

          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-[#D5E3F7] bg-gradient-to-r from-white via-[#F8FAFD] to-white flex items-center justify-between">
              <h3 className="font-bold text-[#0B1B45] text-sm">Customer Pre-Bookings Register</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#D5E3F7] bg-[#F8FAFD] text-xs font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-3.5 py-2.5">Order #</th>
                    <th className="px-3.5 py-2.5">Date</th>
                    <th className="px-3.5 py-2.5">Customer</th>
                    <th className="px-3.5 py-2.5 text-right">Est. Total</th>
                    <th className="px-3.5 py-2.5">Status</th>
                    <th className="px-3.5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAF1FA]">
                  {rows.map((r) => {
                    const statusKey = r.status || 'pending';
                    return (
                      <tr key={r.id} className="hover:bg-[#F5F8FF]/80 transition">
                        <td className="px-3.5 py-2.5 font-mono font-bold text-[#0B1B45]">{r.prebooking_no}</td>
                        <td className="px-3.5 py-2.5 text-slate-500 font-medium">{r.created_at?.slice(0, 10)}</td>
                        <td className="px-3.5 py-2.5 font-semibold text-slate-800">
                          {r.customer_name}
                          {r.route_name && <div className="text-[10px] text-slate-400 font-normal">{r.route_name}</div>}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-bold text-[#2449C6] whitespace-nowrap">
                          ₹{Number(r.estimated_total || 0).toFixed(2)}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <Badge variant={PREBOOKING_STATUS_VARIANT[statusKey] || 'warning'}>
                            {statusKey.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className="px-3.5 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              title="View Details"
                              onClick={() => setViewingId(r.id)}
                              className="rounded-lg bg-slate-50 border border-[#D5E3F7] p-1.5 text-slate-600 hover:bg-[#EDF5FF] hover:text-[#2449C6] hover:border-[#2449C6]/30 transition"
                            >
                              <Eye size={13} />
                            </button>
                            <button
                              title="Print Slip"
                              onClick={() => setPrintingId(r.id)}
                              className="rounded-lg bg-slate-50 border border-[#D5E3F7] p-1.5 text-slate-600 hover:bg-[#EDF5FF] hover:text-[#2449C6] hover:border-[#2449C6]/30 transition"
                            >
                              <Printer size={13} />
                            </button>
                            {canCreate && statusKey === 'pending' && (
                              <button
                                title="Edit"
                                onClick={() => openEdit(r)}
                                className="rounded-lg bg-slate-50 border border-[#D5E3F7] p-1.5 text-slate-600 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition"
                              >
                                <Plus size={13} className="rotate-45" />
                              </button>
                            )}
                            {canManageStatus &&
                              PREBOOKING_NEXT_STATUS[statusKey]
                                ?.filter((s) => s !== 'cancelled')
                                .map((next) => (
                                  <button
                                    key={next}
                                    title={`Mark ${next}`}
                                    onClick={() => statusMutation.mutate({ id: r.id, status: next })}
                                    className="rounded-lg bg-slate-50 border border-[#D5E3F7] p-1.5 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition"
                                  >
                                    <CheckCircle2 size={13} />
                                  </button>
                                ))}
                            {canManageStatus && PREBOOKING_NEXT_STATUS[statusKey]?.includes('cancelled') && (
                              <button
                                title="Cancel Pre-booking"
                                onClick={() => cancelMutation.mutate(r.id)}
                                className="rounded-lg bg-slate-50 border border-[#D5E3F7] p-1.5 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition"
                              >
                                <Ban size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400 font-medium">
                        No customer pre-bookings found.
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
              label="pre-bookings"
            />
          </div>
        </div>
      </div>

      {editingBooking && (
        <PrebookingEditModal booking={editingBooking} onClose={() => setEditingBooking(null)} />
      )}
      {printingId && printQuery.data && (
        <PrebookingPrintView data={printQuery.data} onClose={() => setPrintingId(null)} />
      )}
      {viewingId && viewQuery.data && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="max-h-[85vh] w-[560px] overflow-auto rounded-3xl border border-[#D5E3F7] bg-white p-6 shadow-2xl">
            <div className="mb-3 flex items-center justify-between border-b border-[#D5E3F7] pb-3">
              <span className="text-lg font-bold text-[#0B1B45]">{viewQuery.data.prebooking_no}</span>
              <Badge variant={PREBOOKING_STATUS_VARIANT[viewQuery.data.status] || 'warning'}>
                {viewQuery.data.status}
              </Badge>
            </div>
            <div className="mb-3 text-xs text-slate-500 font-medium bg-[#F8FAFD] p-3 rounded-xl border border-[#D5E3F7]">
              <span className="font-bold text-slate-800">{viewQuery.data.customer_name}</span> · {viewQuery.data.route_name || 'No route'} · via{' '}
              <span className="capitalize">{viewQuery.data.booking_source}</span>
            </div>
            <table className="mb-4 w-full text-sm">
              <thead>
                <tr className="border-b border-[#D5E3F7] bg-[#F8FAFD] text-xs font-bold uppercase tracking-wider text-slate-500 text-left">
                  <th className="py-2.5 px-3">Item</th>
                  <th className="py-2.5 px-3">Qty</th>
                  <th className="py-2.5 px-3 text-right">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAF1FA]">
                {(viewQuery.data.items || []).map((l, idx) => (
                  <tr key={l.id || idx}>
                    <td className="py-2.5 px-3 font-bold text-[#0B1B45]">{l.item_name}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-700">{l.qty}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-[#2449C6] whitespace-nowrap">₹{l.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {viewQuery.data.notes && <p className="mb-4 text-xs bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-amber-900"><b>Notes:</b> {viewQuery.data.notes}</p>}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setViewingId(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Supplier Purchase Requests / Indents
// ---------------------------------------------------------------------

function RequestPrintView({ data, onClose }) {
  if (!data || !data.items) return null;
  const total = data.items.reduce((s, l) => s + Number(l.qty || 0) * Number(l.rate || 0), 0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[#D5E3F7] bg-white p-8 text-sm text-slate-800 shadow-2xl print:max-h-none print:shadow-none print:border-none print:p-0">
        <div className="mb-4 flex items-center justify-between border-b border-[#EAF1FA] pb-3 print:hidden">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={() => window.print()} className="bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs">
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Print Indent
          </Button>
        </div>
        <div className="mb-6 text-center">
          <div className="text-2xl font-black tracking-tight text-[#0B1B45]">AJ AGENCY</div>
          <div className="text-xs font-semibold text-slate-500">Distributor Management System</div>
          <div className="mt-2.5 inline-block rounded-full bg-[#EDF5FF] border border-[#D5E3F7] px-4 py-1 text-xs font-bold uppercase tracking-wider text-[#2449C6]">
            Supplier Purchase Request / Indent
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-rose-500">Not a purchase invoice · Not a GRN</div>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-2xl border border-[#D5E3F7] bg-[#F8FAFD] p-4 text-xs">
          <div><span className="font-bold text-slate-500">Request No:</span> <span className="font-mono font-bold text-[#0B1B45]">{data.request_no}</span></div>
          <div><span className="font-bold text-slate-500">Date:</span> <span className="font-semibold text-slate-700">{data.created_at}</span></div>
          <div><span className="font-bold text-slate-500">Supplier:</span> <span className="font-bold text-[#0B1B45]">{data.supplier_name}</span></div>
          <div><span className="font-bold text-slate-500">Supplier Phone:</span> <span className="font-semibold text-slate-700">{data.supplier_phone || '-'}</span></div>
          <div><span className="font-bold text-slate-500">Route:</span> <span className="font-semibold text-slate-700">{data.route_name || '-'}</span></div>
          <div><span className="font-bold text-slate-500">Requested By:</span> <span className="font-semibold text-slate-700">{data.created_by_name || '-'}</span></div>
          <div><span className="font-bold text-slate-500">Status:</span> <span className="font-bold uppercase text-[#2449C6]">{data.status}</span></div>
        </div>
        <table className="mb-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-[#D5E3F7] bg-[#F5F8FF] text-left text-xs font-bold uppercase tracking-wider text-slate-600">
              <th className="py-2.5 px-3">S.No</th>
              <th className="py-2.5 px-3">Product</th>
              <th className="py-2.5 px-3">Code</th>
              <th className="py-2.5 px-3 text-center">Requested Qty</th>
              <th className="py-2.5 px-3 text-right">Purchase Rate</th>
              <th className="py-2.5 px-3 text-right">Est. Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAF1FA]">
            {data.items.map((l, idx) => (
              <tr key={l.id || idx} className="hover:bg-[#F8FAFD]">
                <td className="py-2.5 px-3 font-semibold text-slate-500">{idx + 1}</td>
                <td className="py-2.5 px-3 font-bold text-[#0B1B45]">{l.item_name}</td>
                <td className="py-2.5 px-3 font-mono text-slate-600">{l.item_code}</td>
                <td className="py-2.5 px-3 text-center font-bold text-slate-800">{l.qty}</td>
                <td className="py-2.5 px-3 text-right font-semibold text-slate-700 whitespace-nowrap">₹{l.rate}</td>
                <td className="py-2.5 px-3 text-right font-bold text-[#2449C6] whitespace-nowrap">₹{(Number(l.qty) * Number(l.rate)).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mb-4 flex justify-end">
          <div className="rounded-xl border border-[#D5E3F7] bg-gradient-to-r from-[#F8FAFD] to-[#EDF5FF] px-4 py-2.5 text-right text-sm">
            <span className="font-semibold text-slate-600 mr-2">Total Estimated Amount:</span>
            <span className="text-base font-black text-[#0B1B45]">₹{total.toFixed(2)}</span>
          </div>
        </div>
        {data.notes && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <b>Notes / Remarks:</b> {data.notes}
          </div>
        )}
      </div>
    </div>
  );
}

function ConvertToGrnModal({ request, onClose }) {
  const queryClient = useQueryClient();
  const [paymentMode, setPaymentMode] = useState('credit');
  const [paidAmount, setPaidAmount] = useState(0);
  const [lines, setLines] = useState(
    (request?.items || []).map((l) => ({
      item_id: l.item_id,
      item_name: l.item_name,
      qty: Number(l.qty),
      rate: Number(l.rate),
      free_qty: 0,
      tax_percent: 0,
    }))
  );
  const [error, setError] = useState('');

  const createMutation = useMutation({ mutationFn: purchasesApi.create });

  const total = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.rate || 0), 0);

  const submit = async () => {
    setError('');
    try {
      await createMutation.mutateAsync({
        purchase_request_id: request.id,
        supplier_id: request.supplier_id,
        payment_mode: paymentMode,
        paid_amount: Number(paidAmount || 0),
        items: lines.map((l) => ({
          item_id: l.item_id,
          qty: Number(l.qty),
          rate: Number(l.rate),
          free_qty: Number(l.free_qty || 0),
          tax_percent: Number(l.tax_percent || 0),
        })),
      });
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to create GRN');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-[#D5E3F7] bg-white p-6 shadow-2xl">
        <div className="mb-2 flex items-center justify-between border-b border-[#EAF1FA] pb-3">
          <div className="text-lg font-bold text-[#0B1B45]">
            Create Inward GRN from <span className="font-mono text-[#2449C6]">{request.request_no}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Requested quantities/rates are pre-filled — adjust to what was actually received before confirming. Stock increases only after this GRN is saved.
        </p>
        <div className="mb-4 flex flex-col gap-2.5 max-h-60 overflow-y-auto pr-1">
          {lines.map((l, idx) => (
            <div key={idx} className="flex items-center gap-3 rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] p-2.5 text-sm">
              <span className="min-w-[140px] flex-1 text-xs font-bold text-[#0B1B45]">{l.item_name}</span>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                Qty
                <input
                  type="number"
                  step="any"
                  value={l.qty}
                  onChange={(e) =>
                    setLines((p) => p.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))
                  }
                  className="w-20 rounded-lg border border-[#D5E3F7] bg-white px-2 py-1 text-xs font-bold text-slate-800 transition focus:border-[#2449C6] focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                Rate
                <input
                  type="number"
                  step="any"
                  value={l.rate}
                  onChange={(e) =>
                    setLines((p) => p.map((x, i) => (i === idx ? { ...x, rate: e.target.value } : x)))
                  }
                  className="w-20 rounded-lg border border-[#D5E3F7] bg-white px-2 py-1 text-xs font-bold text-slate-800 transition focus:border-[#2449C6] focus:outline-none"
                />
              </label>
              <span className="font-bold text-[#2449C6] text-xs min-w-[70px] text-right">
                ₹{(Number(l.qty) * Number(l.rate)).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[#D5E3F7] bg-[#F5F8FF] p-3.5">
          <div className="flex-1 min-w-[160px]">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1">Payment Mode</label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition focus:border-[#2449C6] focus:outline-none"
            >
              <option value="credit">Credit</option>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1">Paid Amount (₹)</label>
            <input
              type="number"
              step="any"
              placeholder="Paid amount"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3 py-2 text-xs font-bold text-slate-800 transition focus:border-[#2449C6] focus:outline-none"
            />
          </div>
        </div>
        <div className="mb-4 flex justify-end">
          <div className="rounded-xl border border-[#D5E3F7] bg-gradient-to-r from-[#F8FAFD] to-[#EDF5FF] px-4 py-2.5 text-right">
            <span className="text-xs font-semibold text-slate-600 mr-2">Actual Purchase Total:</span>
            <span className="text-base font-black text-[#0B1B45]">₹{total.toFixed(2)}</span>
          </div>
        </div>
        {error && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-600">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={createMutation.isPending}
            loading={createMutation.isPending}
            className="bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs"
          >
            Create GRN &amp; Increase Stock
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SupplierRequestPanel() {
  const canCreate = usePermission('orders.create_purchase_indent');
  const canApprove = usePermission('orders.approve_purchase_request');
  const canGrn = usePermission('purchases.create_grn');
  const queryClient = useQueryClient();

  const [routeId, setRouteId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([{ item_id: '', qty: 1, rate: 0 }]);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [printingId, setPrintingId] = useState(null);
  const [converting, setConverting] = useState(null);

  const requestsQuery = useQuery({ queryKey: ['purchase-requests'], queryFn: purchaseRequestsApi.list });
  const routesQuery = useQuery({ queryKey: ['routes'], queryFn: routesApi.list });
  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list });
  const itemsQuery = useQuery({ queryKey: ['items', ''], queryFn: () => itemsApi.list('') });
  const mappedSuppliersQuery = useQuery({
    queryKey: ['route-suppliers', routeId],
    queryFn: () => routeSuppliersApi.get(routeId),
    enabled: !!routeId,
  });
  const printQuery = useQuery({
    queryKey: ['purchase-request', printingId],
    queryFn: () => purchaseRequestsApi.get(printingId),
    enabled: !!printingId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });

  const createMutation = useMutation({
    mutationFn: purchaseRequestsApi.create,
    onSuccess: () => {
      invalidate();
      resetForm();
      showSuccess('Purchase request / indent generated successfully!');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: purchaseRequestsApi.cancel,
    onSuccess: () => {
      invalidate();
      showSuccess('Purchase request cancelled.');
    },
  });

  const approveMutation = useMutation({
    mutationFn: purchaseRequestsApi.approve,
    onSuccess: () => {
      invalidate();
      showSuccess('Purchase request approved.');
    },
  });

  const resetForm = () => {
    setSupplierId('');
    setRouteId('');
    setNotes('');
    setLines([{ item_id: '', qty: 1, rate: 0 }]);
    setFormError('');
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const allSuppliers = suppliersQuery.data || [];
  const mappedIds = mappedSuppliersQuery.data?.supplier_ids;
  const suppliers =
    routeId && mappedIds && mappedIds.length > 0 ? allSuppliers.filter((s) => mappedIds.includes(s.id)) : allSuppliers;

  const requests = requestsQuery.data || [];
  const items = itemsQuery.data || [];
  const routes = routesQuery.data || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!supplierId) {
      setFormError('Please select a supplier.');
      return;
    }
    const validLines = lines.filter((l) => l.item_id);
    if (validLines.length === 0) {
      setFormError('Please add at least one valid item line.');
      return;
    }

    try {
      await createMutation.mutateAsync({
        supplier_id: Number(supplierId),
        route_id: routeId ? Number(routeId) : null,
        notes: notes || null,
        items: validLines.map((l) => ({ item_id: Number(l.item_id), qty: Number(l.qty), rate: Number(l.rate) })),
      });
    } catch (err) {
      setFormError(err?.response?.data?.error || 'Failed to save request');
    }
  };

  const filteredRequests = requests.filter((r) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (r.request_no || '').toLowerCase().includes(q) ||
      (r.supplier_name || '').toLowerCase().includes(q) ||
      (r.route_name || '').toLowerCase().includes(q) ||
      (r.status || '').toLowerCase().includes(q)
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
            <div className="border-b border-[#EAF1FA] pb-3.5 flex items-center justify-between">
              <h2 className="font-bold text-[#0B1B45] text-base flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EDF5FF] border border-[#D5E3F7] text-[#2449C6]">
                  <Plus className="w-4 h-4" />
                </span>
                New Purchase Indent / Request
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="text-xs text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-200">
                  {formError}
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Route (Optional Filter)</label>
                <select
                  value={routeId}
                  onChange={(e) => {
                    setRouteId(e.target.value);
                    setSupplierId('');
                  }}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs text-slate-800 transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/20 focus:outline-none"
                >
                  <option value="">All Routes</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Supplier *</label>
                <select
                  required
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/20 focus:outline-none"
                >
                  <option value="">
                    Select Supplier {routeId ? '(mapped to route)' : ''}
                  </option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <ItemLineEditor lines={lines} setLines={setLines} items={items} rateLabel="Purchase Rate" />

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Notes / Remarks</label>
                <textarea
                  rows="2"
                  placeholder="Urgent stock requirement, delivery window..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs text-slate-800 transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/20 focus:outline-none"
                />
              </div>

              {canCreate && (
                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={createMutation.isPending}
                    disabled={!supplierId}
                    className="w-full bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs py-3"
                  >
                    Generate Purchase Request
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
                placeholder="Search purchase requests..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] pl-10 pr-3.5 py-2 text-xs text-slate-800 transition focus:border-[#2449C6] focus:bg-white focus:outline-none"
              />
            </div>
            <span className="text-xs font-semibold text-slate-500">{filteredRequests.length} request(s)</span>
          </div>

          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EAF1FA] flex items-center justify-between bg-gradient-to-r from-[#F5F8FF] to-white">
              <h3 className="font-bold text-[#0B1B45] text-sm flex items-center gap-2">
                <Truck className="h-4 w-4 text-[#2449C6]" />
                Purchase Indents Register
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#D5E3F7] bg-[#F5F8FF] text-xs font-bold uppercase tracking-wider text-slate-600">
                    <th className="px-3.5 py-2.5">Request #</th>
                    <th className="px-3.5 py-2.5">Supplier</th>
                    <th className="px-3.5 py-2.5">Items</th>
                    <th className="px-3.5 py-2.5 text-right">Est. Total</th>
                    <th className="px-3.5 py-2.5">Status</th>
                    <th className="px-3.5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAF1FA]">
                  {filteredRequests.map((r) => {
                    const statusKey = r.status || 'open';
                    return (
                      <tr key={r.id} className="hover:bg-[#F8FAFD] transition">
                        <td className="px-3.5 py-2.5 font-mono font-bold text-[#0B1B45]">{r.request_no}</td>
                        <td className="px-3.5 py-2.5 font-medium text-slate-800">
                          <span className="font-bold text-[#0B1B45]">{r.supplier_name}</span>
                          {r.route_name && <div className="text-[10px] font-semibold text-slate-500">{r.route_name}</div>}
                        </td>
                        <td className="px-3.5 py-2.5 font-semibold text-slate-600">{r.item_count} item(s)</td>
                        <td className="px-3.5 py-2.5 text-right font-bold text-[#2449C6] whitespace-nowrap">
                          ₹{Number(r.estimated_total || 0).toFixed(2)}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <Badge variant={REQUEST_STATUS_VARIANT[statusKey] || 'warning'}>
                            {statusKey.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className="px-3.5 py-2.5 text-right space-x-1.5">
                          <button
                            title="Print Indent"
                            onClick={() => setPrintingId(r.id)}
                            className="rounded-lg border border-[#D5E3F7] bg-white p-1.5 text-slate-600 hover:bg-[#EDF5FF] hover:text-[#2449C6] transition shadow-2xs"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {canApprove && statusKey === 'open' && (
                            <button
                              title="Approve"
                              onClick={() => approveMutation.mutate(r.id)}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100 transition shadow-2xs"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canGrn && statusKey === 'approved' && (
                            <button
                              title="Create GRN"
                              onClick={async () => setConverting(await purchaseRequestsApi.get(r.id))}
                              className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white text-[10px] font-bold shadow-xs hover:from-amber-600 hover:to-amber-700 transition"
                            >
                              Create GRN
                            </button>
                          )}
                          {canCreate && statusKey === 'open' && (
                            <button
                              title="Cancel Request"
                              onClick={() => cancelMutation.mutate(r.id)}
                              className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100 transition shadow-2xs"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredRequests.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-xs font-semibold">
                        No purchase requests logged yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {printingId && printQuery.data && <RequestPrintView data={printQuery.data} onClose={() => setPrintingId(null)} />}
      {converting && <ConvertToGrnModal request={converting} onClose={() => setConverting(null)} />}
    </div>
  );
}

export function OrderManagement() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const activeTab = (tabParam === 'requests' || tabParam === 'indents') ? 'requests' : 'prebooking';

  const handleTabChange = (key) => {
    setSearchParams({ tab: key });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D5E3F7] pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#0B1B45] flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0B1B45] to-[#2449C6] text-white shadow-xs">
              <RefreshCw className="w-5 h-5" />
            </span>
            Orders &amp; Indents Management
          </h1>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            Customer pre-bookings and supplier purchase requests — pending business before a sale or purchase happens
          </p>
        </div>
        <Button
          variant="secondary"
          icon={<RefreshCw size={14} />}
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['customer-prebookings'] });
            queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
          }}
          className="border-[#D5E3F7] bg-white text-slate-700 hover:bg-[#EDF5FF] hover:text-[#2449C6] shadow-xs"
        >
          Refresh
        </Button>
      </div>

      <Tabs
        activeKey={activeTab}
        onTabChange={handleTabChange}
        tabs={[
          { key: 'prebooking', label: 'Customer Pre-Booking Orders', content: <CustomerPrebookingPanel /> },
          { key: 'requests', label: 'Supplier Purchase Requests / Indents', content: <SupplierRequestPanel /> },
        ]}
      />
    </div>
  );
}
