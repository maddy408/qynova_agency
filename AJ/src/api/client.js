import axios from 'axios';
import { API_BASE_URL } from '../config/env';
import { secureStorage } from '../storage/secureStorage';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

// Fired on a 401 so the navigator can drop back to Login. Set by
// RootNavigator at startup — kept outside React state so a plain axios
// interceptor (no hooks) can reach it.
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

apiClient.interceptors.request.use(async (config) => {
  const token = await secureStorage.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const user = await secureStorage.getUser();
  if (user?.branch_id && !(config.params && 'branch_id' in config.params)) {
    config.params = { ...config.params, branch_id: user.branch_id };
  }
  return config;
});

/**
 * Maps any backend/network failure to one short, user-safe message — never
 * the raw error. Only axios requests (apiClient calls) can be genuine
 * network/connectivity failures; a non-axios error (PDF generation, file
 * writes, Excel building) reaching here is a real bug elsewhere and must
 * surface its own message — mislabeling it "Cannot reach the server" hides
 * the actual cause and sends the user chasing their wifi for nothing.
 */
export function friendlyErrorMessage(error) {
  if (!error?.isAxiosError) {
    return error?.message || 'Something went wrong. Please try again.';
  }
  if (!error.response) {
    if (error.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
    return 'Cannot reach the server. Check your internet connection.';
  }
  const { status, data } = error.response;
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return data?.error || "You don't have permission to do that.";
  if (status === 404) return 'That record could not be found.';
  if (status === 422) {
    const raw = data?.error || (data?.errors ? data.errors.join(', ') : '');
    if (typeof raw === 'string' && (raw.includes('1451') || raw.includes('foreign key constraint fails') || raw.includes('Integrity constraint violation'))) {
      return 'Cannot delete this record because it is referenced by other existing transactions or items.';
    }
    return raw || 'Please check the entered details.';
  }
  if (status >= 500) {
    const raw = data?.error || '';
    if (typeof raw === 'string' && (raw.includes('1451') || raw.includes('foreign key constraint fails') || raw.includes('Integrity constraint violation'))) {
      return 'Cannot delete this record because it is referenced by other existing transactions or items.';
    }
    return 'The server ran into a problem. Please try again shortly.';
  }
  return data?.error || 'Something went wrong. Please try again.';
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await secureStorage.clearSession();
      onUnauthorized?.();
    }
    return Promise.reject(error);
  }
);
