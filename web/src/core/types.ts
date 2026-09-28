export type ModuleCode = 'onco' | 'fertility';

/** A module the signed-in user may use, and their role inside it. */
export interface ModuleAccess {
  code: ModuleCode;
  name: string;
  role: string;
}

export interface AccessInfo {
  user: { id: string; name: string; role: string; storeId: string | null };
  modules: ModuleAccess[];
  landing: string;
}

/** The session the legacy login page saves (localStorage "onvilox_session"). */
export interface Session {
  id: string;
  role: string;
  name: string;
  token: string | null;
  storeId?: string | null;
  modules?: ModuleAccess[] | null;
}

export const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];
export const STORE_ROLES = ['STORE', 'STORE_APPROVER'];
export const isAdmin = (role?: string) => !!role && ADMIN_ROLES.includes(role);
export const isStoreRole = (role?: string) => !!role && STORE_ROLES.includes(role);
