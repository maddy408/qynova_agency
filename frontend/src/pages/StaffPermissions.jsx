import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Search, Plus, Edit2, CheckCircle2, UserCheck, Lock, UserX, Loader2, AlertTriangle, Users } from 'lucide-react';
import { staffApi, rolesApi } from '../api/admin';
import { branchesApi } from '../api/branches';
import { usePermission } from '../hooks/usePermission';
import { Button } from '../components/Button.jsx';

export function StaffPermissions({ hideHeader = false }) {
  const canManageAccounts = usePermission('staff.manage_accounts');
  const canManagePermissions = usePermission('staff.manage_permissions');

  const queryClient = useQueryClient();
  const staffQuery = useQuery({ queryKey: ['staff'], queryFn: staffApi.list });
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list });
  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: branchesApi.list });

  const staff = staffQuery.data || [];
  const roles = rolesQuery.data || [];
  const branches = branchesQuery.data || [];

  const [form, setForm] = useState({ name: '', email: '', password: '', role_id: '', branch_id: '', phone: '', status: 'active' });
  const [editingId, setEditingId] = useState(null);
  const [selectedUserForPerms, setSelectedUserForPerms] = useState(null);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['staff'] });

  const createMutation = useMutation({
    mutationFn: staffApi.create,
    onSuccess: () => {
      invalidate();
      resetForm();
      showSuccess('Staff account created successfully!');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => staffApi.update(id, data),
    onSuccess: () => {
      invalidate();
      resetForm();
      showSuccess('Staff account updated successfully!');
    },
  });

  const resetForm = () => {
    setForm({ name: '', email: '', password: '', role_id: '', branch_id: '', phone: '', status: 'active' });
    setEditingId(null);
    setError('');
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleEdit = (u) => {
    setEditingId(u.id);
    setForm({
      name: u.name || '',
      email: u.email || '',
      password: '', // Blank unless updating
      role_id: u.role_id ? String(u.role_id) : '',
      branch_id: u.branch_id ? String(u.branch_id) : '',
      phone: u.phone || '',
      status: u.status || 'active',
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.email.trim() || !form.role_id) {
      setError('Name, email, and role are required.');
      return;
    }

    try {
      if (editingId) {
        const payload = {
          name: form.name.trim(),
          phone: form.phone || null,
          role_id: Number(form.role_id),
          branch_id: form.branch_id ? Number(form.branch_id) : null,
          status: form.status,
        };
        if (form.password) payload.password = form.password;
        await updateMutation.mutateAsync({ id: editingId, data: payload });
      } else {
        if (!form.password) {
          setError('Password is required for new accounts.');
          return;
        }
        await createMutation.mutateAsync({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role_id: Number(form.role_id),
          branch_id: form.branch_id ? Number(form.branch_id) : null,
          phone: form.phone || null,
          status: form.status,
        });
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save staff account');
    }
  };

  const filteredStaff = staff.filter((u) => {
    const queryMatch =
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.role_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phone?.includes(searchQuery);
    const statusMatch = statusFilter === 'all' || u.status === statusFilter;
    return queryMatch && statusMatch;
  });

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D5E3F7] pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B1B45] to-[#2449C6] text-[#E8C985] shadow-md">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#0B1B45]">
                Staff &amp; Permissions
              </h1>
              <p className="text-xs font-medium text-slate-500 mt-0.5">Manage user credentials, branch assignments, roles, and granular security overrides</p>
            </div>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-4 py-3 rounded-2xl flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column Form */}
        <div className="lg:col-span-4">
          <div className="overflow-hidden rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-5 space-y-4 sticky top-6">
            <div className="flex items-center justify-between border-b border-[#EAF1FA] pb-3.5">
              <h2 className="font-bold text-[#0B1B45] text-sm flex items-center gap-2">
                {editingId ? <Edit2 className="w-4 h-4 text-[#2449C6]" /> : <Plus className="w-4 h-4 text-[#2449C6]" />}
                {editingId ? 'Edit Staff Account' : 'Create Staff Account'}
              </h2>
              {editingId && (
                <button onClick={resetForm} className="text-xs font-bold text-[#2449C6] hover:underline">
                  Cancel Edit
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {error && <div className="text-xs font-semibold text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-200">{error}</div>}

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">Full Name *</label>
                <input
                  required
                  type="text"
                  placeholder="John Doe"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">Email Address *</label>
                <input
                  required
                  disabled={Boolean(editingId)}
                  type="email"
                  placeholder="john@store.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 disabled:bg-[#F8FAFD] disabled:text-slate-400"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">
                  {editingId ? 'New Password (leave empty to keep current)' : 'Password *'}
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">Role *</label>
                  <select
                    required
                    value={form.role_id}
                    onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                    className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                  >
                    <option value="">Select Role</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">Branch</label>
                  <select
                    value={form.branch_id}
                    onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                    className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                  >
                    <option value="">All / No Home Branch</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.branch_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">Phone Number</label>
                <input
                  type="text"
                  placeholder="+91 9876543210"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Status</label>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-semibold text-[#0B1B45]">
                    <input
                      type="radio"
                      name="staffStatus"
                      checked={form.status === 'active'}
                      onChange={() => setForm((prev) => ({ ...prev, status: 'active' }))}
                      className="form-radio text-[#2449C6] focus:ring-[#2449C6]/20"
                    />
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                      Active
                    </span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-500">
                    <input
                      type="radio"
                      name="staffStatus"
                      checked={form.status === 'inactive'}
                      onChange={() => setForm((prev) => ({ ...prev, status: 'inactive' }))}
                      className="form-radio text-slate-400 focus:ring-slate-400/20"
                    />
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-slate-400 inline-block"></span>
                      Inactive
                    </span>
                  </label>
                </div>
              </div>

              {canManageAccounts && (
                <div className="pt-2 flex items-center gap-2">
                  <Button type="submit" variant="primary" loading={createMutation.isPending || updateMutation.isPending} className="w-full">
                    {editingId ? 'Update Staff Account' : 'Save Staff Account'}
                  </Button>
                  {editingId && (
                    <Button type="button" variant="secondary" onClick={resetForm}>
                      Reset
                    </Button>
                  )}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Right Column Table */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search staff by name, email, role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[#D5E3F7] bg-white pl-9 pr-3 py-2 text-sm font-medium text-[#0B1B45] outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500 font-bold uppercase tracking-wider text-xs">Filter:</span>
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3.5 py-1.5 rounded-xl font-bold transition text-sm ${
                  statusFilter === 'all'
                    ? 'bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs'
                    : 'bg-[#F8FAFD] text-slate-600 hover:bg-[#EDF5FF]'
                }`}
              >
                All ({staff.length})
              </button>
              <button
                onClick={() => setStatusFilter('active')}
                className={`px-3.5 py-1.5 rounded-xl font-bold transition text-sm ${
                  statusFilter === 'active'
                    ? 'bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs'
                    : 'bg-[#F8FAFD] text-slate-600 hover:bg-[#EDF5FF]'
                }`}
              >
                Active ({staff.filter((s) => s.status === 'active' || s.status !== 'inactive').length})
              </button>
              <button
                onClick={() => setStatusFilter('inactive')}
                className={`px-3.5 py-1.5 rounded-xl font-bold transition text-sm ${
                  statusFilter === 'inactive'
                    ? 'bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs'
                    : 'bg-[#F8FAFD] text-slate-600 hover:bg-[#EDF5FF]'
                }`}
              >
                Inactive ({staff.filter((s) => s.status === 'inactive').length})
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#D5E3F7] bg-white shadow-xs">
            <div className="px-5 py-4 border-b border-[#EAF1FA] bg-gradient-to-r from-[#F8FAFD] to-white flex items-center justify-between">
              <h3 className="font-bold text-[#0B1B45] text-sm">Staff Directory</h3>
              <span className="text-xs font-semibold text-slate-400">{filteredStaff.length} member(s)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#EAF1FA] bg-[#F8FAFD] text-xs font-bold uppercase tracking-wider text-slate-600">
                    <th className="px-3.5 py-2.5">Staff Member</th>
                    <th className="px-3.5 py-2.5">Email / Phone</th>
                    <th className="px-3.5 py-2.5">Role</th>
                    <th className="px-3.5 py-2.5">Branch</th>
                    <th className="px-3.5 py-2.5">Status</th>
                    <th className="px-3.5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAF1FA]">
                  {staffQuery.isLoading && (
                    <tr>
                      <td colSpan={6} className="px-3.5 py-10 text-center text-slate-400 text-sm">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-[#2449C6]" />
                          Loading staff…
                        </div>
                      </td>
                    </tr>
                  )}
                  {!staffQuery.isLoading && staffQuery.isError && (
                    <tr>
                      <td colSpan={6} className="px-3.5 py-10 text-center text-sm">
                        <div className="flex flex-col items-center gap-2 text-rose-600 font-semibold">
                          <AlertTriangle className="w-5 h-5 text-rose-500" />
                          Unable to load staff users. Please try again.
                          <button
                            type="button"
                            onClick={() => staffQuery.refetch()}
                            className="mt-1 px-3 py-1 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold hover:bg-rose-100 transition"
                          >
                            Retry
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!staffQuery.isLoading && !staffQuery.isError && staff.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3.5 py-10 text-center text-slate-400 text-sm">
                        <div className="flex flex-col items-center gap-2">
                          <Users className="w-6 h-6 text-slate-400" />
                          No staff accounts yet — create the first one on the left.
                        </div>
                      </td>
                    </tr>
                  )}
                  {!staffQuery.isLoading && !staffQuery.isError && staff.length > 0 && filteredStaff.map((u) => {
                    const isActive = u.status !== 'inactive';
                    return (
                      <tr key={u.id} className="hover:bg-[#F8FAFD]/70 transition">
                        <td className="px-3.5 py-2.5 font-bold text-[#0B1B45]">{u.name}</td>
                        <td className="px-3.5 py-2.5 text-slate-600 font-medium">
                          <div>{u.email}</div>
                          {u.phone && <div className="text-xs text-slate-400">{u.phone}</div>}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <span className="px-2.5 py-0.5 rounded-full text-xs bg-[#EDF5FF] text-[#2449C6] font-bold border border-[#D5E3F7]">
                            {u.role_name}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-600 font-medium">{u.branch_name || 'All Branches'}</td>
                        <td className="px-3.5 py-2.5">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-right space-x-1.5">
                          {canManageAccounts && (
                            <button
                              onClick={() => handleEdit(u)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-[#2449C6] transition"
                              title="Edit Staff"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canManagePermissions && (
                            <button
                              onClick={() => setSelectedUserForPerms(u)}
                              className="px-2.5 py-1 rounded-xl bg-amber-50 text-amber-800 border border-amber-200/80 text-xs font-bold hover:bg-amber-100 transition"
                            >
                              Permissions
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!staffQuery.isLoading && !staffQuery.isError && staff.length > 0 && filteredStaff.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs font-medium">
                        No staff members found matching search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {selectedUserForPerms && <PermissionsPanel user={selectedUserForPerms} onClose={() => setSelectedUserForPerms(null)} />}
    </div>
  );
}

function PermissionsPanel({ user, onClose }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState({});
  const permsQuery = useQuery({ queryKey: ['staff-permissions', user.id], queryFn: () => staffApi.getPermissions(user.id) });

  const saveMutation = useMutation({
    mutationFn: (overrides) => staffApi.setPermissions(user.id, overrides),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-permissions', user.id] });
      setPending({});
    },
  });

  const rows = permsQuery.data || [];
  const grouped = useMemo(() => {
    const g = {};
    for (const r of rows) {
      g[r.module] ??= [];
      g[r.module].push(r);
    }
    return g;
  }, [rows]);

  const currentOverride = (row) => (row.id in pending ? pending[row.id] : row.override);

  const cycle = (row) => {
    const current = currentOverride(row);
    const next = current === null ? true : current === true ? false : null;
    setPending((prev) => ({ ...prev, [row.id]: next }));
  };

  const save = () => {
    const overrides = Object.entries(pending).map(([permission_id, is_granted]) => ({
      permission_id: Number(permission_id),
      is_granted,
    }));
    saveMutation.mutate(overrides);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-[#D5E3F7] bg-white shadow-2xl flex flex-col space-y-0">
        <div className="p-5 border-b border-[#EAF1FA] bg-gradient-to-r from-[#F8FAFD] to-white flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[#0B1B45] flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-500" />
              Granular Permissions — {user.name}
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Click badge to cycle: <span className="font-semibold text-slate-700">Role default</span> → <span className="font-bold text-emerald-600">Force allow</span> → <span className="font-bold text-rose-600">Force deny</span>
            </p>
          </div>
          <button onClick={onClose} className="rounded-xl p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition font-bold text-sm">✕</button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {Object.entries(grouped).map(([module, perms]) => (
            <div key={module} className="space-y-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#2449C6] flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#2449C6]" />
                {module}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {perms.map((row) => {
                  const override = currentOverride(row);
                  const effective = override === null ? row.role_grants : override;
                  let badgeLabel = 'Role Default';
                  let badgeClass = 'bg-[#EDF5FF] text-slate-600 border-[#D5E3F7]';
                  if (override === true) {
                    badgeLabel = 'Force Allow';
                    badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-300';
                  }
                  if (override === false) {
                    badgeLabel = 'Force Deny';
                    badgeClass = 'bg-rose-50 text-rose-700 border-rose-300';
                  }

                  return (
                    <div
                      key={row.id}
                      onClick={() => cycle(row)}
                      className="p-3 rounded-2xl border border-[#D5E3F7] hover:border-[#2449C6]/40 bg-white hover:bg-[#F5F8FF] cursor-pointer flex items-center justify-between gap-2.5 transition shadow-2xs"
                    >
                      <span className={`text-xs ${effective ? 'text-[#0B1B45] font-bold' : 'text-slate-400 font-medium'}`}>{row.label}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass} shrink-0`}>
                        {badgeLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-[#EAF1FA] flex justify-end gap-2 bg-[#F8FAFD]">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={save}
            loading={saveMutation.isPending}
            disabled={Object.keys(pending).length === 0}
          >
            Save Overrides
          </Button>
        </div>
      </div>
    </div>
  );
}

