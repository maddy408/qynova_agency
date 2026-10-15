import { apiClient } from './client';

function makeCrud(path) {
  return {
    list: async (params) => (await apiClient.get(path, { params })).data,
    create: async (data) => (await apiClient.post(path, data)).data,
    update: async (id, data) => (await apiClient.put(`${path}/${id}`, data)).data,
    remove: async (id) => (await apiClient.delete(`${path}/${id}`)).data,
  };
}

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

export const routesApi = makeCrud('/routes');
export const citiesApi = makeCrud('/cities');
export const customersApi = {
  ...makeCrud('/customers'),

  async downloadExport() {
    const res = await apiClient.get('/customers/export', { responseType: 'blob' });
    downloadBlob(res.data, 'customers_export.xlsx');
  },

  async downloadImportTemplate() {
    const res = await apiClient.get('/customers/import/template', { responseType: 'blob' });
    downloadBlob(res.data, 'customers_import_template.xlsx');
  },

  async importPreview(file) {
    const form = new FormData();
    form.append('file', file);
    return (await apiClient.post('/customers/import/preview', form)).data;
  },

  async importCommit(file) {
    const form = new FormData();
    form.append('file', file);
    return (await apiClient.post('/customers/import/commit', form)).data;
  },
};
export const suppliersApi = {
  ...makeCrud('/suppliers'),
  balances: async () => (await apiClient.get('/suppliers/balances')).data,
};
