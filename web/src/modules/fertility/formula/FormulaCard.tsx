// One formula version: lines, safety checks, decision, order status, and —
// for the treating doctor on a draft — approve / reject.
import { useState } from 'react';
import { Badge, Banner } from '../../../ui';
import { formulaApi, type Formula } from './api';
import { ChecksList } from './ChecksList';
import type { Order } from '../orders/api';
import { PricePanel } from '../orders/PricePanel';

const TONE: Record<string, 'ok' | 'warn' | 'bad' | 'neutral' | 'info'> = { DRAFT: 'warn', APPROVED: 'ok', REJECTED: 'bad', SUPERSEDED: 'neutral' };

export function FormulaCard({ f, canApprove, canEdit, order, priceRole, onEdit, onChanged }: {
  f: Formula; canApprove: boolean; canEdit: boolean; order?: Order; priceRole: 'doctor' | 'admin' | null;
  onEdit: () => void; onChanged: () => void;
}) {
  const [ack, setAck] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const blocks = f.checks.filter(c => c.level === 'BLOCK').length;
  const warns = f.checks.filter(c => c.level === 'WARN').length;

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  return (
    <div className="gq-finding">
      <div className="gq-row" style={{ gap: 6 }}>
        <strong>Week of {f.week_start}</strong><Badge tone="info">{f.phase}</Badge><Badge tone={TONE[f.status]}>{f.status.toLowerCase()}</Badge>
        {f.order_status && <Badge tone="neutral">Order: {f.order_status.replace('_', ' ').toLowerCase()}</Badge>}
        <span className="gq-spacer" />
        <span className="gq-small gq-muted">by {f.created_by_name || '—'}{f.approved_by_name ? ` · ${f.status === 'REJECTED' ? 'rejected' : 'approved'} by ${f.approved_by_name}` : ''}</span>
      </div>
      <table className="table" style={{ marginTop: 8 }}><tbody>
        {f.items.map((l, i) => <tr key={i}><td>{l.name || l.ingredientId}<div className="gq-small gq-muted">{l.form}{l.reason ? ` · reason: ${l.reason}` : ''}</div></td>
          <td style={{ textAlign: 'right' }}><strong>{l.dose}</strong> {l.unit}/day</td></tr>)}
      </tbody></table>
      {f.notes && <p className="gq-small">Notes: {f.notes}</p>}
      {f.decision_note && <p className="gq-small">Decision note: {f.decision_note}</p>}
      {f.status === 'DRAFT' && <ChecksList checks={f.checks} />}
      {order && f.status === 'APPROVED' && priceRole && <PricePanel o={order} who={priceRole} onChanged={onChanged} />}
      {err && <Banner tone="bad" onClose={() => setErr(null)}>{err}</Banner>}
      {f.status === 'DRAFT' && (
        <div className="gq-row" style={{ marginTop: 8 }}>
          {canEdit && <button className="btn-secondary btn-sm" onClick={onEdit}>Edit draft</button>}
          {canApprove && <>
            {warns > 0 && <label className="gq-small" style={{ display: 'inline-flex', gap: 6, textTransform: 'none', letterSpacing: 0 }}>
              <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />I have reviewed the {warns} warning(s)</label>}
            <input className="gq-select" style={{ minWidth: 200 }} placeholder="Decision note" aria-label="Decision note" value={note} onChange={e => setNote(e.target.value)} />
            <button className="btn-primary btn-sm" disabled={busy || blocks > 0 || (warns > 0 && !ack)}
              title={blocks ? 'Fix the blocking checks first' : ''} onClick={() => act(() => formulaApi.approve(f.case_id, f.id, ack, note))}>Approve & send to store</button>
            <button className="btn-secondary btn-sm" disabled={busy} onClick={() => act(() => formulaApi.reject(f.case_id, f.id, note))}>Reject</button>
          </>}
        </div>)}
    </div>
  );
}
