// Shared top bar: brand, the module you are in, a module switcher (when you
// have more than one), module nav links, who you are, theme and logout.
import { NavLink } from 'react-router-dom';
import { useAccess } from '../core/AccessContext';
import { MODULE_DEFS, moduleHref } from '../core/modules';
import { logout } from '../core/session';
import { PushButton } from './PushButton';
import { isAdmin, type ModuleCode } from '../core/types';

export interface NavItem { to: string; label: string }

declare global { function toggleTheme(): void }

export function TopBar({ module, nav = [] }: { module?: ModuleCode; nav?: NavItem[] }) {
  const { access } = useAccess();
  const others = access.modules.filter(m => m.code !== module);
  const admin = isAdmin(access.user.role);

  return (
    <div className="topbar">
      <div className="logo">GQUENCE{module ? ` · ${MODULE_DEFS[module].name}` : ''}</div>
      <div className="nav">
        {nav.map(n => <NavLink key={n.to} to={n.to} end>{n.label}</NavLink>)}
        {others.length > 0 && (
          <select className="gq-select gq-switcher" aria-label="Switch module" value=""
            onChange={e => { const m = others.find(o => o.code === e.target.value); if (m) window.location.href = moduleHref(m); }}>
            <option value="" disabled>Switch module…</option>
            {others.map(m => <option key={m.code} value={m.code}>{m.name}</option>)}
          </select>
        )}
        <PushButton />
        {admin && <a href="/admin">Admin</a>}
        <span className="gq-small gq-muted" style={{ whiteSpace: 'nowrap', margin: '0 8px' }} title={access.user.role}>{access.user.name}</span>
        <button className="btn-secondary btn-sm" onClick={() => window.toggleTheme?.()}>Theme</button>
        <a href="#" onClick={e => { e.preventDefault(); logout(); }}>Logout</a>
      </div>
    </div>
  );
}
