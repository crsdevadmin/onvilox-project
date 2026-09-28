// Shown after login to users who can use more than one module.
import { Navigate } from 'react-router-dom';
import { useAccess } from '../core/AccessContext';
import { MODULE_DEFS, moduleHref } from '../core/modules';
import { PageHeader } from '../ui';

export function ChooseModule() {
  const { access } = useAccess();
  const mods = access.modules;
  if (mods.length === 0) return <Navigate to="/no-access" replace />;
  if (mods.length === 1) { window.location.replace(moduleHref(mods[0])); return null; }

  return (
    <>
      <PageHeader title={`Welcome, ${access.user.name}`} subtitle="Choose where you want to work today." />
      <div className="gq-module-grid">
        {mods.map(m => (
          <a key={m.code} className="card gq-module-card" href={moduleHref(m)}>
            <h3>{m.name}</h3>
            <p className="gq-muted">{MODULE_DEFS[m.code].blurb}</p>
            <p className="gq-small gq-muted" style={{ marginTop: 10 }}>Your role: {m.role.replace('_', ' ').toLowerCase()}</p>
          </a>
        ))}
      </div>
    </>
  );
}
