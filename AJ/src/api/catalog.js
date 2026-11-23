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
  // status: 'active' (default — Billing always calls list() with no
  // status, so it only ever gets sellable items), 'inactive', or 'all' —
  // used by the Products screen's Active/Deactivated toggle.
  list: async (search = '', status = undefined) => (await apiClient.get('/items', { params: { search, status } })).data,
  get: async (id) => (await apiClient.get(`/items/${id}`)).data,
  create: async (data) => (await apiClient.post('/items', data)).data,
  update: async (id, data) => (await apiClient.put(`/items/${id}`, data)).data,
  remove: async (id) => (await apiClient.delete(`/items/${id}`)).data,

  /** asset: { uri, type, fileName } from react-native-image-picker */
  async uploadImage(id, asset) {
    const form = new FormData();
    form.append('image', {
      uri: asset.uri,
      type: asset.type || 'image/jpeg',
      name: asset.fileName || `product_${id}.jpg`,
    });
    return (
      await apiClient.post(`/items/${id}/image`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        transformRequest: (data) => data,
      })
    ).data;
  },
  removeImage: async (id) => (await apiClient.delete(`/items/${id}/image`)).data,

  async imageSearch(asset) {
    const form = new FormData();
    form.append('image', { uri: asset.uri, type: asset.type || 'image/jpeg', name: asset.fileName || 'photo.jpg' });
    return (await apiClient.post('/items/image-search', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },

  // Binary .xlsx downloads — actually fetched via fileExportService (needs auth header + file save), these are just the paths it hits.
  exportPath: '/items/export',
  importTemplatePath: '/items/import/template',

  /** pickedFile: { uri, name, type } from @react-native-documents/picker */
  async importPreview(pickedFile) {
    const form = new FormData();
    form.append('file', { uri: pickedFile.uri, type: pickedFile.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: pickedFile.name || 'import.xlsx' });
    return (await apiClient.post('/items/import/preview', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
  async importCommit(pickedFile) {
    const form = new FormData();
    form.append('file', { uri: pickedFile.uri, type: pickedFile.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: pickedFile.name || 'import.xlsx' });
    return (await apiClient.post('/items/import/commit', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
};
