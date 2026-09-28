import { api } from '../../core/api';
import type { ModuleAccess } from '../../core/types';

export interface FertilityHome {
  module: ModuleAccess;
  cases: unknown[];
  orders: unknown[];
  phase: string;
}

export const fertilityApi = {
  home: () => api.get<FertilityHome>('/api/fertility/home'),
};
