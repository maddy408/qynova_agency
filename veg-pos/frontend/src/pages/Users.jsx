import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listUsers, createUser, updateUser } from '../api/settings';

const BLANK = { name: '', username: '', password: '', pin: '', role: 'staff' };

export default function Users({ embedded = false }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(null);

  function load() {
    listUsers().then(setUsers);
  }

  useEffect(load, []);

  async function handleSave(e) {
    e.preventDefault();
    if (form.id) {
      await updateUser(form.id, form);
    } else {
      await createUser(form);
    }
    setForm(null);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {!embedded ? (
          <h1 className="text-xl font-bold text-gray-900">{t('nav.users')}</h1>
        ) : (
          <div>
            <h2 className="text-lg font-bold text-gray-900">{t('nav.users')}</h2>
            <p className="text-xs text-gray-500">Manage operator logins and access roles</p>
          </div>
        )}
        <button className="btn-primary" onClick={() => setForm(BLANK)}>
          + {t('common.add')}
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>Username</th>
              <th>Role</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-medium text-gray-900">{u.name}</td>
                <td>{u.username}</td>
                <td>
                  <span className="capitalize px-2 py-0.5 rounded text-xs bg-slate-100 font-medium text-slate-700">
                    {u.role}
                  </span>
                </td>
                <td>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                    u.active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {u.active ? t('common.active') : t('common.inactive')}
                  </span>
                </td>
                <td className="py-2 px-3 whitespace-nowrap">
                  <button
                    className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded transition-colors inline-flex items-center justify-center"
                    onClick={() => setForm({ ...u, password: '', pin: '' })}
                    title={t('common.edit')}
                    type="button"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 no-print p-4">
          <form onSubmit={handleSave} className="card w-full max-w-md space-y-3">
            <h2 className="font-bold text-lg text-gray-900">{form.id ? t('common.edit') : t('common.add')}</h2>
            <div>
              <label className="label">{t('common.name')}</label>
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            {!form.id && (
              <div>
                <label className="label">Username</label>
                <input className="input" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
            )}
            <div>
              <label className="label">Role</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="staff">Billing Staff</option>
              </select>
            </div>
            <div>
              <label className="label">Password {form.id && '(leave blank to keep)'}</label>
              <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!form.id} />
            </div>
            <div>
              <label className="label">Quick PIN (optional)</label>
              <input className="input" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
            </div>
            {form.id && (
              <label className="flex items-center gap-2 text-sm pt-1">
                <input type="checkbox" checked={!!form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                {t('common.active')}
              </label>
            )}
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
