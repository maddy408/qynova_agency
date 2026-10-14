import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon, Building, Gift, TrendingUp, Printer, Hash, Store, Check, Save, Tag, ShieldCheck } from 'lucide-react';
import { settingsApi } from '../api/admin';
import { Tabs } from '../components/Tabs';
import { usePermission } from '../hooks/usePermission';
import { Branches } from './Branches';
import { Button } from '../components/Button.jsx';
import { PriceAdjustment } from './PriceAdjustment.jsx';
import { StaffPermissions } from './StaffPermissions.jsx';

function CompanyProfilePanel({ canManage }) {
  const queryClient = useQueryClient();
  const branchQuery = useQuery({ queryKey: ['settings-branch'], queryFn: settingsApi.getBranch });
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (branchQuery.data && !form) setForm(branchQuery.data);
  }, [branchQuery.data]);

  const saveMutation = useMutation({
    mutationFn: settingsApi.updateBranch,
    onSuccess: (data) => {
      setForm(data);
      queryClient.invalidateQueries({ queryKey: ['settings-branch'] });
      setMessage('Saved.');
      setTimeout(() => setMessage(''), 2500);
    },
  });

  if (!form) return <div className="py-8 text-center text-xs font-semibold text-slate-400">Loading company profile…</div>;

  const field = (name, label, span = '') => (
    <label className={`flex flex-col gap-1.5 ${span}`}>
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        value={form[name] ?? ''}
        onChange={(e) => setForm({ ...form, [name]: e.target.value })}
        disabled={!canManage}
        className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 disabled:bg-[#F8FAFD] disabled:text-slate-400"
      />
    </label>
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-6">
      <div className="mb-5 flex items-center justify-between border-b border-[#EAF1FA] pb-3.5">
        <div>
          <h2 className="font-bold text-[#0B1B45] text-sm">Company Profile</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Primary business identification and invoice printing details</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {field('branch_name', 'Branch name')}
        {field('print_name', 'Print name (on invoice header)')}
        {field('gstin', 'GSTIN')}
        {field('pan_number', 'PAN number')}
        {field('phone', 'Phone')}
        {field('support_email', 'Support email')}
        {field('address_line1', 'Address', 'col-span-2 sm:col-span-3')}
        {field('city', 'City')}
        {field('state', 'State')}
        {field('pincode', 'Pincode')}
      </div>
      {canManage && (
        <div className="mt-6 flex items-center gap-3 pt-3 border-t border-[#EAF1FA]">
          <Button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending}
            icon={<Save size={15} />}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
          {message && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">{message}</span>}
        </div>
      )}
    </div>
  );
}

function PrintSettingsPanel({ canManage }) {
  const queryClient = useQueryClient();
  const printQuery = useQuery({ queryKey: ['settings-print'], queryFn: settingsApi.getPrint });
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (printQuery.data && !form) setForm(printQuery.data);
  }, [printQuery.data]);

  const saveMutation = useMutation({
    mutationFn: settingsApi.updatePrint,
    onSuccess: (data) => {
      setForm(data);
      queryClient.invalidateQueries({ queryKey: ['settings-print'] });
      setMessage('Saved.');
      setTimeout(() => setMessage(''), 2500);
    },
  });

  if (!form) return <div className="py-8 text-center text-xs font-semibold text-slate-400">Loading print settings…</div>;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-6">
      <div className="mb-5 flex items-center justify-between border-b border-[#EAF1FA] pb-3.5">
        <div>
          <h2 className="font-bold text-[#0B1B45] text-sm">Thermal Printer &amp; Invoice Setup</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Configure thermal receipt width, bank details, and footer notes</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Printer type</span>
          <select
            value={form.printer_type}
            onChange={(e) => setForm({ ...form, printer_type: e.target.value })}
            disabled={!canManage}
            className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 disabled:bg-[#F8FAFD]"
          >
            <option value="a4">A4 Document</option>
            <option value="thermal_58">Thermal 58mm</option>
            <option value="thermal_80">Thermal 80mm</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Default print copies</span>
          <input
            type="number"
            min="1"
            value={form.default_print_copies}
            onChange={(e) => setForm({ ...form, default_print_copies: e.target.value })}
            disabled={!canManage}
            className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 disabled:bg-[#F8FAFD]"
          />
        </label>
        <label className="flex items-center gap-2.5 pt-6">
          <input
            type="checkbox"
            checked={!!Number(form.show_upi_qr_on_thermal)}
            onChange={(e) => setForm({ ...form, show_upi_qr_on_thermal: e.target.checked ? 1 : 0 })}
            disabled={!canManage}
            className="h-4 w-4 rounded border-slate-300 text-[#2449C6] focus:ring-[#2449C6]/20"
          />
          <span className="text-xs font-bold text-[#0B1B45]">Show UPI QR on thermal receipt</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Bank account no.</span>
          <input
            value={form.bank_account_no ?? ''}
            onChange={(e) => setForm({ ...form, bank_account_no: e.target.value })}
            disabled={!canManage}
            className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 disabled:bg-[#F8FAFD]"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Bank name</span>
          <input
            value={form.bank_name ?? ''}
            onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
            disabled={!canManage}
            className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 disabled:bg-[#F8FAFD]"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">UPI ID</span>
          <input
            value={form.upi_id ?? ''}
            onChange={(e) => setForm({ ...form, upi_id: e.target.value })}
            disabled={!canManage}
            className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 disabled:bg-[#F8FAFD]"
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5 sm:col-span-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Invoice footer note</span>
          <input
            value={form.invoice_footer_note ?? ''}
            onChange={(e) => setForm({ ...form, invoice_footer_note: e.target.value })}
            disabled={!canManage}
            className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 disabled:bg-[#F8FAFD]"
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5 sm:col-span-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Terms &amp; conditions</span>
          <textarea
            value={form.terms_and_conditions ?? ''}
            onChange={(e) => setForm({ ...form, terms_and_conditions: e.target.value })}
            disabled={!canManage}
            className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 disabled:bg-[#F8FAFD]"
            rows={3}
          />
        </label>
      </div>
      {canManage && (
        <div className="mt-6 flex items-center gap-3 pt-3 border-t border-[#EAF1FA]">
          <Button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending}
            icon={<Save size={15} />}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Print Settings'}
          </Button>
          {message && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">{message}</span>}
        </div>
      )}
    </div>
  );
}

function SequencesPanel({ canManage }) {
  const queryClient = useQueryClient();
  const sequencesQuery = useQuery({ queryKey: ['settings-sequences'], queryFn: settingsApi.getSequences });
  const [edits, setEdits] = useState({});

  const saveMutation = useMutation({
    mutationFn: ({ id, prefix }) => settingsApi.updateSequence(id, prefix),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings-sequences'] }),
  });

  const sequences = sequencesQuery.data || [];

  return (
    <div className="overflow-hidden rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-6">
      <div className="mb-4 flex items-center justify-between border-b border-[#EAF1FA] pb-3.5">
        <div>
          <h2 className="font-bold text-[#0B1B45] text-sm">Invoice Sequence Prefixes</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Only the prefix can be changed — the running number keeps counting so numbering never repeats.</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#EAF1FA] bg-[#F8FAFD] text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3">Series</th>
              <th className="px-4 py-3">Prefix</th>
              <th className="px-4 py-3">Next Number</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAF1FA]">
            {sequences.map((s) => (
              <tr key={s.id} className="hover:bg-[#F8FAFD]/70 transition">
                <td className="px-4 py-3.5 font-bold text-[#0B1B45] capitalize">{s.series.replace('_', '-')}</td>
                <td className="px-4 py-3.5">
                  <input
                    value={edits[s.id] ?? s.prefix}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [s.id]: e.target.value }))}
                    disabled={!canManage}
                    className="w-28 rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-xs font-bold text-[#0B1B45] shadow-2xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 disabled:bg-[#F8FAFD]"
                  />
                </td>
                <td className="px-4 py-3.5 font-semibold text-slate-500">{s.current_number + 1}</td>
                <td className="px-4 py-3.5 text-right">
                  {canManage && (
                    <button
                      onClick={() => saveMutation.mutate({ id: s.id, prefix: edits[s.id] ?? s.prefix })}
                      className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-bold text-[#2449C6] hover:bg-blue-100 transition"
                    >
                      Save
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FreeQtySettingsPanel({ canManage }) {
  const queryClient = useQueryClient();
  const freeQtyQuery = useQuery({ queryKey: ['settings-free-qty'], queryFn: settingsApi.getFreeQty });
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (freeQtyQuery.data && !form) {
      setForm({
        allow_local_free_qty: Number(freeQtyQuery.data.allow_local_free_qty ?? 1),
        allow_distance_free_qty: Number(freeQtyQuery.data.allow_distance_free_qty ?? 0),
      });
    }
  }, [freeQtyQuery.data]);

  const saveMutation = useMutation({
    mutationFn: settingsApi.updateFreeQty,
    onSuccess: (data) => {
      setForm({
        allow_local_free_qty: Number(data.allow_local_free_qty),
        allow_distance_free_qty: Number(data.allow_distance_free_qty),
      });
      queryClient.invalidateQueries({ queryKey: ['settings-free-qty'] });
      queryClient.invalidateQueries({ queryKey: ['settings-print'] });
      setMessage('Saved.');
      setTimeout(() => setMessage(''), 2500);
    },
  });

  if (!form) return <div className="py-8 text-center text-xs font-semibold text-slate-400">Loading Free Qty configuration…</div>;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-6">
      <div className="mb-4 flex items-center justify-between border-b border-[#EAF1FA] pb-3.5">
        <div>
          <h2 className="font-bold text-[#0B1B45] text-sm">Free Quantity Configuration</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Configure whether Free Quantity input and calculations are enabled for Local and Distance billing types.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 pt-2">
        <label className="flex items-center justify-between rounded-2xl border border-[#D5E3F7] p-4 hover:bg-[#F8FAFD] cursor-pointer transition">
          <div>
            <div className="font-bold text-sm text-[#0B1B45]">Local Free Quantity</div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">Enable free quantity entry and invoice display for Local billing (Default: ON)</div>
          </div>
          <input
            type="checkbox"
            checked={form.allow_local_free_qty === 1}
            onChange={(e) => setForm({ ...form, allow_local_free_qty: e.target.checked ? 1 : 0 })}
            disabled={!canManage}
            className="h-5 w-5 rounded border-slate-300 text-[#2449C6] focus:ring-[#2449C6]/20"
          />
        </label>

        <label className="flex items-center justify-between rounded-2xl border border-[#D5E3F7] p-4 hover:bg-[#F8FAFD] cursor-pointer transition">
          <div>
            <div className="font-bold text-sm text-[#0B1B45]">Distance Free Quantity</div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">Enable free quantity entry and invoice display for Distance billing (Default: OFF)</div>
          </div>
          <input
            type="checkbox"
            checked={form.allow_distance_free_qty === 1}
            onChange={(e) => setForm({ ...form, allow_distance_free_qty: e.target.checked ? 1 : 0 })}
            disabled={!canManage}
            className="h-5 w-5 rounded border-slate-300 text-[#2449C6] focus:ring-[#2449C6]/20"
          />
        </label>
      </div>

      {canManage && (
        <div className="mt-6 flex items-center gap-3 pt-3 border-t border-[#EAF1FA]">
          <Button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending}
            icon={<Save size={15} />}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Configuration'}
          </Button>
          {message && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">{message}</span>}
        </div>
      )}
    </div>
  );
}

function PosPopupSettingsPanel({ canManage }) {
  const queryClient = useQueryClient();
  const posPopupQuery = useQuery({
    queryKey: ['settings-pos-popup'],
    queryFn: settingsApi.getPosPopup,
  });
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (posPopupQuery.data && !form) {
      setForm({
        pos_prev_week_popup_enabled: posPopupQuery.data.pos_prev_week_popup_enabled ? 1 : 0,
        prev_week_price_rule: posPopupQuery.data.prev_week_price_rule || 'AUTO',
        prev_week_popup_on_repeat_add: posPopupQuery.data.prev_week_popup_on_repeat_add ? 1 : 0,
      });
    }
  }, [posPopupQuery.data]);

  const saveMutation = useMutation({
    mutationFn: settingsApi.updatePosPopup,
    onSuccess: (data) => {
      setForm({
        pos_prev_week_popup_enabled: data.pos_prev_week_popup_enabled ? 1 : 0,
        prev_week_price_rule: data.prev_week_price_rule || 'AUTO',
        prev_week_popup_on_repeat_add: data.prev_week_popup_on_repeat_add ? 1 : 0,
      });
      queryClient.invalidateQueries({ queryKey: ['settings-pos-popup'] });
      setMessage('Saved successfully.');
      setTimeout(() => setMessage(''), 2500);
    },
  });

  if (!form) return <div className="py-8 text-center text-xs font-semibold text-slate-400">Loading popup settings…</div>;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-6">
      <div className="mb-4 flex items-center justify-between border-b border-[#EAF1FA] pb-3.5">
        <div>
          <h2 className="font-bold text-[#0B1B45] text-sm">Previous Week Selling Price Popup</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Configure the behavior of the automatic previous week's selling price comparison modal displayed during POS billing.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 pt-2">
        {/* Main Enable Toggle */}
        <label className="flex items-center justify-between rounded-2xl border border-[#D5E3F7] p-4 hover:bg-[#F8FAFD] cursor-pointer transition">
          <div>
            <div className="font-bold text-sm text-[#0B1B45]">Enable Price Comparison Popup</div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              Display previous week selling price comparison modal when adding products in POS (Default: Enabled)
            </div>
          </div>
          <input
            type="checkbox"
            data-testid="popup-enabled-checkbox"
            checked={form.pos_prev_week_popup_enabled === 1}
            onChange={(e) => setForm({ ...form, pos_prev_week_popup_enabled: e.target.checked ? 1 : 0 })}
            disabled={!canManage}
            className="h-5 w-5 rounded border-slate-300 text-[#2449C6] focus:ring-[#2449C6]/20"
          />
        </label>

        {/* Multi-Price Rule Selector */}
        <div className="rounded-2xl border border-[#D5E3F7] p-4 bg-[#F8FAFD]">
          <div className="mb-1 font-bold text-sm text-[#0B1B45]">Multiple Prices Resolution Rule</div>
          <div className="mb-3 text-xs font-medium text-slate-500">
            Determine how the reference rate is chosen when an item was sold at different rates during the previous week.
          </div>
          <select
            data-testid="rule-select"
            value={form.prev_week_price_rule}
            onChange={(e) => setForm({ ...form, prev_week_price_rule: e.target.value })}
            disabled={!canManage || form.pos_prev_week_popup_enabled === 0}
            className="w-full max-w-md rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 disabled:bg-[#F8FAFD]"
          >
            <option value="AUTO">AUTO — Show Price Range (₹ Min – ₹ Max) with Breakdown (Recommended)</option>
            <option value="LATEST">LATEST — Most Recent Selling Price in Previous Week</option>
            <option value="AVERAGE">AVERAGE — Weighted Average Selling Price</option>
            <option value="MOST_USED">MOST_USED — Rate with Highest Sold Quantity</option>
          </select>
        </div>

        {/* Repeat Add Toggle */}
        <label className="flex items-center justify-between rounded-2xl border border-[#D5E3F7] p-4 hover:bg-[#F8FAFD] cursor-pointer transition">
          <div>
            <div className="font-bold text-sm text-[#0B1B45]">Show Popup on Repeat Add</div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              Show popup again when clicking a product that is already in the current bill (Default: Disabled)
            </div>
          </div>
          <input
            type="checkbox"
            data-testid="repeat-add-checkbox"
            checked={form.prev_week_popup_on_repeat_add === 1}
            onChange={(e) => setForm({ ...form, prev_week_popup_on_repeat_add: e.target.checked ? 1 : 0 })}
            disabled={!canManage || form.pos_prev_week_popup_enabled === 0}
            className="h-5 w-5 rounded border-slate-300 text-[#2449C6] focus:ring-[#2449C6]/20"
          />
        </label>
      </div>

      {canManage && (
        <div className="mt-6 flex items-center gap-3 pt-3 border-t border-[#EAF1FA]">
          <Button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending}
            icon={<Save size={15} />}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Configuration'}
          </Button>
          {message && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">{message}</span>}
        </div>
      )}
    </div>
  );
}

function PricingAndStaffPanel({ canCatalog, canStaff }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {canCatalog && (
        <div className="rounded-2xl border border-[#D5E3F7] bg-white p-5 shadow-xs flex flex-col justify-between hover:border-[#2449C6] transition">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EDF5FF] text-[#2449C6] mb-3">
              <Tag size={20} />
            </div>
            <h3 className="font-bold text-[#0B1B45] text-sm">Price Adjustment</h3>
            <p className="text-xs text-slate-500 mt-1">Manage wholesale prices and batch rate adjustments across products.</p>
          </div>
          <Link
            to="/price-adjustment"
            className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0B1B45] to-[#2449C6] px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:opacity-95"
          >
            Open Wholesale Pricing →
          </Link>
        </div>
      )}
      {canCatalog && (
        <div className="rounded-2xl border border-[#D5E3F7] bg-white p-5 shadow-xs flex flex-col justify-between hover:border-[#2449C6] transition">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF8EB] text-[#C99E42] mb-3">
              <Tag size={20} />
            </div>
            <h3 className="font-bold text-[#0B1B45] text-sm">Staff Price Adjustment</h3>
            <p className="text-xs text-slate-500 mt-1">Configure retail rates and staff discount selling margins.</p>
          </div>
          <Link
            to="/price-adjustment?tab=retail"
            className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0B1B45] to-[#2449C6] px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:opacity-95"
          >
            Open Retail Pricing →
          </Link>
        </div>
      )}
      {canStaff && (
        <div className="rounded-2xl border border-[#D5E3F7] bg-white p-5 shadow-xs flex flex-col justify-between hover:border-[#2449C6] transition">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 mb-3">
              <ShieldCheck size={20} />
            </div>
            <h3 className="font-bold text-[#0B1B45] text-sm">Staff &amp; Permissions</h3>
            <p className="text-xs text-slate-500 mt-1">Manage user roles, system permissions, and employee branch access.</p>
          </div>
          <Link
            to="/staff"
            className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0B1B45] to-[#2449C6] px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:opacity-95"
          >
            Manage Staff Members →
          </Link>
        </div>
      )}
    </div>
  );
}

export function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = usePermission('settings.manage');
  const canBranches = usePermission('branches.manage');
  const canCatalog = usePermission('catalog.manage_items');
  const canStaff = usePermission('staff.manage_permissions');

  const validTabs = ['general', 'price-adjustment', 'staff-price-adjustment', 'staff'];
  const tabParam = searchParams.get('tab');
  const activeTab = validTabs.includes(tabParam) ? tabParam : 'general';

  const generalSubTabs = [
    { key: 'profile', label: 'Company Profile', icon: <Building size={15} />, content: <CompanyProfilePanel canManage={canManage} /> },
    { key: 'free-qty', label: 'Free Qty Configuration', icon: <Gift size={15} />, content: <FreeQtySettingsPanel canManage={canManage} /> },
    { key: 'pos-popup', label: 'POS Price Popup', icon: <TrendingUp size={15} />, content: <PosPopupSettingsPanel canManage={canManage} /> },
    { key: 'print', label: 'Thermal Printer Setup', icon: <Printer size={15} />, content: <PrintSettingsPanel canManage={canManage} /> },
    { key: 'sequences', label: 'Invoice Sequences', icon: <Hash size={15} />, content: <SequencesPanel canManage={canManage} /> },
  ];

  if (canBranches) {
    generalSubTabs.push({ key: 'branches', label: 'Branches', icon: <Store size={15} />, content: <Branches hideHeader /> });
  }

  const mainTabs = [
    {
      key: 'general',
      label: 'General Settings',
      icon: SettingsIcon,
      content: (
        <div className="space-y-4">
          <Tabs tabs={generalSubTabs} />
        </div>
      ),
    },
    {
      key: 'price-adjustment',
      label: 'Price Adjustment',
      icon: Tag,
      content: <PriceAdjustment hideHeader lockTab defaultTab="wholesale" />,
    },
    {
      key: 'staff-price-adjustment',
      label: 'Staff Price Adjustment',
      icon: Tag,
      content: <PriceAdjustment hideHeader lockTab defaultTab="retail" />,
    },
    {
      key: 'staff',
      label: 'Staff',
      icon: ShieldCheck,
      content: <StaffPermissions hideHeader />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D5E3F7] pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B1B45] to-[#2449C6] text-[#E8C985] shadow-md">
            <SettingsIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B1B45]">
              System Settings
            </h1>
            <p className="text-xs font-medium text-slate-500 mt-0.5">Manage business profile, thermal print templates, numbering sequences, price adjustments, and staff accounts</p>
          </div>
        </div>
      </div>
      <Tabs
        activeKey={activeTab}
        onTabChange={(k) => setSearchParams({ tab: k })}
        tabs={mainTabs}
      />
    </div>
  );
}

