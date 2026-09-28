// Client-side module catalogue: names, blurbs and where each module starts.
// Mirrors server/modules/registry.js. A new module adds one entry here and a
// folder under src/modules/<code>/.
import { isStoreRole, type ModuleAccess, type ModuleCode } from './types';

interface ModuleDef {
  code: ModuleCode;
  name: string;
  blurb: string;
  /** Legacy modules live outside this shell and need a full page load. */
  external: boolean;
  home: (role: string) => string;
}

export const MODULE_DEFS: Record<ModuleCode, ModuleDef> = {
  onco: {
    code: 'onco',
    name: 'Oncology',
    blurb: 'Clinical nutrition for patients under cancer care',
    external: true,
    home: role => (role === 'DOCTOR' || role === 'ASSISTANT') ? '/dashboard'
      : isStoreRole(role) ? '/store' : role === 'COORDINATOR' ? '/coordinator' : '/admin',
  },
  fertility: {
    code: 'fertility',
    name: 'Fertility',
    blurb: 'Preconception, IVF and male-factor nutrition',
    external: false,
    home: role => (isStoreRole(role) ? '/fertility/store' : '/fertility'),
  },
};

/** Absolute URL for a module's home (shell routes are under /app). */
export function moduleHref(m: ModuleAccess): string {
  const def = MODULE_DEFS[m.code];
  const path = def.home(m.role);
  return def.external ? path : '/app' + path;
}
