import { apiClient } from './client';

export const dashboardApi = {
  summary: async () => (await apiClient.get('/dashboard/summary')).data,
};

export const rolesApi = {
  list: async () => (await apiClient.get('/roles')).data,
};

export const permissionsApi = {
  list: async () => (await apiClient.get('/permissions')).data,
};

export const staffApi = {
  list: async () => (await apiClient.get('/users')).data,
  create: async (data) => (await apiClient.post('/users', data)).data,
  update: async (id, data) => (await apiClient.put(`/users/${id}`, data)).data,
  getPermissions: async (id) => (await apiClient.get(`/users/${id}/permissions`)).data,
  setPermissions: async (id, overrides) => (await apiClient.put(`/users/${id}/permissions`, { overrides })).data,
};

export const settingsApi = {
  getBranch: async () => (await apiClient.get('/settings/branch')).data,
  updateBranch: async (data) => (await apiClient.put('/settings/branch', data)).data,
  getPrint: async () => (await apiClient.get('/settings/print')).data,
  updatePrint: async (data) => (await apiClient.put('/settings/print', data)).data,
  getFreeQty: async () => (await apiClient.get('/settings/free-qty')).data,
  updateFreeQty: async (data) => (await apiClient.put('/settings/free-qty', data)).data,
  getSequences: async () => (await apiClient.get('/settings/sequences')).data,
  updateSequence: async (id, prefix) => (await apiClient.put(`/settings/sequences/${id}`, { prefix })).data,
  getPosPopup: async () => (await apiClient.get('/settings/pos-popup')).data,
  updatePosPopup: async (data) => (await apiClient.put('/settings/pos-popup', data)).data,
};

function reportUrl(path, params) {
  const search = new URLSearchParams(params).toString();
  return `/reports/${path}${search ? `?${search}` : ''}`;
}

export const reportsApi = {
  gstRegister: async (params) => (await apiClient.get(reportUrl('gst-register', params))).data,
  nonGstRegister: async (params) => (await apiClient.get(reportUrl('non-gst-register', params))).data,
  purchaseRegister: async (params) => (await apiClient.get(reportUrl('purchase-register', params))).data,
  itemWiseSales: async (params) => (await apiClient.get(reportUrl('item-wise-sales', params))).data,
  creditOutstanding: async () => (await apiClient.get('/reports/credit-outstanding')).data,
  expenseIncome: async (params) => (await apiClient.get(reportUrl('expense-income', params))).data,
  profit: async (params) => (await apiClient.get(reportUrl('profit', params))).data,
  profitInvoiceWise: async (params) => (await apiClient.get(reportUrl('profit/invoice-wise', params))).data,
  lowStock: async () => (await apiClient.get('/stock-hub/low-stock')).data,
  branchWiseSales: async (params) => (await apiClient.get(reportUrl('branch-wise-sales', params))).data,
  routeWiseSales: async (params) => (await apiClient.get(reportUrl('route-wise-sales', params))).data,
  customerWiseSales: async (params) => (await apiClient.get(reportUrl('customer-wise-sales', params))).data,
  supplierWiseSales: async (params) => (await apiClient.get(reportUrl('supplier-wise-sales', params))).data,
  brandWiseSales: async (params) => (await apiClient.get(reportUrl('brand-wise-sales', params))).data,
  categoryWiseSales: async (params) => (await apiClient.get(reportUrl('category-wise-sales', params))).data,
  brandCategoryWiseSales: async (params) => (await apiClient.get(reportUrl('brand-category-wise-sales', params))).data,
};
