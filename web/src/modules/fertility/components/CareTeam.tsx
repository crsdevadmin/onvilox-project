import { useState } from 'react';
import { useAsync } from '../../../core/useAsync';
import { fertilityApi } from '../api';
import type { CaseDetail } from '../types';

/** Doctor and dietitian for the case; the doctor can assign a fertility dietitian. */
export function CareTeam({ c, canManage, onSaved }: { c: CaseDetail; canManage: boolean; onSaved: () => void }) {
  const { data: dietitians } = useAsync(() => (canManage ? fertilityApi.dietitians() : Promise.resolve([])), [canManage]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function assign(id: string) {
    setBusy(true); setErr(null);
    try { await fertilityApi.setDietitian(c.id, id || null); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <dl className="gq-kv">
      <dt>Doctor</dt><dd>{c.doctor_name || '—'}</dd>
      <dt>Dietitian</dt>
      <dd>{canManage ? (
        <select className="gq-select" aria-label="Assign dietitian" value={c.dietitian_id || ''} disabled={busy}
          onChange={e => assign(e.target.value)}>
          <option value="">Not assigned</option>
          {(dietitians || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>) : (c.dietitian_name || 'Not assigned')}
        {err && <div className="gq-small" style={{ color: 'var(--rose)' }}>{err}</div>}
      </dd>
    </dl>
  );
}
