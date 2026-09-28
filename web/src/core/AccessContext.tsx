// Who is signed in and which modules they can use — fetched once from
// /api/access/me and shared with every screen through context.
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { api } from './api';
import { getSession, saveModules } from './session';
import type { AccessInfo, ModuleCode } from './types';
import { useAsync } from './useAsync';

interface Ctx {
  access: AccessInfo;
  has: (code: ModuleCode) => boolean;
  roleIn: (code: ModuleCode) => string | null;
}

const AccessCtx = createContext<Ctx | null>(null);

export function AccessProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const signedIn = !!getSession()?.token;
  const { data, error } = useAsync(() => api.get<AccessInfo>('/api/access/me'), []);

  useEffect(() => { if (data) saveModules(data.modules); }, [data]);

  if (!signedIn) { window.location.href = '/login'; return null; }
  if (error) return <div className="container page"><div className="card">Could not load your access: {error}</div></div>;
  if (!data) return <>{fallback}</>;

  const value: Ctx = {
    access: data,
    has: code => data.modules.some(m => m.code === code),
    roleIn: code => data.modules.find(m => m.code === code)?.role ?? null,
  };
  return <AccessCtx.Provider value={value}>{children}</AccessCtx.Provider>;
}

export function useAccess(): Ctx {
  const c = useContext(AccessCtx);
  if (!c) throw new Error('useAccess must be used inside <AccessProvider>');
  return c;
}
