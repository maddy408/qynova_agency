import { apiClient } from './client';

function makeCrud(path) {
  return {
    list: async () => (await apiClient.get(path)).data,
    create: async (data) => (await apiClient.post(path, data)).data,
    update: async (id, data) => (await apiClient.put(`${path}/${id}`, data)).data,
    remove: async (id) => (await apiClient.delete(`${path}/${id}`)).data,
  };
}

export const routesApi = makeCrud('/routes');
export const citiesApi = makeCrud('/cities');
export const customersApi = {
  ...makeCrud('/customers'),

  // Binary .xlsx downloads — fetched via fileExportService (needs auth
  // header + file save); these are just the paths it hits, same pattern
  // as itemsApi in api/catalog.js.
  exportPath: '/customers/export',
  importTemplatePath: '/customers/import/template',

  /** pickedFile: { uri, name, type } from @react-native-documents/picker */
  async importPreview(pickedFile) {
    const form = new FormData();
    form.append('file', { uri: pickedFile.uri, type: pickedFile.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: pickedFile.name || 'import.xlsx' });
    return (await apiClient.post('/customers/import/preview', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
  async importCommit(pickedFile, autoCreatePricingTypes = true) {
    const form = new FormData();
    form.append('file', { uri: pickedFile.uri, type: pickedFile.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: pickedFile.name || 'import.xlsx' });
    form.append('auto_create_pricing_types', autoCreatePricingTypes ? '1' : '0');
    return (await apiClient.post('/customers/import/commit', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
};

export const pricingTypesApi = {
  list: async () => (await apiClient.get('/pricing-types')).data,
  create: async (data) => (await apiClient.post('/pricing-types', data)).data,
};
export const suppliersApi = {
  ...makeCrud('/suppliers'),
  balances: async () => (await apiClient.get('/suppliers/balances')).data,
};
