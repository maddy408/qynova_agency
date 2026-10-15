import { apiClient } from './client';

function makeCrud(path) {
  return {
    list: async () => (await apiClient.get(path)).data,
    create: async (data) => (await apiClient.post(path, data)).data,
    update: async (id, data) => (await apiClient.put(`${path}/${id}`, data)).data,
    remove: async (id) => (await apiClient.delete(`${path}/${id}`)).data,
  };
}

export const categoriesApi = makeCrud('/categories');
export const brandsApi = makeCrud('/brands');
export const productLinesApi = makeCrud('/product-lines');
export const taxCodesApi = makeCrud('/tax-codes');
export const stockUnitsApi = makeCrud('/stock-units');

export const categoryBrandsApi = {
  get: async (categoryId) => (await apiClient.get(`/categories/${categoryId}/brands`)).data,
  set: async (categoryId, brandIds) => (await apiClient.put(`/categories/${categoryId}/brands`, { brand_ids: brandIds })).data,
};

export const itemsApi = {
  // status: 'active' (default — Billing/POS always calls list() with no
  // status, so it only ever gets sellable items), 'inactive', or 'all' —
  // used by the Items screen's Active/Deactivated toggle.
  list: async (searchOrParams = '', status = undefined) => {
    let params = {};
    if (typeof searchOrParams === 'object' && searchOrParams !== null) {
      params = searchOrParams;
    } else {
      params = { search: searchOrParams, status };
    }
    return (await apiClient.get('/items', { params })).data;
  },
  get: async (id) => (await apiClient.get(`/items/${id}`)).data,
  create: async (data) => (await apiClient.post('/items', data)).data,
  update: async (id, data) => (await apiClient.put(`/items/${id}`, data)).data,
  remove: async (id) => (await apiClient.delete(`/items/${id}`)).data,
  previousWeekPrice: async (id, params = {}, signal) =>
    (await apiClient.get(`/items/${id}/previous-week-price`, { params, signal })).data,

  async uploadImage(id, file) {
    const form = new FormData();
    form.append('image', file);
    return (await apiClient.post(`/items/${id}/image`, form)).data;
  },
  removeImage: async (id) => (await apiClient.delete(`/items/${id}/image`)).data,

  async imageSearch(file) {
    const form = new FormData();
    form.append('image', file);
    return (await apiClient.post('/items/image-search', form)).data;
  },

  async downloadExport() {
    const res = await apiClient.get('/items/export', { responseType: 'blob' });
    downloadBlob(res.data, 'items_export.xlsx');
  },

  async downloadImportTemplate() {
    const res = await apiClient.get('/items/import/template', { responseType: 'blob' });
    downloadBlob(res.data, 'items_import_template.xlsx');
  },

  async importPreview(file) {
    const form = new FormData();
    form.append('file', file);
    return (await apiClient.post('/items/import/preview', form)).data;
  },

  async importCommit(file) {
    const form = new FormData();
    form.append('file', file);
    return (await apiClient.post('/items/import/commit', form)).data;
  },
};

// Retail / Wholesale price management (Phase 14) — `type` is 'retail' or
// 'wholesale', matching the invoice-level price_type values one-to-one.
export const pricingApi = {
  list: async (type, search = '') => (await apiClient.get('/items/pricing', { params: { type, search } })).data,
  bulkSave: async (type, items) => (await apiClient.put('/items/pricing', { pricing_type: type, items })).data,
};

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
