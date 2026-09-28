import type { ModuleCode } from '../../core/types';

export interface ModuleMeta { code: ModuleCode; name: string; roles: string[]; roleFromUser: boolean; defaultOn: boolean }

export interface UserGrant { on: boolean; role: string | null; effective: boolean }

export interface UserRow {
  id: string; name: string; email: string; role: string;
  storeId: string | null; hospital: string | null;
  grants: Record<ModuleCode, UserGrant>;
}

export interface StoreRow { id: string; name: string; hospital: string | null; modules: Record<ModuleCode, boolean> }

export interface Matrix { modules: ModuleMeta[]; users: UserRow[]; stores: StoreRow[] }

export interface AuditRow {
  id: number; at: string; action: string; target_type: string; target_id: string; target_name: string;
  module_code: string | null; actor_name: string | null; after: { enabled?: boolean; role?: string } | null;
}
