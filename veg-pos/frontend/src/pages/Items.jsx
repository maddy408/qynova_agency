import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listItems, createItem, updateItem, deleteItem } from '../api/items';
import Pagination from '../components/Pagination';

const BLANK = { name_ta: '', name_en: '', code: '', unit: 'kg', default_rate: '', is_charge_item: false, active: true };

export default function Items() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(false);

  function load(p = page) {
    setLoading(true);
    listItems({ q, active_only: '0', page: p, limit: 10 })
      .then((res) => {
        if (res && res.data) {
          setItems(res.data);
          setTotal(res.total);
          setPage(res.page);
        } else if (Array.isArray(res)) {
          setItems(res);
          setTotal(res.length);
        }
      })
      .catch((err) => {
        console.error('Failed to load items:', err);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setPage(1);
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function handleSave(e) {
    e.preventDefault();
    const payload = { ...form, default_rate: form.default_rate === '' ? null : Number(form.default_rate) };
    if (form.id) {
      await updateItem(form.id, payload);
    } else {
      await createItem(payload);
    }
    setForm(null);
    load(page);
  }

  async function handleDelete(id) {
    if (!window.confirm(t('common.confirm_delete') || 'Are you sure you want to delete this item?')) return;
    try {
      await deleteItem(id);
      const targetPage = items.length === 1 && page > 1 ? page - 1 : page;
      setPage(targetPage);
      load(targetPage);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to delete item');
    }
  }

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('nav.items')}</h1>
        <button className="btn-primary" onClick={() => setForm(BLANK)}>
          + {t('common.add')}
        </button>
      </div>

      <input
        className="input max-w-sm"
        placeholder={t('common.search')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('items.code')}</th>
                <th>{t('items.name_ta')}</th>
                <th>{t('items.name_en')}</th>
                <th>{t('items.unit')}</th>
                <th>{t('items.default_rate')}</th>
                <th>{t('items.charge_item')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="font-mono">{it.code}</td>
                  <td>{it.name_ta}</td>
                  <td>{it.name_en}</td>
                  <td>{it.unit}</td>
                  <td>{it.default_rate ?? '—'}</td>
                  <td>{it.is_charge_item ? t('common.yes') : t('common.no')}</td>
                  <td>{it.active ? t('common.active') : t('common.inactive')}</td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button
                        className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded transition-colors inline-flex items-center justify-center"
                        onClick={() => setForm(it)}
                        title={t('common.edit')}
                        type="button"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors inline-flex items-center justify-center"
                        onClick={() => handleDelete(it.id)}
                        title={t('common.delete')}
                        type="button"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-gray-400">
                    {loading ? t('common.loading') : 'No items found'}
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
          onPageChange={(p) => {
            setPage(p);
            load(p);
          }}
          label={t('nav.items')}
        />
      </div>

      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 no-print overflow-y-auto">
          <form onSubmit={handleSave} className="card w-full max-w-md space-y-3 my-auto max-h-[90vh] overflow-y-auto shadow-xl">
            <h2 className="font-bold text-lg">{form.id ? t('common.edit') : t('common.add')}</h2>
            <div>
              <label className="label">{t('items.name_ta')}</label>
              <input className="input" required value={form.name_ta} onChange={(e) => setForm({ ...form, name_ta: e.target.value })} />
            </div>
            <div>
              <label className="label">{t('items.name_en')}</label>
              <input className="input" required value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{t('items.code')}</label>
                <input className="input" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <label className="label">{t('items.unit')}</label>
                <input className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">{t('items.default_rate')}</label>
              <input className="input" type="number" step="0.01" value={form.default_rate ?? ''} onChange={(e) => setForm({ ...form, default_rate: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.is_charge_item} onChange={(e) => setForm({ ...form, is_charge_item: e.target.checked })} />
              {t('items.charge_item')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              {t('common.active')}
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setForm(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn-primary">{t('common.save')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
