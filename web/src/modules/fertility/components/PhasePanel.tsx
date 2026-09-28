// Treatment-phase timeline. Only the doctor moves a case between phases —
// the phase decides which clinical rules and safety limits apply.
import { useState } from 'react';
import { Badge, Banner } from '../../../ui';
import { fertilityApi } from '../api';
import { phaseLabel, today } from '../helpers';
import type { CaseDetail, FxSchema } from '../types';

export function PhasePanel({ c, phases, canManage, onSaved }: {
  c: CaseDetail; phases: FxSchema['phases']; canManage: boolean; onSaved: () => void;
}) {
  const [phase, setPhase] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function change() {
    setBusy(true); setErr(null);
    try { await fertilityApi.setPhase(c.id, phase, date, note); setPhase(''); setNote(''); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <>
      {canManage && (
        <>
          {err && <Banner tone="bad" onClose={() => setErr(null)}>{err}</Banner>}
          <div className="gq-form-grid">
            <div className="form-group"><label htmlFor="np">Move to phase</label>
              <select id="np" value={phase} onChange={e => setPhase(e.target.value)}>
                <option value="">Select…</option>
                {phases.filter(p => p.value !== c.phase).map(p => <option key={p.value} value={p.value}>{p.value} — {p.label}</option>)}
              </select></div>
            <div className="form-group"><label htmlFor="nd">Date</label>
              <input id="nd" type="date" max={today()} value={date} onChange={e => setDate(e.target.value)} /></div>
            <div className="form-group"><label htmlFor="nn">Note</label>
              <input id="nn" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. antagonist protocol" /></div>
          </div>
          <button className="btn-secondary" disabled={busy || !phase} onClick={change}>{busy ? 'Saving…' : 'Record phase change'}</button>
          <h3 className="gq-section-title">History</h3>
        </>
      )}
      <ul className="gq-timeline">
        {c.events.map(e => (
          <li key={e.id}>
            <div className="gq-row" style={{ gap: 8 }}><Badge tone="info">{e.phase}</Badge><strong>{phaseLabel(phases, e.phase)}</strong></div>
            <div className="gq-small gq-muted">{e.event_date}{e.created_by_name ? ' · ' + e.created_by_name : ''}{e.note ? ' · ' + e.note : ''}</div>
          </li>
        ))}
      </ul>
    </>
  );
}
