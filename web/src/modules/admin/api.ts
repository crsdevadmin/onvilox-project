import { api } from '../../core/api';
import type { AuditRow, Matrix } from './types';

export const accessApi = {
  matrix: () => api.get<Matrix>('/api/access/matrix'),
  audit: () => api.get<AuditRow[]>('/api/access/audit?limit=200'),
  setUser: (userId: string, code: string, enabled: boolean, role?: string | null) =>
    api.put<{ ok: true }>(`/api/access/users/${encodeURIComponent(userId)}/modules/${code}`, { enabled, role }),
  setStore: (storeId: string, code: string, enabled: boolean) =>
    api.put<{ ok: true }>(`/api/access/stores/${encodeURIComponent(storeId)}/modules/${code}`, { enabled }),
};
