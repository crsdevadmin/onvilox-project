import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAccess } from './AccessContext';
import { isAdmin, type ModuleCode } from './types';

/** Render children only if the user has the module (and, optionally, one of the roles). */
export function RequireModule({ code, roles, children }: { code: ModuleCode; roles?: string[]; children: ReactNode }) {
  const { has, roleIn } = useAccess();
  if (!has(code)) return <Navigate to="/no-access" replace />;
  const role = roleIn(code);
  if (roles && role && !roles.includes(role) && !isAdmin(role)) return <Navigate to="/no-access" replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { access } = useAccess();
  if (!isAdmin(access.user.role)) return <Navigate to="/no-access" replace />;
  return <>{children}</>;
}
