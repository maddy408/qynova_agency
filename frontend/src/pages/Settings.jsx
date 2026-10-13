import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../api/admin';
import { Tabs } from '../components/Tabs';
import { usePermission } from '../hooks/usePermission';
import { Branches } from './Branches';

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

  if (!form) return <p className="text-ink-muted">Loading…</p>;

  const field = (name, label, span = '') => (
    <label className={`flex flex-col gap-1 ${span}`}>
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      <input
        value={form[name] ?? ''}
        onChange={(e) => setForm({ ...form, [name]: e.target.value })}
        disabled={!canManage}
        className="input disabled:bg-page"
      />
    </label>
  );

  return (
    <div className="card p-4">
      <div className="mb-3 font-semibold text-ink">Company Profile</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
        <button onClick={() => saveMutation.mutate(form)} className="mt-3 rounded bg-success px-4 py-1.5 text-sm font-semibold text-white">
          Save
        </button>
      )}
      {message && <span className="ml-3 text-sm text-success">{message}</span>}
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

  if (!form) return <p className="text-ink-muted">Loading…</p>;

  return (
    <div className="card p-4">
      <div className="mb-3 font-semibold text-ink">Thermal Printer Setup</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-muted">Printer type</span>
          <select value={form.printer_type} onChange={(e) => setForm({ ...form, printer_type: e.target.value })} disabled={!canManage} className="input disabled:bg-page">
            <option value="a4">A4</option>
            <option value="thermal_58">Thermal 58mm</option>
            <option value="thermal_80">Thermal 80mm</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-muted">Default print copies</span>
          <input type="number" min="1" value={form.default_print_copies} onChange={(e) => setForm({ ...form, default_print_copies: e.target.value })} disabled={!canManage} className="input disabled:bg-page" />
        </label>
        <label className="flex items-center gap-2 pt-5">
          <input type="checkbox" checked={!!Number(form.show_upi_qr_on_thermal)} onChange={(e) => setForm({ ...form, show_upi_qr_on_thermal: e.target.checked ? 1 : 0 })} disabled={!canManage} />
          <span className="text-sm text-ink-muted">Show UPI QR on thermal receipt</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-muted">Bank account no.</span>
          <input value={form.bank_account_no ?? ''} onChange={(e) => setForm({ ...form, bank_account_no: e.target.value })} disabled={!canManage} className="input disabled:bg-page" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-muted">Bank name</span>
          <input value={form.bank_name ?? ''} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} disabled={!canManage} className="input disabled:bg-page" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-muted">UPI ID</span>
          <input value={form.upi_id ?? ''} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} disabled={!canManage} className="input disabled:bg-page" />
        </label>
        <label className="col-span-2 flex flex-col gap-1 sm:col-span-3">
          <span className="text-xs font-medium text-ink-muted">Invoice footer note</span>
          <input value={form.invoice_footer_note ?? ''} onChange={(e) => setForm({ ...form, invoice_footer_note: e.target.value })} disabled={!canManage} className="input disabled:bg-page" />
        </label>
        <label className="col-span-2 flex flex-col gap-1 sm:col-span-3">
          <span className="text-xs font-medium text-ink-muted">Terms &amp; conditions</span>
          <textarea value={form.terms_and_conditions ?? ''} onChange={(e) => setForm({ ...form, terms_and_conditions: e.target.value })} disabled={!canManage} className="input disabled:bg-page" rows={3} />
        </label>
      </div>
      {canManage && (
        <button onClick={() => saveMutation.mutate(form)} className="mt-3 rounded bg-success px-4 py-1.5 text-sm font-semibold text-white">
          Save
        </button>
      )}
      {message && <span className="ml-3 text-sm text-success">{message}</span>}
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
    <div className="card p-4">
      <div className="mb-3 font-semibold text-ink">Invoice Sequence Prefixes</div>
      <p className="mb-3 text-xs text-ink-muted">Only the prefix can be changed — the running number keeps counting so numbering never repeats.</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-soft text-left text-xs uppercase text-ink-muted">
            <th className="px-2 py-2">Series</th><th className="px-2 py-2">Prefix</th><th className="px-2 py-2">Next number</th><th></th>
          </tr>
        </thead>
        <tbody>
          {sequences.map((s) => (
            <tr key={s.id} className="border-b border-border-soft">
              <td className="px-2 py-2 capitalize">{s.series.replace('_', '-')}</td>
              <td className="px-2 py-2">
                <input
                  value={edits[s.id] ?? s.prefix}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  disabled={!canManage}
                  className="input w-24 disabled:bg-page"
                />
              </td>
              <td className="px-2 py-2 text-ink-muted">{s.current_number + 1}</td>
              <td className="px-2 py-2 text-right">
                {canManage && (
                  <button onClick={() => saveMutation.mutate({ id: s.id, prefix: edits[s.id] ?? s.prefix })} className="text-xs font-medium text-gold hover:underline">
                    Save
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

  if (!form) return <p className="text-ink-muted">Loading…</p>;

  return (
    <div className="card p-4">
      <div className="mb-2 font-semibold text-ink">Free Quantity Configuration</div>
      <p className="mb-4 text-xs text-ink-muted">
        Configure whether Free Quantity input and calculations are enabled for Local and Distance billing types.
      </p>

      <div className="flex flex-col gap-4 border-t border-border-soft pt-4">
        <label className="flex items-center justify-between rounded-lg border border-border-soft p-3.5 hover:bg-page cursor-pointer">
          <div>
            <div className="font-semibold text-sm text-ink">Local Free Quantity</div>
            <div className="text-xs text-ink-muted">Enable free quantity entry and invoice display for Local billing (Default: ON)</div>
          </div>
          <input
            type="checkbox"
            checked={form.allow_local_free_qty === 1}
            onChange={(e) => setForm({ ...form, allow_local_free_qty: e.target.checked ? 1 : 0 })}
            disabled={!canManage}
            className="h-5 w-5 accent-gold"
          />
        </label>

        <label className="flex items-center justify-between rounded-lg border border-border-soft p-3.5 hover:bg-page cursor-pointer">
          <div>
            <div className="font-semibold text-sm text-ink">Distance Free Quantity</div>
            <div className="text-xs text-ink-muted">Enable free quantity entry and invoice display for Distance billing (Default: OFF)</div>
          </div>
          <input
            type="checkbox"
            checked={form.allow_distance_free_qty === 1}
            onChange={(e) => setForm({ ...form, allow_distance_free_qty: e.target.checked ? 1 : 0 })}
            disabled={!canManage}
            className="h-5 w-5 accent-gold"
          />
        </label>
      </div>

      {canManage && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending}
            className="rounded bg-success px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save Configuration
          </button>
          {message && <span className="text-sm font-semibold text-success">{message}</span>}
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

  if (!form) return <p className="text-ink-muted">Loading…</p>;

  return (
    <div className="card p-4">
      <div className="mb-2 font-semibold text-ink">Previous Week Selling Price Popup</div>
      <p className="mb-4 text-xs text-ink-muted">
        Configure the behavior of the automatic previous week's selling price comparison modal displayed during POS billing.
      </p>

      <div className="flex flex-col gap-4 border-t border-border-soft pt-4">
        {/* Main Enable Toggle */}
        <label className="flex items-center justify-between rounded-lg border border-border-soft p-3.5 hover:bg-page cursor-pointer">
          <div>
            <div className="font-semibold text-sm text-ink">Enable Price Comparison Popup</div>
            <div className="text-xs text-ink-muted">
              Display previous week selling price comparison modal when adding products in POS (Default: Enabled)
            </div>
          </div>
          <input
            type="checkbox"
            data-testid="popup-enabled-checkbox"
            checked={form.pos_prev_week_popup_enabled === 1}
            onChange={(e) => setForm({ ...form, pos_prev_week_popup_enabled: e.target.checked ? 1 : 0 })}
            disabled={!canManage}
            className="h-5 w-5 accent-gold"
          />
        </label>

        {/* Multi-Price Rule Selector */}
        <div className="rounded-lg border border-border-soft p-3.5 bg-page/50">
          <div className="mb-1 font-semibold text-sm text-ink">Multiple Prices Resolution Rule</div>
          <div className="mb-3 text-xs text-ink-muted">
            Determine how the reference rate is chosen when an item was sold at different rates during the previous week.
          </div>
          <select
            data-testid="rule-select"
            value={form.prev_week_price_rule}
            onChange={(e) => setForm({ ...form, prev_week_price_rule: e.target.value })}
            disabled={!canManage || form.pos_prev_week_popup_enabled === 0}
            className="input max-w-md bg-white disabled:bg-page"
          >
            <option value="AUTO">AUTO — Show Price Range (₹ Min – ₹ Max) with Breakdown (Recommended)</option>
            <option value="LATEST">LATEST — Most Recent Selling Price in Previous Week</option>
            <option value="AVERAGE">AVERAGE — Weighted Average Selling Price</option>
            <option value="MOST_USED">MOST_USED — Rate with Highest Sold Quantity</option>
          </select>
        </div>

        {/* Repeat Add Toggle */}
        <label className="flex items-center justify-between rounded-lg border border-border-soft p-3.5 hover:bg-page cursor-pointer">
          <div>
            <div className="font-semibold text-sm text-ink">Show Popup on Repeat Add</div>
            <div className="text-xs text-ink-muted">
              Show popup again when clicking a product that is already in the current bill (Default: Disabled)
            </div>
          </div>
          <input
            type="checkbox"
            data-testid="repeat-add-checkbox"
            checked={form.prev_week_popup_on_repeat_add === 1}
            onChange={(e) => setForm({ ...form, prev_week_popup_on_repeat_add: e.target.checked ? 1 : 0 })}
            disabled={!canManage || form.pos_prev_week_popup_enabled === 0}
            className="h-5 w-5 accent-gold"
          />
        </label>
      </div>

      {canManage && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending}
            className="rounded bg-success px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Configuration'}
          </button>
          {message && <span className="text-sm font-semibold text-success">{message}</span>}
        </div>
      )}
    </div>
  );
}

export function Settings() {
  const canManage = usePermission('settings.manage');
  const canBranches = usePermission('branches.manage');

  const tabs = [
    { key: 'profile', label: 'Company Profile', content: <CompanyProfilePanel canManage={canManage} /> },
    { key: 'free-qty', label: 'Free Quantity Configuration', content: <FreeQtySettingsPanel canManage={canManage} /> },
    { key: 'pos-popup', label: 'POS Selling Price Popup', content: <PosPopupSettingsPanel canManage={canManage} /> },
    { key: 'print', label: 'Thermal Printer Setup', content: <PrintSettingsPanel canManage={canManage} /> },
    { key: 'sequences', label: 'Invoice Sequences', content: <SequencesPanel canManage={canManage} /> },
  ];

  if (canBranches) {
    tabs.push({ key: 'branches', label: 'Branches', content: <Branches hideHeader /> });
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-ink">Settings</h1>
      <Tabs tabs={tabs} />
    </div>
  );
}
