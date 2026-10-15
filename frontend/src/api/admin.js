import { apiClient } from './client';

export const dashboardApi = {
  summary: async (params) => (await apiClient.get('/dashboard/summary', { params })).data,
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
  branchWiseSales: async (params) => (await apiClient.get(reportUrl('branch-wise-sales', params))).data,
  routeWiseSales: async (params) => (await apiClient.get(reportUrl('route-wise-sales', params))).data,
  customerWiseSales: async (params) => (await apiClient.get(reportUrl('customer-wise-sales', params))).data,
  supplierWiseSales: async (params) => (await apiClient.get(reportUrl('supplier-wise-sales', params))).data,
  brandWiseSales: async (params) => (await apiClient.get(reportUrl('brand-wise-sales', params))).data,
  categoryWiseSales: async (params) => (await apiClient.get(reportUrl('category-wise-sales', params))).data,
  brandCategoryWiseSales: async (params) => (await apiClient.get(reportUrl('brand-category-wise-sales', params))).data,
  creditOutstanding: async () => (await apiClient.get('/reports/credit-outstanding')).data,
  expenseIncome: async (params) => (await apiClient.get(reportUrl('expense-income', params))).data,
  profit: async (params) => (await apiClient.get(reportUrl('profit', params))).data,
  profitInvoiceWise: async (params) => (await apiClient.get(reportUrl('profit/invoice-wise', params))).data,
  lowStock: async () => (await apiClient.get('/stock-hub/low-stock')).data,
  financialSummary: async (params, signal) => (await apiClient.get(reportUrl('financial-summary', params), { signal })).data,
  profitDetail: async (params, signal) => (await apiClient.get(reportUrl('financial-summary/profit-detail', params), { signal })).data,
  productLossDetail: async (params, signal) => (await apiClient.get(reportUrl('financial-summary/product-loss-detail', params), { signal })).data,
  stockPurchaseDetail: async (params, signal) => (await apiClient.get(reportUrl('financial-summary/stock-purchase-detail', params), { signal })).data,
  stockAdjustmentDetail: async (params, signal) => (await apiClient.get(reportUrl('financial-summary/stock-adjustment-detail', params), { signal })).data,
  orderManagementDetail: async (params, signal) => (await apiClient.get(reportUrl('financial-summary/order-management-detail', params), { signal })).data,
  totalSalesDetail: async (params, signal) => (await apiClient.get(reportUrl('financial-summary/total-sales-detail', params), { signal })).data,

  /**
   * responseType: 'blob' means even an ERROR response body (JSON) comes
   * back as an unreadable Blob instead of parsed data — axios doesn't
   * unwrap it. Read it back to text/JSON here so a real backend error
   * (permission denied, bad date range, etc.) surfaces its actual message
   * instead of failing opaquely or being read as if it were the file.
   *
   * `path` is normally a bare report slug (prefixed with /reports/ below),
   * but a couple of exports — Low Stock — live under a different controller
   * (/stock-hub/low-stock); pass those already-prefixed with a leading '/'
   * to use the URL as-is instead of forcing the /reports/ prefix onto it.
   */
  async downloadExport(path, params) {
    const requestUrl = path.startsWith('/')
      ? `${path}${path.includes('?') ? '&' : '?'}${new URLSearchParams({ ...params, export: 1 }).toString()}`
      : reportUrl(path, { ...params, export: 1 });
    // Always the last path segment — a multi-segment report slug like
    // "profit/invoice-wise" must not end up as a literal slash in the
    // downloaded filename.
    const downloadName = path.split('/').filter(Boolean).pop();

    let res;
    try {
      res = await apiClient.get(requestUrl, { responseType: 'blob' });
    } catch (err) {
      if (err.response?.data instanceof Blob && err.response.data.type.includes('json')) {
        const text = await err.response.data.text();
        try {
          err.response.data = JSON.parse(text);
        } catch {
          /* not JSON after all — leave the raw error as-is */
        }
      }
      throw err;
    }

    const contentType = res.headers?.['content-type'] || '';
    if (contentType.includes('json')) {
      // Backend returned 200 with a JSON body instead of the expected .xlsx — treat as failure, never open the file dialog on it.
      const text = await res.data.text();
      throw new Error(JSON.parse(text)?.error || 'The server did not return a valid Excel file.');
    }

    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${downloadName}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
