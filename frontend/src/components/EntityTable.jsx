import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { Button } from './Button.jsx';

function FieldInput({ f, value, onChange }) {
  if (f.type === 'select') {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-36 rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-sm font-semibold text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
        required={f.required}
      >
        <option value="">--</option>
        {f.options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={f.type || 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-36 rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-sm font-semibold text-[#0B1B45] shadow-xs outline-none transition placeholder:text-slate-400 focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
      required={f.required}
      step={f.type === 'number' ? 'any' : undefined}
    />
  );
}

/**
 * Generic "add row + list + edit + delete" manager for simple catalog/party
 * lookup tables (categories, brands, tax codes, routes, ...). Pass onUpdate
 * to enable inline row editing — every table using this component gets
 * real Edit, not just Create, for free.
 */
export function EntityTable({ title, fields, columns, rows, onCreate, onUpdate, onDelete, canManage }) {
  const emptyForm = Object.fromEntries(fields.map((f) => [f.name, f.default ?? '']));
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editError, setEditError] = useState('');

  const handleChange = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onCreate(form);
      setForm(emptyForm);
    } catch (err) {
      setError(err?.response?.data?.errors?.join(', ') || err?.response?.data?.error || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditError('');
    setEditForm(Object.fromEntries(fields.map((f) => [f.name, row[f.name] ?? f.default ?? ''])));
  };

  const saveEdit = async (id) => {
    setEditError('');
    try {
      await onUpdate(id, editForm);
      setEditingId(null);
    } catch (err) {
      setEditError(err?.response?.data?.errors?.join(', ') || err?.response?.data?.error || 'Update failed');
    }
  };

  const handleDelete = async (id, label) => {
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    await onDelete(id);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[#D5E3F7] bg-white shadow-xs">
      <div className="border-b border-[#EAF1FA] bg-gradient-to-r from-[#F8FAFD] to-white px-5 py-4 font-bold tracking-tight text-[#0B1B45]">
        {title}
      </div>

      {canManage && (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 border-b border-[#EAF1FA] bg-[#FDFEFE] px-5 py-4">
          {fields.map((f) => (
            <div key={f.name}>
              <label className="mb-1 block text-[11px] font-bold tracking-wider uppercase text-slate-500">{f.label}</label>
              <FieldInput f={f} value={form[f.name]} onChange={(v) => handleChange(f.name, v)} />
            </div>
          ))}
          <Button
            type="submit"
            disabled={submitting}
            size="sm"
            icon={<Plus size={14} />}
            className="rounded-xl bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs hover:from-[#142B5C] hover:to-[#315BFF]"
          >
            Add
          </Button>
          {error && <span className="text-xs font-semibold text-rose-600">{error}</span>}
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#D5E3F7] bg-[#F1F5F9] text-left text-xs font-bold tracking-wider uppercase text-slate-800">
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-2.5 font-bold ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {c.label}
                </th>
              ))}
              {canManage && <th className="px-4 py-2.5 text-right font-bold">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAF1FA]">
            {rows.map((row) =>
              editingId === row.id ? (
                <tr key={row.id} className="bg-[#FFFDF5]">
                  <td colSpan={columns.length} className="px-4 py-2.5">
                    <div className="flex flex-wrap items-end gap-3">
                      {fields.map((f) => (
                        <div key={f.name}>
                          <label className="mb-1 block text-[11px] font-bold tracking-wider uppercase text-slate-500">{f.label}</label>
                          <FieldInput f={f} value={editForm[f.name]} onChange={(v) => setEditForm((p) => ({ ...p, [f.name]: v }))} />
                        </div>
                      ))}
                      {editError && <span className="text-xs font-semibold text-rose-600">{editError}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => saveEdit(row.id)}
                        title="Save"
                        className="rounded-lg p-1.5 text-emerald-600 transition hover:bg-emerald-50"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        title="Cancel"
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={row.id} className="transition hover:bg-[#F8FAFD]/70">
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-2.5 font-medium text-[#0B1B45] ${c.align === 'right' ? 'text-right whitespace-nowrap' : 'text-left'}`}>
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                  {canManage && (
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        {onUpdate && (
                          <button
                            onClick={() => startEdit(row)}
                            title="Edit"
                            className="rounded-lg p-1.5 text-slate-600 transition hover:bg-blue-50 hover:text-[#2449C6]"
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(row.id, row[columns[0].key])}
                          title="Delete"
                          className="rounded-lg p-1.5 text-slate-600 transition hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-5 py-10 text-center text-xs font-medium text-slate-400">
                  No records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
