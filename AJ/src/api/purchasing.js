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
  list: async () => (await apiClient.get('/customer-prebookings')).data,
  get: async (id) => (await apiClient.get(`/customer-prebookings/${id}`)).data,
  create: async (data) => (await apiClient.post('/customer-prebookings', data)).data,
  update: async (id, data) => (await apiClient.put(`/customer-prebookings/${id}`, data)).data,
  setStatus: async (id, status) => (await apiClient.put(`/customer-prebookings/${id}/status`, { status })).data,
  cancel: async (id) => (await apiClient.post(`/customer-prebookings/${id}/cancel`)).data,
};

export const purchasesApi = {
  list: async () => (await apiClient.get('/purchases')).data,
  get: async (id) => (await apiClient.get(`/purchases/${id}`)).data,
  create: async (data) => (await apiClient.post('/purchases', data)).data,
  update: async (id, data) => (await apiClient.put(`/purchases/${id}`, data)).data,
  remove: async (id) => (await apiClient.delete(`/purchases/${id}`)).data,
  returnableItems: async (id) => (await apiClient.get(`/purchases/${id}/returnable-items`)).data,
};

export const supplierPaymentsApi = {
  list: async () => (await apiClient.get('/supplier-payments')).data,
  get: async (id) => (await apiClient.get(`/supplier-payments/${id}`)).data,
  create: async (data) => (await apiClient.post('/supplier-payments', data)).data,
  update: async (id, data) => (await apiClient.put(`/supplier-payments/${id}`, data)).data,
  remove: async (id) => (await apiClient.delete(`/supplier-payments/${id}`)).data,
  unpaidGrns: async (supplierId) => (await apiClient.get(`/suppliers/${supplierId}/unpaid-grns`)).data,
};

export const stockAdjustmentsApi = {
  list: async () => (await apiClient.get('/stock-adjustments')).data,
  create: async (data) => (await apiClient.post('/stock-adjustments', data)).data,
};

export const vanStockApi = {
  issue: async (data) => (await apiClient.post('/van-stock/issue', data)).data,
  returnStock: async (data) => (await apiClient.post('/van-stock/return', data)).data,
  pending: async (employeeId) => (await apiClient.get(`/van-stock/${employeeId}`)).data,
  eligibleOrders: async (type) => (await apiClient.get('/van-stock/eligible-orders', { params: { type } })).data,
};

export const vanStockIssuesApi = {
  list: async (employeeId) => (await apiClient.get('/van-stock/issues', { params: employeeId ? { employee_id: employeeId } : {} })).data,
  get: async (id) => (await apiClient.get(`/van-stock/issues/${id}`)).data,
  detail: async (ids) => {
    const params = { detail: 1 };
    if (ids?.length) params.ids = ids.join(',');
    return (await apiClient.get('/van-stock/issues', { params })).data;
  },
};

export const stockHubApi = {
  list: async (params = {}) => (await apiClient.get('/stock-hub', { params })).data,
  lowStock: async () => (await apiClient.get('/stock-hub/low-stock')).data,
};
