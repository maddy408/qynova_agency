import { apiClient } from './client';

export const invoicesApi = {
  list: async (paramsOrStatus) => {
    const params = typeof paramsOrStatus === 'string'
      ? { status: paramsOrStatus }
      : (paramsOrStatus || {});
    return (await apiClient.get('/invoices', { params })).data;
  },
  get: async (id) => (await apiClient.get(`/invoices/${id}`)).data,
  create: async (data) => (await apiClient.post('/invoices', data)).data,
  update: async (id, data) => (await apiClient.put(`/invoices/${id}`, data)).data,
  discard: async (id) => (await apiClient.delete(`/invoices/${id}`)).data,
  complete: async (id, payments) => (await apiClient.post(`/invoices/${id}/complete`, { payments })).data,
  print: async (id) => (await apiClient.get(`/invoices/${id}/print`)).data,
  cancel: async (id, reason) => (await apiClient.post(`/invoices/${id}/cancel`, { reason })).data,
  deleteCompleted: async (id, reason) => (await apiClient.post(`/invoices/${id}/delete`, { reason })).data,
  editCompleted: async (id, data) => (await apiClient.put(`/invoices/${id}/edit`, data)).data,
  returnableItems: async (id) => (await apiClient.get(`/invoices/${id}/returnable-items`)).data,

  updateTransport: async (id, data) => (await apiClient.put(`/invoices/${id}/transport`, data)).data,
  generateEInvoice: async (id) => (await apiClient.post(`/invoices/${id}/einvoice/generate`)).data,
  cancelEInvoice: async (id, reason) => (await apiClient.post(`/invoices/${id}/einvoice/cancel`, { reason })).data,
  generateEWayBill: async (id) => (await apiClient.post(`/invoices/${id}/ewaybill/generate`)).data,
  cancelEWayBill: async (id, reason) => (await apiClient.post(`/invoices/${id}/ewaybill/cancel`, { reason })).data,
};
