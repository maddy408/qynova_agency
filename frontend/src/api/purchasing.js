import { apiClient } from './client';

export const purchaseRequestsApi = {
  list: async () => (await apiClient.get('/purchase-requests')).data,
  get: async (id) => (await apiClient.get(`/purchase-requests/${id}`)).data,
  create: async (data) => (await apiClient.post('/purchase-requests', data)).data,
  cancel: async (id) => (await apiClient.post(`/purchase-requests/${id}/cancel`)).data,
  approve: async (id) => (await apiClient.post(`/purchase-requests/${id}/approve`)).data,
};

export const routeSuppliersApi = {
  get: async (routeId) => (await apiClient.get(`/routes/${routeId}/suppliers`)).data,
  set: async (routeId, supplierIds) => (await apiClient.put(`/routes/${routeId}/suppliers`, { supplier_ids: supplierIds })).data,
};

export const customerPrebookingsApi = {
  list: async (params) => (await apiClient.get('/customer-prebookings', { params })).data,
  get: async (id) => (await apiClient.get(`/customer-prebookings/${id}`)).data,
  create: async (data) => (await apiClient.post('/customer-prebookings', data)).data,
  update: async (id, data) => (await apiClient.put(`/customer-prebookings/${id}`, data)).data,
  setStatus: async (id, status) => (await apiClient.put(`/customer-prebookings/${id}/status`, { status })).data,
  cancel: async (id) => (await apiClient.post(`/customer-prebookings/${id}/cancel`)).data,
  async downloadExport() {
    const res = await apiClient.get('/customer-prebookings/export', { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'customer_prebookings.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

async function downloadWithServerFilename(res, fallbackName) {
  const disposition = res.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : fallbackName;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const purchasesApi = {
  list: async (params) => (await apiClient.get('/purchases', { params })).data,
  get: async (id) => (await apiClient.get(`/purchases/${id}`)).data,
  create: async (data) => (await apiClient.post('/purchases', data)).data,
  update: async (id, data) => (await apiClient.put(`/purchases/${id}`, data)).data,
  remove: async (id) => (await apiClient.delete(`/purchases/${id}`)).data,
  returnableItems: async (id) => (await apiClient.get(`/purchases/${id}/returnable-items`)).data,

  /** ids: optional array to narrow to "Export Selected" — omit for the full (currently filtered) list. */
  async downloadExport(ids) {
    const params = { export: 1 };
    if (ids?.length) params.ids = ids.join(',');
    const res = await apiClient.get('/purchases', { params, responseType: 'blob' });
    await downloadWithServerFilename(res, 'GRN_Purchases.xlsx');
  },

  /**
   * Flattened item-line rows (one row per GRN item, same numbers the Excel
   * export streams) for building a client-side PDF — never recomputed in JS.
   * ids: optional array to narrow to specific GRNs (PDF for one/selected GRNs).
   */
  async detail(ids) {
    const params = { detail: 1 };
    if (ids?.length) params.ids = ids.join(',');
    return (await apiClient.get('/purchases', { params })).data;
  },
};

export const supplierPaymentsApi = {
  list: async (params) => (await apiClient.get('/supplier-payments', { params })).data,
  unpaidGrns: async (supplierId) => (await apiClient.get(`/suppliers/${supplierId}/unpaid-grns`)).data,
  create: async (data) => (await apiClient.post('/supplier-payments', data)).data,

  async downloadExport(ids) {
    const params = { export: 1 };
    if (ids?.length) params.ids = ids.join(',');
    const res = await apiClient.get('/supplier-payments', { params, responseType: 'blob' });
    await downloadWithServerFilename(res, 'Supplier_Payments.xlsx');
  },
};

export const stockAdjustmentsApi = {
  list: async () => (await apiClient.get('/stock-adjustments')).data,
  create: async (data) => (await apiClient.post('/stock-adjustments', data)).data,
};

export const vanStockApi = {
  issue: async (data) => (await apiClient.post('/van-stock/issue', data)).data,
  returnStock: async (data) => (await apiClient.post('/van-stock/return', data)).data,
  pending: async (employeeId) => (await apiClient.get(`/van-stock/${employeeId}`)).data,

  /** itemIds: optional array to narrow to "Export Selected" — omit for the full (currently filtered) list. */
  async downloadExport(employeeId, itemIds) {
    const params = { export: 1 };
    if (itemIds?.length) params.item_ids = itemIds.join(',');
    const res = await apiClient.get(`/van-stock/${employeeId}`, { params, responseType: 'blob' });
    const disposition = res.headers['content-disposition'] || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : 'van_stock.xlsx';
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export const vanStockIssuesApi = {
  /** List issue TRANSACTIONS (one row per Issue Stock action) — optionally narrowed to one salesman. */
  list: async (employeeId) => (await apiClient.get('/van-stock/issues', { params: employeeId ? { employee_id: employeeId } : {} })).data,
  get: async (id) => (await apiClient.get(`/van-stock/issues/${id}`)).data,

  /** Flattened item-line rows for the given issue transaction ids, for building a client-side PDF. */
  async detail(ids) {
    const params = { detail: 1 };
    if (ids?.length) params.ids = ids.join(',');
    return (await apiClient.get('/van-stock/issues', { params })).data;
  },

  /** ids: optional array to narrow to "Export Selected" issue transactions — omit for the full list. */
  async downloadExport(ids) {
    const params = { export: 1 };
    if (ids?.length) params.ids = ids.join(',');
    const res = await apiClient.get('/van-stock/issues', { params, responseType: 'blob' });
    await downloadWithServerFilename(res, 'Van_Stock_Issues.xlsx');
  },
};

export const stockHubApi = {
  list: async (params = {}) => (await apiClient.get('/stock-hub', { params })).data,
  lowStock: async () => (await apiClient.get('/stock-hub/low-stock')).data,

  /** Server-side export honors the same owner_type/owner_id/item_id filters as list(). */
  async downloadExport(params = {}) {
    const res = await apiClient.get('/stock-hub', { params: { ...params, export: 1 }, responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'van_salesman_stock.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
