// Open red-flag alerts for the case, shown above every tab until the treating
// doctor acknowledges each one with a note of what was done.
import { useState } from 'react';
import { useAsync } from '../../../core/useAsync';
import { Banner } from '../../../ui';
import { fertilityApi } from '../api';
import type { Alert } from '../types';

export function AlertsBar({ caseId, canAck, refreshKey }: { caseId: string; canAck: boolean; refreshKey: number }) {
  const { data, reload } = useAsync(() => fertilityApi.alerts(caseId), [caseId, refreshKey]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const open = (data || []).filter(a => !a.ack_at);
  if (!open.length) return null;

  async function ack(a: Alert) {
    setErr(null);
    try { await fertilityApi.ackAlert(caseId, a.id, notes[a.id] || ''); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <div className="gq-alerts" role="alert">
      <strong>⚠ {open.length} open alert{open.length > 1 ? 's' : ''}</strong>
      {err && <Banner tone="bad" onClose={() => setErr(null)}>{err}</Banner>}
      {open.map(a => (
        <div key={a.id} className="gq-alert-row">
          <div><strong>{a.rule_id}</strong> · {a.partner_name} · <span className="gq-small">{new Date(a.created_at).toLocaleString()}</span>
            <div>{a.message}</div></div>
          {canAck ? (
            <div className="gq-row" style={{ gap: 6 }}>
              <input className="gq-select" style={{ minWidth: 240 }} placeholder="What was done" aria-label={`Action taken for ${a.rule_id}`}
                value={notes[a.id] || ''} onChange={e => setNotes(s => ({ ...s, [a.id]: e.target.value }))} />
              <button className="btn-secondary btn-sm" onClick={() => ack(a)}>Acknowledge</button>
            </div>) : <span className="gq-small">Waiting for the treating doctor</span>}
        </div>))}
    </div>
  );
}
