// One login for every module: the legacy login page (index.html → js/auth.js)
// writes the session to localStorage; this shell reads the same key.
import type { ModuleAccess, Session } from './types';

const KEY = 'onvilox_session';

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveModules(modules: ModuleAccess[]) {
  const s = getSession();
  if (!s) return;
  try { localStorage.setItem(KEY, JSON.stringify({ ...s, modules })); } catch { /* storage blocked */ }
}

export function logout() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.location.href = '/login';
}
