import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Search, Edit2, CheckCircle2, Power, Plus } from 'lucide-react';
import { branchesApi } from '../api/branches';
import { usePermission } from '../hooks/usePermission';
import { Button } from '../components/Button.jsx';

const emptyForm = {
  branch_name: '',
  print_name: '',
  gstin: '',
  pan_number: '',
  address_line1: '',
  city: '',
  state: '',
  pincode: '',
  phone: '',
  support_email: '',
  status: 'active',
};

export function Branches({ hideHeader = false }) {
  const canManage = usePermission('branches.manage');
  const queryClient = useQueryClient();
  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: branchesApi.list });
  const branches = branchesQuery.data || [];

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['branches'] });

  const createMutation = useMutation({
    mutationFn: branchesApi.create,
    onSuccess: () => {
      invalidate();
      resetForm();
      showSuccess('Branch created successfully!');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => branchesApi.update ? branchesApi.update(id, data) : Promise.reject(new Error('Update not implemented')),
    onSuccess: () => {
      invalidate();
      resetForm();
      showSuccess('Branch updated successfully!');
    },
  });

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError('');
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleEdit = (b) => {
    setEditingId(b.id);
    setForm({
      branch_name: b.branch_name || '',
      print_name: b.print_name || '',
      gstin: b.gstin || '',
      pan_number: b.pan_number || '',
      address_line1: b.address_line1 || '',
      city: b.city || '',
      state: b.state || '',
      pincode: b.pincode || '',
      phone: b.phone || '',
      support_email: b.support_email || '',
      status: b.status || 'active',
    });
    setError('');
  };

  const updateField = (name) => (e) => setForm((prev) => ({ ...prev, [name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId && branchesApi.update) {
        await updateMutation.mutateAsync({ id: editingId, data: form });
      } else {
        await createMutation.mutateAsync(form);
      }
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to save branch');
    }
  };

  const filteredBranches = branches.filter((b) => {
    const queryMatch =
      b.branch_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.phone?.includes(searchQuery) ||
      b.gstin?.toLowerCase().includes(searchQuery.toLowerCase());
    const statusMatch = statusFilter === 'all' || b.status === statusFilter;
    return queryMatch && statusMatch;
  });

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D5E3F7] pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B1B45] to-[#2449C6] text-[#E8C985] shadow-md">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#0B1B45]">
                Branch Management
              </h1>
              <p className="text-xs font-medium text-slate-500 mt-0.5">Configure company branches, invoice headers, tax details, and locations</p>
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
        {/* Left Column: Form */}
        <div className="lg:col-span-4">
          <div className="overflow-hidden rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-5 space-y-4 sticky top-6">
            <div className="flex items-center justify-between border-b border-[#EAF1FA] pb-3.5">
              <h2 className="font-bold text-[#0B1B45] text-sm flex items-center gap-2">
                {editingId ? <Edit2 className="w-4 h-4 text-[#2449C6]" /> : <Plus className="w-4 h-4 text-[#2449C6]" />}
                {editingId ? 'Edit Branch' : 'Create New Branch'}
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
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">Branch Name *</label>
                <input
                  required
                  type="text"
                  placeholder="Main Showroom / Warehouse"
                  value={form.branch_name}
                  onChange={updateField('branch_name')}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">Print Name (Header) *</label>
                <input
                  required
                  type="text"
                  placeholder="Header title printed on invoice"
                  value={form.print_name}
                  onChange={updateField('print_name')}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">GSTIN</label>
                  <input
                    type="text"
                    placeholder="33AAAAA0000A1Z5"
                    value={form.gstin}
                    onChange={updateField('gstin')}
                    className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">PAN Number</label>
                  <input
                    type="text"
                    placeholder="ABCDE1234F"
                    value={form.pan_number}
                    onChange={updateField('pan_number')}
                    className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">Phone</label>
                  <input
                    type="text"
                    placeholder="+91 9876543210"
                    value={form.phone}
                    onChange={updateField('phone')}
                    className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="branch@store.com"
                    value={form.support_email}
                    onChange={updateField('support_email')}
                    className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">Address *</label>
                <input
                  required
                  type="text"
                  placeholder="Street Address, Area"
                  value={form.address_line1}
                  onChange={updateField('address_line1')}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">City *</label>
                  <input
                    required
                    type="text"
                    placeholder="City"
                    value={form.city}
                    onChange={updateField('city')}
                    className="w-full rounded-xl border border-[#D5E3F7] bg-white px-2.5 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">State *</label>
                  <input
                    required
                    type="text"
                    placeholder="State"
                    value={form.state}
                    onChange={updateField('state')}
                    className="w-full rounded-xl border border-[#D5E3F7] bg-white px-2.5 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">Pincode</label>
                  <input
                    type="text"
                    placeholder="600001"
                    value={form.pincode}
                    onChange={updateField('pincode')}
                    className="w-full rounded-xl border border-[#D5E3F7] bg-white px-2.5 py-2 text-sm font-medium text-[#0B1B45] shadow-xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Status</label>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-semibold text-[#0B1B45]">
                    <input
                      type="radio"
                      name="branchStatus"
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
                      name="branchStatus"
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

              {canManage && (
                <div className="pt-2 flex items-center gap-2">
                  <Button type="submit" variant="primary" loading={createMutation.isPending || updateMutation.isPending} className="w-full">
                    {editingId ? 'Update Branch' : 'Save Branch'}
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

        {/* Right Column: Directory Data Table */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search branches..."
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
                All ({branches.length})
              </button>
              <button
                onClick={() => setStatusFilter('active')}
                className={`px-3.5 py-1.5 rounded-xl font-bold transition text-sm ${
                  statusFilter === 'active'
                    ? 'bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs'
                    : 'bg-[#F8FAFD] text-slate-600 hover:bg-[#EDF5FF]'
                }`}
              >
                Active ({branches.filter((b) => b.status === 'active' || b.status !== 'inactive').length})
              </button>
              <button
                onClick={() => setStatusFilter('inactive')}
                className={`px-3.5 py-1.5 rounded-xl font-bold transition text-sm ${
                  statusFilter === 'inactive'
                    ? 'bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs'
                    : 'bg-[#F8FAFD] text-slate-600 hover:bg-[#EDF5FF]'
                }`}
              >
                Inactive ({branches.filter((b) => b.status === 'inactive').length})
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#D5E3F7] bg-white shadow-xs">
            <div className="px-5 py-4 border-b border-[#EAF1FA] bg-gradient-to-r from-[#F8FAFD] to-white flex items-center justify-between">
              <h3 className="font-bold text-[#0B1B45] text-sm">Branches Directory</h3>
              <span className="text-xs font-semibold text-slate-400">{filteredBranches.length} record(s)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#EAF1FA] bg-[#F8FAFD] text-xs font-bold uppercase tracking-wider text-slate-600">
                    <th className="px-3.5 py-2.5">Branch Name</th>
                    <th className="px-3.5 py-2.5">Print Title</th>
                    <th className="px-3.5 py-2.5">City / Address</th>
                    <th className="px-3.5 py-2.5">GSTIN / Phone</th>
                    <th className="px-3.5 py-2.5">Main</th>
                    <th className="px-3.5 py-2.5">Status</th>
                    <th className="px-3.5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAF1FA]">
                  {filteredBranches.map((b) => {
                    const isActive = b.status !== 'inactive';
                    return (
                      <tr key={b.id} className="hover:bg-[#F8FAFD]/70 transition">
                        <td className="px-3.5 py-2.5 font-bold text-[#0B1B45]">{b.branch_name}</td>
                        <td className="px-3.5 py-2.5 font-medium text-slate-600">{b.print_name || '-'}</td>
                        <td className="px-3.5 py-2.5 font-medium text-slate-600">
                          {b.city ? `${b.city}, ${b.state || ''}` : b.address_line1 || '-'}
                        </td>
                        <td className="px-3.5 py-2.5 font-medium text-slate-600">
                          {b.gstin || b.phone || '-'}
                        </td>
                        <td className="px-3.5 py-2.5">
                          {b.is_main_branch ? (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#EDF5FF] text-[#2449C6] border border-[#D5E3F7]">
                              Main Branch
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
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
                        <td className="px-3.5 py-2.5 text-right space-x-1">
                          {canManage && (
                            <button
                              onClick={() => handleEdit(b)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-[#2449C6] transition"
                              title="Edit Branch"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredBranches.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3.5 py-8 text-center text-slate-400 text-sm font-medium">
                        No branches match your search criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

