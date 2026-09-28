// One user × one module: on/off switch plus the user's role in that module.
import { Badge, Toggle } from '../../../ui';
import type { ModuleMeta, UserGrant, UserRow } from '../types';

const STORE = ['STORE', 'STORE_APPROVER'];

export function UserModuleCell({ user, mod, grant, busy, onChange }: {
  user: UserRow; mod: ModuleMeta; grant: UserGrant; busy: boolean;
  onChange: (enabled: boolean, role: string | null) => void;
}) {
  // Default role when first granting: the user's platform role if valid here.
  const fallbackRole = mod.roles.includes(user.role) ? user.role : mod.roles[0];
  const role = grant.role || fallbackRole;
  const blockedByStore = grant.on && !grant.effective && STORE.includes(role);

  return (
    <div className="gq-row" style={{ gap: 8, flexWrap: 'nowrap' }}>
      <Toggle checked={grant.on} disabled={busy} label={`${mod.name} access for ${user.name}`}
        onChange={next => onChange(next, role)} />
      {mod.roleFromUser ? (
        grant.on && <span className="gq-small gq-muted">{user.role.toLowerCase()}</span>
      ) : (
        <select className="gq-select" value={role} disabled={busy || !grant.on}
          aria-label={`${mod.name} role for ${user.name}`}
          onChange={e => onChange(true, e.target.value)}>
          {mod.roles.map(r => <option key={r} value={r}>{r.replace('_', ' ').toLowerCase()}</option>)}
        </select>
      )}
      {blockedByStore && <Badge tone="warn" title="Granted, but this user's store does not serve the module">store off</Badge>}
    </div>
  );
}
