import axios from 'axios';
import { useBranchStore } from '../store/branchStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('pos_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Header branch switcher's selection — only meaningful for a user with
  // branches.switch_context; every backend controller ignores it otherwise.
  // Never overrides a branch_id a specific call already set explicitly.
  const selectedBranchId = useBranchStore.getState().selectedBranchId;
  if (selectedBranchId && !(config.params && 'branch_id' in config.params)) {
    config.params = { ...config.params, branch_id: selectedBranchId };
  }

  return config;
});
