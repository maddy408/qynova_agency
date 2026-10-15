import { apiClient } from './client';

export const salesReturnsApi = {
  list: async (params) => (await apiClient.get('/sales-returns', { params })).data,
  create: async (data) => (await apiClient.post('/sales-returns', data)).data,
  approve: async (id) => (await apiClient.post(`/sales-returns/${id}/approve`)).data,
  reject: async (id) => (await apiClient.post(`/sales-returns/${id}/reject`)).data,
};

export const purchaseReturnsApi = {
  list: async (params) => (await apiClient.get('/purchase-returns', { params })).data,
  create: async (data) => (await apiClient.post('/purchase-returns', data)).data,
};

export const collectionsApi = {
  list: async () => (await apiClient.get('/collections')).data,
  pending: async (routeId) => (await apiClient.get('/collections/pending', { params: routeId ? { route_id: routeId } : {} })).data,
  unpaidInvoices: async (customerId) => (await apiClient.get(`/customers/${customerId}/unpaid-invoices`)).data,
  create: async (data) => (await apiClient.post('/collections', data)).data,
};

export const cashHandoversApi = {
  list: async () => (await apiClient.get('/cash-handovers')).data,
  pending: async () => (await apiClient.get('/cash-handovers/pending')).data,
  submit: async (data) => (await apiClient.post('/cash-handovers', data)).data,
  verify: async (id, verifiedAmount) => (await apiClient.post(`/cash-handovers/${id}/verify`, { verified_amount: verifiedAmount })).data,
};

export const expenseCategoriesApi = {
  list: async () => (await apiClient.get('/expense-categories')).data,
  create: async (data) => (await apiClient.post('/expense-categories', data)).data,
};

export const expensesApi = {
  list: async (params) => (await apiClient.get('/expenses', { params })).data,
  create: async (data) => (await apiClient.post('/expenses', data)).data,
  remove: async (id) => (await apiClient.delete(`/expenses/${id}`)).data,
};

export const otherIncomeApi = {
  list: async (params) => (await apiClient.get('/other-income', { params })).data,
  create: async (data) => (await apiClient.post('/other-income', data)).data,
  remove: async (id) => (await apiClient.delete(`/other-income/${id}`)).data,
};
