import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  Tag, CheckCircle2, Power, Edit2, Trash2, Search, Plus,
  Package, Sparkles, Layers, Boxes, Scale, Receipt, Percent
} from 'lucide-react';
import { categoriesApi, brandsApi, productLinesApi, taxCodesApi, stockUnitsApi, categoryBrandsApi } from '../api/catalog';
import { EntityTable } from '../components/EntityTable';
import { Tabs } from '../components/Tabs';
import { Button } from '../components/Button.jsx';
import { usePermission } from '../hooks/usePermission';
import { ItemsPanel } from './ItemsPanel.jsx';

function useEntity(key, api) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: [key], queryFn: api.list });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [key] });
  const create = useMutation({ mutationFn: api.create, onSuccess: invalidate });
  const update = useMutation({ mutationFn: ({ id, data }) => api.update(id, data), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: api.remove, onSuccess: invalidate });

  return { rows: query.data || [], isLoading: query.isLoading, create, update, remove };
}

function CategoriesPanel({ canManage }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });

  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['categories'] });

  const createMutation = useMutation({
    mutationFn: categoriesApi.create,
    onSuccess: () => {
      invalidate();
      resetForm();
      showSuccess('Category created successfully!');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => categoriesApi.update(id, data),
    onSuccess: () => {
      invalidate();
      resetForm();
      showSuccess('Category updated successfully!');
    },
  });

  const removeMutation = useMutation({
    mutationFn: categoriesApi.remove,
    onSuccess: () => {
      invalidate();
      showSuccess('Category deleted successfully.');
    },
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

  const handleEdit = (category) => {
    setEditingId(category.id);
    setName(category.name || '');
    setIsActive(category.is_active === undefined ? true : Boolean(Number(category.is_active)));
    setFormError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Category name is required.');
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

  const categories = query.data || [];

  const filteredCategories = categories.filter((c) => {
    const matchesSearch = c.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const cActive = c.is_active === undefined ? true : Boolean(Number(c.is_active));
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && cActive) ||
      (statusFilter === 'inactive' && !cActive);
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 font-sans">
      {/* LEFT SIDE: Create / Edit Category Form */}
      <div className="lg:col-span-4">
        <div className="card p-5 border border-[#D8E6F7] bg-white shadow-[0_2px_12px_rgba(15,30,65,0.04)] rounded-2xl sticky top-4">
          <div className="flex items-center justify-between border-b border-[#D8E6F7] pb-3 mb-4">
            <h2 className="text-base font-black text-[#0F1E4A] flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#EEF5FF] text-[#315BFF] border border-[#D5E5FC]">
                <Tag size={15} />
              </span>
              <span>{editingId ? 'Edit Category' : 'Create New Category'}</span>
            </h2>
            {editingId && (
              <span className="rounded-full bg-[#FFF3D8] border border-[#FDE68A] px-2.5 py-0.5 text-[11px] font-bold text-[#92400E]">
                Editing #{editingId}
              </span>
            )}
          </div>

          {successMsg && (
            <div className="mb-4 rounded-xl bg-[#ECFDF5] p-3 text-xs font-bold text-[#059669] border border-[#A7F3D0] flex items-center gap-1.5">
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {formError && (
            <div className="mb-4 rounded-xl bg-[#FEF2F2] p-3 text-xs font-bold text-[#E11D48] border border-[#FECDD3]">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5A6E8C] mb-1.5">
                Category Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Beverages, Electronics..."
                disabled={!canManage}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5A6E8C] mb-1.5">
                Status
              </label>
              <div className="flex items-center gap-4 bg-[#F8FAFD] p-3 rounded-2xl border border-[#D8E6F7]">
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer text-[#0F1E4A]">
                  <input
                    type="radio"
                    name="status"
                    checked={isActive}
                    onChange={() => setIsActive(true)}
                    disabled={!canManage}
                    className="accent-[#059669] h-4 w-4"
                  />
                  <span className="flex items-center gap-1 text-[#059669]">
                    <Power size={14} /> Active
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer text-[#0F1E4A]">
                  <input
                    type="radio"
                    name="status"
                    checked={!isActive}
                    onChange={() => setIsActive(false)}
                    disabled={!canManage}
                    className="accent-[#E11D48] h-4 w-4"
                  />
                  <span className="flex items-center gap-1 text-[#64789D]">
                    <Power size={14} /> Inactive
                  </span>
                </label>
              </div>
            </div>

            {canManage && (
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 justify-center rounded-xl bg-gradient-to-r from-[#0B1B45] via-[#142B5C] to-[#2449C6] py-2.5 text-xs font-bold text-white shadow-xs hover:brightness-110 active:scale-95 disabled:opacity-40 transition-all"
                >
                  {editingId ? 'Update Category' : 'Save Category'}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl border border-[#D5E3F7] bg-white px-4 py-2.5 text-xs font-bold text-[#5A6E8C] hover:bg-[#EDF5FF] transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* RIGHT SIDE: Category List (Get Categories Call & Table) */}
      <div className="lg:col-span-8">
        <div className="card border border-[#D8E6F7] bg-white shadow-[0_2px_12px_rgba(15,30,65,0.04)] rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-[#D8E6F7] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white">
            <div>
              <h2 className="text-base font-black text-[#0F1E4A] flex items-center gap-2">
                <span>Category Directory</span>
                <span className="rounded-full bg-[#EEF5FF] text-[#315BFF] border border-[#D5E5FC] px-2.5 py-0.5 text-xs font-bold">
                  {filteredCategories.length} Total
                </span>
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7E92B2]" size={14} />
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input pl-8 py-1.5 text-xs w-44 sm:w-56"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input py-1.5 text-xs w-28"
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#D8E6F7] bg-[#F8FAFD] text-[11px] font-bold uppercase tracking-wider text-[#5A6E8C]">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Category Name</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created Date</th>
                  {canManage && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAF1FA]">
                {filteredCategories.map((c, index) => {
                  const cActive = c.is_active === undefined ? true : Boolean(Number(c.is_active));
                  return (
                    <tr key={c.id} className="hover:bg-[#F8FAFD]/70 transition-colors">
                      <td className="px-4 py-3 font-semibold text-[#94A3B8]">{index + 1}</td>
                      <td className="px-4 py-3 font-bold text-[#0F1E4A]">{c.name}</td>
                      <td className="px-4 py-3">
                        {cActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[11px] font-bold text-[#059669] border border-[#C6F6D5]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#059669]"></span>
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-[11px] font-bold text-[#64748B] border border-[#CBD5E1]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#94A3B8]"></span>
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#5A6E8C] font-medium">
                        {c.created_at ? new Date(c.created_at).toLocaleDateString() : 'N/A'}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right space-x-1">
                          <button
                            onClick={() => handleEdit(c)}
                            className="rounded-lg bg-[#F0F4FA] p-1.5 text-[#315BFF] hover:bg-[#EEF5FF] transition-colors"
                            title="Edit Category"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete category "${c.name}"?`)) {
                                removeMutation.mutate(c.id);
                              }
                            }}
                            className="rounded-lg bg-[#F0F4FA] p-1.5 text-[#E11D48] hover:bg-[#FEF2F2] transition-colors"
                            title="Delete Category"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filteredCategories.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 5 : 4} className="px-4 py-8 text-center text-[#7E92B2] font-medium">
                      No categories found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}


function BrandsPanel({ canManage }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['brands'], queryFn: brandsApi.list });

  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['brands'] });

  const createMutation = useMutation({
    mutationFn: brandsApi.create,
    onSuccess: () => {
      invalidate();
      resetForm();
      showSuccess('Brand created successfully!');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => brandsApi.update(id, data),
    onSuccess: () => {
      invalidate();
      resetForm();
      showSuccess('Brand updated successfully!');
    },
  });

  const removeMutation = useMutation({
    mutationFn: brandsApi.remove,
    onSuccess: () => {
      invalidate();
      showSuccess('Brand deleted successfully.');
    },
  });

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCode('');
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
    setCode(item.code || '');
    setIsActive(item.is_active === undefined ? true : Boolean(Number(item.is_active)));
    setFormError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Brand name is required.');
      return;
    }
    const payload = {
      name: name.trim(),
      code: code.trim(),
      is_active: isActive ? 1 : 0,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const brands = query.data || [];

  const filtered = brands.filter((b) => {
    const matchesSearch =
      b.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.code?.toLowerCase().includes(searchQuery.toLowerCase());
    const bActive = b.is_active === undefined ? true : Boolean(Number(b.is_active));
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && bActive) ||
      (statusFilter === 'inactive' && !bActive);
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 font-sans">
      {/* LEFT FORM */}
      <div className="lg:col-span-4">
        <div className="card p-5 border border-[#D8E6F7] bg-white shadow-[0_2px_12px_rgba(15,30,65,0.04)] rounded-2xl sticky top-4">
          <div className="flex items-center justify-between border-b border-[#D8E6F7] pb-3 mb-4">
            <h2 className="text-base font-black text-[#0F1E4A] flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#F5F0FF] text-[#7C3AED] border border-[#E4D5FC]">
                <Sparkles size={15} />
              </span>
              <span>{editingId ? 'Edit Brand' : 'Create Brand'}</span>
            </h2>
            {editingId && (
              <span className="rounded-full bg-[#FFF3D8] border border-[#FDE68A] px-2.5 py-0.5 text-[11px] font-bold text-[#92400E]">
                Editing #{editingId}
              </span>
            )}
          </div>

          {successMsg && (
            <div className="mb-4 rounded-xl bg-[#ECFDF5] p-3 text-xs font-bold text-[#059669] border border-[#A7F3D0] flex items-center gap-1.5">
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {formError && (
            <div className="mb-4 rounded-xl bg-[#FEF2F2] p-3 text-xs font-bold text-[#E11D48] border border-[#FECDD3]">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5A6E8C] mb-1.5">
                Brand Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Nestle, Samsung..."
                disabled={!canManage}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5A6E8C] mb-1.5">
                Brand Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g., BR-01"
                disabled={!canManage}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5A6E8C] mb-1.5">
                Status
              </label>
              <div className="flex items-center gap-4 bg-[#F8FAFD] p-3 rounded-2xl border border-[#D8E6F7]">
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer text-[#0F1E4A]">
                  <input
                    type="radio"
                    name="brand_status"
                    checked={isActive}
                    onChange={() => setIsActive(true)}
                    disabled={!canManage}
                    className="accent-[#059669] h-4 w-4"
                  />
                  <span className="flex items-center gap-1 text-[#059669]">
                    <Power size={14} /> Active
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer text-[#0F1E4A]">
                  <input
                    type="radio"
                    name="brand_status"
                    checked={!isActive}
                    onChange={() => setIsActive(false)}
                    disabled={!canManage}
                    className="accent-[#E11D48] h-4 w-4"
                  />
                  <span className="flex items-center gap-1 text-[#64789D]">
                    <Power size={14} /> Inactive
                  </span>
                </label>
              </div>
            </div>

            {canManage && (
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 justify-center rounded-xl bg-gradient-to-r from-[#0B1B45] via-[#142B5C] to-[#2449C6] py-2.5 text-xs font-bold text-white shadow-xs hover:brightness-110 active:scale-95 disabled:opacity-40 transition-all"
                >
                  {editingId ? 'Update Brand' : 'Save Brand'}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl border border-[#D5E3F7] bg-white px-4 py-2.5 text-xs font-bold text-[#5A6E8C] hover:bg-[#EDF5FF] transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* RIGHT GET DATA TABLE */}
      <div className="lg:col-span-8">
        <div className="card border border-[#D8E6F7] bg-white shadow-[0_2px_12px_rgba(15,30,65,0.04)] rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-[#D8E6F7] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white">
            <h2 className="text-base font-black text-[#0F1E4A] flex items-center gap-2">
              <span>Brands Directory</span>
              <span className="rounded-full bg-[#F5F0FF] text-[#7C3AED] border border-[#E4D5FC] px-2.5 py-0.5 text-xs font-bold">
                {filtered.length} Total
              </span>
            </h2>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7E92B2]" size={14} />
                <input
                  type="text"
                  placeholder="Search brands..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input pl-8 py-1.5 text-xs w-44 sm:w-56"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input py-1.5 text-xs w-28"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#D8E6F7] bg-[#F8FAFD] text-[11px] font-bold uppercase tracking-wider text-[#5A6E8C]">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Brand Name</th>
                  <th className="px-4 py-3">Status</th>
                  {canManage && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAF1FA]">
                {filtered.map((b, index) => {
                  const bActive = b.is_active === undefined ? true : Boolean(Number(b.is_active));
                  return (
                    <tr key={b.id} className="hover:bg-[#F8FAFD]/70 transition-colors">
                      <td className="px-4 py-3 font-semibold text-[#94A3B8]">{index + 1}</td>
                      <td className="px-4 py-3 font-semibold text-[#64789D]">{b.code || '-'}</td>
                      <td className="px-4 py-3 font-bold text-[#0F1E4A]">{b.name}</td>
                      <td className="px-4 py-3">
                        {bActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[11px] font-bold text-[#059669] border border-[#C6F6D5]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#059669]"></span> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-[11px] font-bold text-[#64748B] border border-[#CBD5E1]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#94A3B8]"></span> Inactive
                          </span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right space-x-1">
                          <button
                            onClick={() => handleEdit(b)}
                            className="rounded-lg bg-[#F0F4FA] p-1.5 text-[#315BFF] hover:bg-[#EEF5FF] transition-colors"
                            title="Edit Brand"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete brand "${b.name}"?`)) removeMutation.mutate(b.id);
                            }}
                            className="rounded-lg bg-[#F0F4FA] p-1.5 text-[#E11D48] hover:bg-[#FEF2F2] transition-colors"
                            title="Delete Brand"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 5 : 4} className="px-4 py-8 text-center text-[#7E92B2] font-medium">
                      No brands found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductLinesPanel({ canManage }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['product-lines'], queryFn: productLinesApi.list });

  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['product-lines'] });

  const createMutation = useMutation({
    mutationFn: productLinesApi.create,
    onSuccess: () => {
      invalidate();
      resetForm();
      showSuccess('Product line created successfully!');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => productLinesApi.update(id, data),
    onSuccess: () => {
      invalidate();
      resetForm();
      showSuccess('Product line updated successfully!');
    },
  });

  const removeMutation = useMutation({
    mutationFn: productLinesApi.remove,
    onSuccess: () => {
      invalidate();
      showSuccess('Product line deleted.');
    },
  });

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCode('');
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
    setCode(item.code || '');
    setIsActive(item.is_active === undefined ? true : Boolean(Number(item.is_active)));
    setFormError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Product line name is required.');
      return;
    }
    const payload = {
      name: name.trim(),
      code: code.trim(),
      is_active: isActive ? 1 : 0,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const rows = query.data || [];
  const filtered = rows.filter((r) =>
    r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 font-sans">
      {/* LEFT FORM */}
      <div className="lg:col-span-4">
        <div className="card p-5 border border-[#D8E6F7] bg-white shadow-[0_2px_12px_rgba(15,30,65,0.04)] rounded-2xl sticky top-4">
          <div className="flex items-center justify-between border-b border-[#D8E6F7] pb-3 mb-4">
            <h2 className="text-base font-black text-[#0F1E4A] flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#FFF9EB] text-[#D97706] border border-[#FDE68A]">
                <Boxes size={15} />
              </span>
              <span>{editingId ? 'Edit Product Line' : 'Create Product Line'}</span>
            </h2>
            {editingId && (
              <span className="rounded-full bg-[#FFF3D8] border border-[#FDE68A] px-2.5 py-0.5 text-[11px] font-bold text-[#92400E]">
                Editing #{editingId}
              </span>
            )}
          </div>

          {successMsg && (
            <div className="mb-4 rounded-xl bg-[#ECFDF5] p-3 text-xs font-bold text-[#059669] border border-[#A7F3D0] flex items-center gap-1.5">
              <CheckCircle2 size={16} /> <span>{successMsg}</span>
            </div>
          )}

          {formError && (
            <div className="mb-4 rounded-xl bg-[#FEF2F2] p-3 text-xs font-bold text-[#E11D48] border border-[#FECDD3]">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5A6E8C] mb-1.5">
                Line Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Frozen Foods, FMCG..."
                disabled={!canManage}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5A6E8C] mb-1.5">
                Line Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g., PL-01"
                disabled={!canManage}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5A6E8C] mb-1.5">
                Status
              </label>
              <div className="flex items-center gap-4 bg-[#F8FAFD] p-3 rounded-2xl border border-[#D8E6F7]">
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer text-[#0F1E4A]">
                  <input
                    type="radio"
                    name="pl_status"
                    checked={isActive}
                    onChange={() => setIsActive(true)}
                    disabled={!canManage}
                    className="accent-[#059669] h-4 w-4"
                  />
                  <span className="flex items-center gap-1 text-[#059669]"><Power size={14} /> Active</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer text-[#0F1E4A]">
                  <input
                    type="radio"
                    name="pl_status"
                    checked={!isActive}
                    onChange={() => setIsActive(false)}
                    disabled={!canManage}
                    className="accent-[#E11D48] h-4 w-4"
                  />
                  <span className="flex items-center gap-1 text-[#64789D]"><Power size={14} /> Inactive</span>
                </label>
              </div>
            </div>

            {canManage && (
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 justify-center rounded-xl bg-gradient-to-r from-[#0B1B45] via-[#142B5C] to-[#2449C6] py-2.5 text-xs font-bold text-white shadow-xs hover:brightness-110 active:scale-95 disabled:opacity-40 transition-all"
                >
                  {editingId ? 'Update Line' : 'Save Product Line'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl border border-[#D5E3F7] bg-white px-4 py-2.5 text-xs font-bold text-[#5A6E8C] hover:bg-[#EDF5FF] transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* RIGHT GET DATA TABLE */}
      <div className="lg:col-span-8">
        <div className="card border border-[#D8E6F7] bg-white shadow-[0_2px_12px_rgba(15,30,65,0.04)] rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-[#D8E6F7] flex items-center justify-between bg-white">
            <h2 className="text-base font-black text-[#0F1E4A] flex items-center gap-2">
              <span>Product Lines Directory</span>
              <span className="rounded-full bg-[#FFF9EB] text-[#D97706] border border-[#FDE68A] px-2.5 py-0.5 text-xs font-bold">
                {filtered.length} Total
              </span>
            </h2>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7E92B2]" size={14} />
              <input
                type="text"
                placeholder="Search lines..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-8 py-1.5 text-xs w-48"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#D8E6F7] bg-[#F8FAFD] text-[11px] font-bold uppercase tracking-wider text-[#5A6E8C]">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Line Name</th>
                  <th className="px-4 py-3">Status</th>
                  {canManage && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAF1FA]">
                {filtered.map((r, index) => {
                  const rActive = r.is_active === undefined ? true : Boolean(Number(r.is_active));
                  return (
                    <tr key={r.id} className="hover:bg-[#F8FAFD]/70 transition-colors">
                      <td className="px-4 py-3 font-semibold text-[#94A3B8]">{index + 1}</td>
                      <td className="px-4 py-3 font-semibold text-[#64789D]">{r.code || '-'}</td>
                      <td className="px-4 py-3 font-bold text-[#0F1E4A]">{r.name}</td>
                      <td className="px-4 py-3">
                        {rActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[11px] font-bold text-[#059669] border border-[#C6F6D5]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#059669]"></span> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-[11px] font-bold text-[#64748B] border border-[#CBD5E1]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#94A3B8]"></span> Inactive
                          </span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right space-x-1">
                          <button
                            onClick={() => handleEdit(r)}
                            className="rounded-lg bg-[#F0F4FA] p-1.5 text-[#315BFF] hover:bg-[#EEF5FF] transition-colors"
                            title="Edit Line"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => { if (confirm(`Delete "${r.name}"?`)) removeMutation.mutate(r.id); }}
                            className="rounded-lg bg-[#F0F4FA] p-1.5 text-[#E11D48] hover:bg-[#FEF2F2] transition-colors"
                            title="Delete Line"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 5 : 4} className="px-4 py-8 text-center text-[#7E92B2] font-medium">No product lines found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StockUnitsPanel({ canManage }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['stock-units'], queryFn: stockUnitsApi.list });

  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [isDecimal, setIsDecimal] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['stock-units'] });

  const createMutation = useMutation({
    mutationFn: stockUnitsApi.create,
    onSuccess: () => { invalidate(); resetForm(); showSuccess('Stock unit created!'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => stockUnitsApi.update(id, data),
    onSuccess: () => { invalidate(); resetForm(); showSuccess('Stock unit updated!'); },
  });

  const removeMutation = useMutation({
    mutationFn: stockUnitsApi.remove,
    onSuccess: () => { invalidate(); showSuccess('Stock unit deleted.'); },
  });

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setShortCode('');
    setIsDecimal('0');
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
    setShortCode(item.short_code || '');
    setIsDecimal(String(item.is_decimal ?? '0'));
    setIsActive(item.is_active === undefined ? true : Boolean(Number(item.is_active)));
    setFormError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !shortCode.trim()) {
      setFormError('Name and Short Code are required.');
      return;
    }
    const payload = {
      name: name.trim(),
      short_code: shortCode.trim(),
      is_decimal: Number(isDecimal),
      is_active: isActive ? 1 : 0,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const rows = query.data || [];
  const filtered = rows.filter((r) =>
    r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.short_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 font-sans">
      {/* LEFT FORM */}
      <div className="lg:col-span-4">
        <div className="card p-5 border border-[#D8E6F7] bg-white shadow-[0_2px_12px_rgba(15,30,65,0.04)] rounded-2xl sticky top-4">
          <div className="flex items-center justify-between border-b border-[#D8E6F7] pb-3 mb-4">
            <h2 className="text-base font-black text-[#0F1E4A] flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#FFF7ED] text-[#EA580C] border border-[#FED7AA]">
                <Scale size={15} />
              </span>
              <span>{editingId ? 'Edit Stock Unit' : 'Create Stock Unit'}</span>
            </h2>
            {editingId && (
              <span className="rounded-full bg-[#FFF3D8] border border-[#FDE68A] px-2.5 py-0.5 text-[11px] font-bold text-[#92400E]">
                Editing #{editingId}
              </span>
            )}
          </div>

          {successMsg && (
            <div className="mb-4 rounded-xl bg-[#ECFDF5] p-3 text-xs font-bold text-[#059669] border border-[#A7F3D0] flex items-center gap-1.5">
              <CheckCircle2 size={16} /> <span>{successMsg}</span>
            </div>
          )}
          {formError && (
            <div className="mb-4 rounded-xl bg-[#FEF2F2] p-3 text-xs font-bold text-[#E11D48] border border-[#FECDD3]">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5A6E8C] mb-1.5">
                Unit Name <span className="text-red-500">*</span>
              </label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Kilogram, Piece, Litre" disabled={!canManage} className="input w-full" />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5A6E8C] mb-1.5">
                Short Code <span className="text-red-500">*</span>
              </label>
              <input type="text" value={shortCode} onChange={(e) => setShortCode(e.target.value)} placeholder="e.g., KG, PCS, LTR" disabled={!canManage} className="input w-full" />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5A6E8C] mb-1.5">Decimal Quantity?</label>
              <select value={isDecimal} onChange={(e) => setIsDecimal(e.target.value)} disabled={!canManage} className="input w-full">
                <option value="0">No (Whole integers only e.g., PCS)</option>
                <option value="1">Yes (Decimal values e.g., 1.5 KG)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5A6E8C] mb-1.5">Status</label>
              <div className="flex items-center gap-4 bg-[#F8FAFD] p-3 rounded-2xl border border-[#D8E6F7]">
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer text-[#0F1E4A]">
                  <input type="radio" name="su_status" checked={isActive} onChange={() => setIsActive(true)} disabled={!canManage} className="accent-[#059669] h-4 w-4" />
                  <span className="flex items-center gap-1 text-[#059669]"><Power size={14} /> Active</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer text-[#0F1E4A]">
                  <input type="radio" name="su_status" checked={!isActive} onChange={() => setIsActive(false)} disabled={!canManage} className="accent-[#E11D48] h-4 w-4" />
                  <span className="flex items-center gap-1 text-[#64789D]"><Power size={14} /> Inactive</span>
                </label>
              </div>
            </div>

            {canManage && (
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 justify-center rounded-xl bg-gradient-to-r from-[#0B1B45] via-[#142B5C] to-[#2449C6] py-2.5 text-xs font-bold text-white shadow-xs hover:brightness-110 active:scale-95 disabled:opacity-40 transition-all"
                >
                  {editingId ? 'Update Unit' : 'Save Stock Unit'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl border border-[#D5E3F7] bg-white px-4 py-2.5 text-xs font-bold text-[#5A6E8C] hover:bg-[#EDF5FF] transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* RIGHT GET DATA TABLE */}
      <div className="lg:col-span-8">
        <div className="card border border-[#D8E6F7] bg-white shadow-[0_2px_12px_rgba(15,30,65,0.04)] rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-[#D8E6F7] flex items-center justify-between bg-white">
            <h2 className="text-base font-black text-[#0F1E4A] flex items-center gap-2">
              <span>Stock Units Directory</span>
              <span className="rounded-full bg-[#FFF7ED] text-[#EA580C] border border-[#FED7AA] px-2.5 py-0.5 text-xs font-bold">{filtered.length} Total</span>
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7E92B2]" size={14} />
              <input type="text" placeholder="Search units..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="input pl-8 py-1.5 text-xs w-48" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#D8E6F7] bg-[#F8FAFD] text-[11px] font-bold uppercase tracking-wider text-[#5A6E8C]">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Unit Name</th>
                  <th className="px-4 py-3">Short Code</th>
                  <th className="px-4 py-3">Decimal?</th>
                  <th className="px-4 py-3">Status</th>
                  {canManage && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAF1FA]">
                {filtered.map((r, index) => {
                  const rActive = r.is_active === undefined ? true : Boolean(Number(r.is_active));
                  return (
                    <tr key={r.id} className="hover:bg-[#F8FAFD]/70 transition-colors">
                      <td className="px-4 py-3 font-semibold text-[#94A3B8]">{index + 1}</td>
                      <td className="px-4 py-3 font-bold text-[#0F1E4A]">{r.name}</td>
                      <td className="px-4 py-3 font-bold text-[#2449C6]">{r.short_code}</td>
                      <td className="px-4 py-3 font-semibold text-[#5A6E8C]">{r.is_decimal ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-3">
                        {rActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[11px] font-bold text-[#059669] border border-[#C6F6D5]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#059669]"></span> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-[11px] font-bold text-[#64748B] border border-[#CBD5E1]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#94A3B8]"></span> Inactive
                          </span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right space-x-1">
                          <button
                            onClick={() => handleEdit(r)}
                            className="rounded-lg bg-[#F0F4FA] p-1.5 text-[#315BFF] hover:bg-[#EEF5FF] transition-colors"
                            title="Edit Unit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => { if (confirm(`Delete "${r.name}"?`)) removeMutation.mutate(r.id); }}
                            className="rounded-lg bg-[#F0F4FA] p-1.5 text-[#E11D48] hover:bg-[#FEF2F2] transition-colors"
                            title="Delete Unit"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={canManage ? 6 : 5} className="px-4 py-8 text-center text-[#7E92B2] font-medium">No stock units found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaxCodesPanel({ canManage }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['tax-codes'], queryFn: taxCodesApi.list });

  const [editingId, setEditingId] = useState(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [gstPercent, setGstPercent] = useState('');
  const [cgstPercent, setCgstPercent] = useState('');
  const [sgstPercent, setSgstPercent] = useState('');
  const [igstPercent, setIgstPercent] = useState('');
  const [cessPercent, setCessPercent] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tax-codes'] });

  const createMutation = useMutation({
    mutationFn: taxCodesApi.create,
    onSuccess: () => { invalidate(); resetForm(); showSuccess('Tax code created!'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => taxCodesApi.update(id, data),
    onSuccess: () => { invalidate(); resetForm(); showSuccess('Tax code updated!'); },
  });

  const removeMutation = useMutation({
    mutationFn: taxCodesApi.remove,
    onSuccess: () => { invalidate(); showSuccess('Tax code deleted.'); },
  });

  const resetForm = () => {
    setEditingId(null);
    setCode('');
    setName('');
    setGstPercent('');
    setCgstPercent('');
    setSgstPercent('');
    setIgstPercent('');
    setCessPercent('');
    setIsActive(true);
    setFormError('');
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setCode(item.code || '');
    setName(item.name || '');
    setGstPercent(item.gst_percent ?? '');
    setCgstPercent(item.cgst_percent ?? '');
    setSgstPercent(item.sgst_percent ?? '');
    setIgstPercent(item.igst_percent ?? '');
    setCessPercent(item.cess_percent ?? '');
    setIsActive(item.is_active === undefined ? true : Boolean(Number(item.is_active)));
    setFormError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!code.trim() || !name.trim() || gstPercent === '') {
      setFormError('Code, Name, and GST % are required.');
      return;
    }
    const payload = {
      code: code.trim(),
      name: name.trim(),
      gst_percent: Number(gstPercent),
      cgst_percent: cgstPercent !== '' ? Number(cgstPercent) : Number(gstPercent) / 2,
      sgst_percent: sgstPercent !== '' ? Number(sgstPercent) : Number(gstPercent) / 2,
      igst_percent: igstPercent !== '' ? Number(igstPercent) : Number(gstPercent),
      cess_percent: cessPercent !== '' ? Number(cessPercent) : 0,
      is_active: isActive ? 1 : 0,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const rows = query.data || [];
  const filtered = rows.filter((r) =>
    r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 font-sans">
      {/* LEFT FORM */}
      <div className="lg:col-span-4">
        <div className="card p-5 border border-[#D8E6F7] bg-white shadow-[0_2px_12px_rgba(15,30,65,0.04)] rounded-2xl sticky top-4">
          <div className="flex items-center justify-between border-b border-[#D8E6F7] pb-3 mb-4">
            <h2 className="text-base font-black text-[#0F1E4A] flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#ECFEFF] text-[#0891B2] border border-[#A5F3FC]">
                <Receipt size={15} />
              </span>
              <span>{editingId ? 'Edit Tax Code (GST)' : 'Create Tax Code (GST)'}</span>
            </h2>
            {editingId && (
              <span className="rounded-full bg-[#FFF3D8] border border-[#FDE68A] px-2.5 py-0.5 text-[11px] font-bold text-[#92400E]">
                Editing #{editingId}
              </span>
            )}
          </div>

          {successMsg && (
            <div className="mb-4 rounded-xl bg-[#ECFDF5] p-3 text-xs font-bold text-[#059669] border border-[#A7F3D0] flex items-center gap-1.5">
              <CheckCircle2 size={16} /> <span>{successMsg}</span>
            </div>
          )}
          {formError && (
            <div className="mb-4 rounded-xl bg-[#FEF2F2] p-3 text-xs font-bold text-[#E11D48] border border-[#FECDD3]">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5A6E8C] mb-1.5">Code <span className="text-red-500">*</span></label>
              <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g., GST18" disabled={!canManage} className="input w-full" />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5A6E8C] mb-1.5">Name <span className="text-red-500">*</span></label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., GST 18% Standard" disabled={!canManage} className="input w-full" />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5A6E8C] mb-1.5">GST % <span className="text-red-500">*</span></label>
              <input type="number" step="0.01" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)} placeholder="e.g., 18" disabled={!canManage} className="input w-full" />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-[#5A6E8C] mb-1 uppercase tracking-wider">CGST %</label>
                <input type="number" step="0.01" value={cgstPercent} onChange={(e) => setCgstPercent(e.target.value)} placeholder="Auto (GST/2)" disabled={!canManage} className="input w-full" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#5A6E8C] mb-1 uppercase tracking-wider">SGST %</label>
                <input type="number" step="0.01" value={sgstPercent} onChange={(e) => setSgstPercent(e.target.value)} placeholder="Auto (GST/2)" disabled={!canManage} className="input w-full" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5A6E8C] mb-1.5">Status</label>
              <div className="flex items-center gap-4 bg-[#F8FAFD] p-3 rounded-2xl border border-[#D8E6F7]">
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer text-[#0F1E4A]">
                  <input type="radio" name="tax_status" checked={isActive} onChange={() => setIsActive(true)} disabled={!canManage} className="accent-[#059669] h-4 w-4" />
                  <span className="flex items-center gap-1 text-[#059669]"><Power size={14} /> Active</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer text-[#0F1E4A]">
                  <input type="radio" name="tax_status" checked={!isActive} onChange={() => setIsActive(false)} disabled={!canManage} className="accent-[#E11D48] h-4 w-4" />
                  <span className="flex items-center gap-1 text-[#64789D]"><Power size={14} /> Inactive</span>
                </label>
              </div>
            </div>

            {canManage && (
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 justify-center rounded-xl bg-gradient-to-r from-[#0B1B45] via-[#142B5C] to-[#2449C6] py-2.5 text-xs font-bold text-white shadow-xs hover:brightness-110 active:scale-95 disabled:opacity-40 transition-all"
                >
                  {editingId ? 'Update Tax Code' : 'Save Tax Code'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl border border-[#D5E3F7] bg-white px-4 py-2.5 text-xs font-bold text-[#5A6E8C] hover:bg-[#EDF5FF] transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* RIGHT GET DATA TABLE */}
      <div className="lg:col-span-8">
        <div className="card border border-[#D8E6F7] bg-white shadow-[0_2px_12px_rgba(15,30,65,0.04)] rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-[#D8E6F7] flex items-center justify-between bg-white">
            <h2 className="text-base font-black text-[#0F1E4A] flex items-center gap-2">
              <span>Tax Codes Directory</span>
              <span className="rounded-full bg-[#ECFEFF] text-[#0891B2] border border-[#A5F3FC] px-2.5 py-0.5 text-xs font-bold">{filtered.length} Total</span>
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7E92B2]" size={14} />
              <input type="text" placeholder="Search tax codes..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="input pl-8 py-1.5 text-xs w-48" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#D8E6F7] bg-[#F8FAFD] text-[11px] font-bold uppercase tracking-wider text-[#5A6E8C]">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Tax Name</th>
                  <th className="px-4 py-3">GST %</th>
                  <th className="px-4 py-3">CGST / SGST</th>
                  <th className="px-4 py-3">Status</th>
                  {canManage && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAF1FA]">
                {filtered.map((r, index) => {
                  const rActive = r.is_active === undefined ? true : Boolean(Number(r.is_active));
                  return (
                    <tr key={r.id} className="hover:bg-[#F8FAFD]/70 transition-colors">
                      <td className="px-4 py-3 font-semibold text-[#94A3B8]">{index + 1}</td>
                      <td className="px-4 py-3 font-bold text-[#2449C6]">{r.code}</td>
                      <td className="px-4 py-3 font-bold text-[#0F1E4A]">{r.name}</td>
                      <td className="px-4 py-3 font-black text-[#0F1E4A]">{r.gst_percent}%</td>
                      <td className="px-4 py-3 font-medium text-[#5A6E8C]">{r.cgst_percent}% / {r.sgst_percent}%</td>
                      <td className="px-4 py-3">
                        {rActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[11px] font-bold text-[#059669] border border-[#C6F6D5]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#059669]"></span> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-[11px] font-bold text-[#64748B] border border-[#CBD5E1]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#94A3B8]"></span> Inactive
                          </span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right space-x-1">
                          <button
                            onClick={() => handleEdit(r)}
                            className="rounded-lg bg-[#F0F4FA] p-1.5 text-[#315BFF] hover:bg-[#EEF5FF] transition-colors"
                            title="Edit Tax Code"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => { if (confirm(`Delete "${r.name}"?`)) removeMutation.mutate(r.id); }}
                            className="rounded-lg bg-[#F0F4FA] p-1.5 text-[#E11D48] hover:bg-[#FEF2F2] transition-colors"
                            title="Delete Tax Code"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={canManage ? 7 : 6} className="px-4 py-8 text-center text-[#7E92B2] font-medium">No tax codes found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryBrandMappingPanel() {
  const [categoryId, setCategoryId] = useState('');
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState('');
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });
  const brandsQuery = useQuery({ queryKey: ['brands'], queryFn: brandsApi.list });

  const saveMutation = useMutation({
    mutationFn: () => categoryBrandsApi.set(categoryId, selected),
    onSuccess: () => {
      setMessage('Category-Brand mapping saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    },
  });

  const categories = categoriesQuery.data || [];
  const brands = brandsQuery.data || [];

  const pickCategory = async (id) => {
    setCategoryId(id);
    if (id) {
      const data = await categoryBrandsApi.get(id);
      setSelected(data.brand_ids || []);
    } else {
      setSelected([]);
    }
  };

  const toggle = (brandId) => {
    setSelected((prev) => (prev.includes(brandId) ? prev.filter((b) => b !== brandId) : [...prev, brandId]));
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 font-sans">
      {/* LEFT FORM */}
      <div className="lg:col-span-5">
        <div className="card p-5 border border-[#D8E6F7] bg-white shadow-[0_2px_12px_rgba(15,30,65,0.04)] rounded-2xl sticky top-4 space-y-4">
          <div className="border-b border-[#D8E6F7] pb-3">
            <h2 className="text-base font-black text-[#0F1E4A] flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#EEF5FF] text-[#315BFF] border border-[#D5E5FC]">
                <Layers size={15} />
              </span>
              <span>Assign Brands to Category</span>
            </h2>
            <p className="text-xs text-[#5A6E8C] font-medium mt-1">
              Restrict which brands are allowed under a category. If no brands are selected, all brands are permitted.
            </p>
          </div>

          {message && (
            <div className="rounded-xl bg-[#ECFDF5] p-3 text-xs font-bold text-[#059669] border border-[#A7F3D0] flex items-center gap-1.5">
              <CheckCircle2 size={16} /> <span>{message}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#5A6E8C] mb-1.5">
              Select Category
            </label>
            <select value={categoryId} onChange={(e) => pickCategory(e.target.value)} className="input w-full">
              <option value="">-- Choose Category --</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {categoryId && (
            <>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#5A6E8C] mb-2">
                  Allowed Brands
                </label>
                <div className="max-h-60 overflow-y-auto space-y-1.5 p-3 bg-[#F8FAFD] rounded-2xl border border-[#D8E6F7]">
                  {brands.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 text-xs font-bold text-[#0F1E4A] cursor-pointer p-2 rounded-xl border border-[#D5E3F7] bg-white hover:border-[#315BFF] transition-all">
                      <input type="checkbox" checked={selected.includes(b.id)} onChange={() => toggle(b.id)} className="accent-[#315BFF] h-4 w-4 rounded" />
                      <span>{b.name}</span>
                      {b.code && <span className="text-[11px] font-medium text-[#64789D]">({b.code})</span>}
                    </label>
                  ))}
                  {brands.length === 0 && <p className="text-xs text-[#7E92B2]">No brands found. Add brands first.</p>}
                </div>
              </div>

              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="w-full justify-center rounded-xl bg-gradient-to-r from-[#0B1B45] via-[#142B5C] to-[#2449C6] py-2.5 text-xs font-bold text-white shadow-xs hover:brightness-110 active:scale-95 disabled:opacity-40 transition-all"
              >
                Save Brand Mapping
              </button>
            </>
          )}
        </div>
      </div>

      {/* RIGHT GET DATA LIST */}
      <div className="lg:col-span-7">
        <div className="card border border-[#D8E6F7] bg-white shadow-[0_2px_12px_rgba(15,30,65,0.04)] rounded-2xl overflow-hidden p-4">
          <h2 className="text-base font-black text-[#0F1E4A] mb-3 flex items-center justify-between">
            <span>Mapped Category Overview</span>
            <span className="rounded-full bg-[#EEF5FF] text-[#315BFF] border border-[#D5E5FC] px-2.5 py-0.5 text-xs font-bold">{categories.length} Categories</span>
          </h2>

          <div className="space-y-2.5 max-h-[70vh] overflow-y-auto pr-1">
            {categories.map((c) => (
              <div
                key={c.id}
                onClick={() => pickCategory(c.id)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                  String(categoryId) === String(c.id)
                    ? 'border-[#315BFF] bg-gradient-to-r from-[#EEF5FF] to-[#E3EFFF] ring-2 ring-[#315BFF]/25 shadow-xs'
                    : 'border-[#D8E6F7] bg-white hover:border-[#B8D5FF] hover:bg-[#F8FAFD]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-[#0F1E4A]">{c.name}</span>
                  <span className="text-[11px] font-bold text-[#315BFF] hover:underline">Select &amp; Edit →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Catalog() {
  const canManage = usePermission('catalog.manage_items');

  return (
    <div className="space-y-4 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-1">
        <div>
          <h1 className="text-2xl font-black text-[#0F1E4A] tracking-tight flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EEF5FF] text-[#315BFF] border border-[#D5E5FC] shadow-2xs">
              <Package size={18} />
            </span>
            Catalog Master Management
          </h1>
          <p className="text-xs text-[#64789D] font-medium mt-1">
            Configure items, pricing tiers, categories, brands, units, and tax codes
          </p>
        </div>
      </div>
      <Tabs
        tabs={[
          { key: 'items', label: 'Items', icon: Package, content: <ItemsPanel canManage={canManage} /> },
          { key: 'categories', label: 'Categories', icon: Tag, content: <CategoriesPanel canManage={canManage} /> },
          { key: 'brands', label: 'Brands', icon: Sparkles, content: <BrandsPanel canManage={canManage} /> },
          { key: 'category-brand', label: 'Category ↔ Brand', icon: Layers, content: <CategoryBrandMappingPanel /> },
          { key: 'product-lines', label: 'Product Lines', icon: Boxes, content: <ProductLinesPanel canManage={canManage} /> },
          { key: 'stock-units', label: 'Stock Units', icon: Scale, content: <StockUnitsPanel canManage={canManage} /> },
          { key: 'tax-codes', label: 'Tax Codes (GST)', icon: Receipt, content: <TaxCodesPanel canManage={canManage} /> },
        ]}
      />
    </div>
  );
}


