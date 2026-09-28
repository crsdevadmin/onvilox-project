// One order on the store screen: label contents, price step, production
// steps (blocked until the price is approved), batch and label printing.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Banner, Card } from '../../../ui';
import { ordersApi, type Order } from './api';
import { PricePanel } from './PricePanel';

const NEXT: Record<string, { to: string; label: string }[]> = {
  NEW: [{ to: 'IN_PRODUCTION', label: 'Start production' }], IN_PRODUCTION: [{ to: 'READY', label: 'Mark ready' }],
  READY: [{ to: 'DISPATCHED', label: 'Dispatch' }], DISPATCHED: [{ to: 'DELIVERED', label: 'Mark delivered' }],
};
const today = () => new Date().toISOString().slice(0, 10);

export function OrderCard({ o, who, canCancel, onChanged }: { o: Order; who: 'store' | 'admin'; canCancel: boolean; onChanged: () => void }) {
  const [mfg, setMfg] = useState(o.mfg_date || today());
  const [err, setErr] = useState<string | null>(null);
  const L = o.label;
  const act = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } };
  const priced = o.price.price_status === 'APPROVED';

  return (
    <Card title={<>#{o.id} · {L.partnerName} <span className="gq-muted gq-small">({L.sex === 'F' ? 'female' : 'male'}{L.age ? `, ${L.age} y` : ''}{L.mrn ? `, MRN ${L.mrn}` : ''})</span></>}
      actions={<Badge tone={o.status === 'CANCELLED' ? 'bad' : o.status === 'DELIVERED' ? 'ok' : 'warn'}>{o.status.replace('_', ' ').toLowerCase()}</Badge>}>
      {L.pregnancyPending && <Banner tone="bad">PREGNANCY-PENDING — prepare exactly as listed; label must carry the pregnancy notice.</Banner>}
      <p className="gq-small gq-muted">Week of {L.weekStart} · {L.phase} {L.phaseLabel} · Dr {L.doctor || '—'} · {o.store_name || 'No store assigned'}</p>
      <table className="table"><tbody>
        {L.items.map((i, k) => <tr key={k}><td>{i.name}<div className="gq-small gq-muted">{i.form}</div></td><td style={{ textAlign: 'right' }}><strong>{i.dose}</strong> {i.unit}/day</td></tr>)}
      </tbody></table>
      <PricePanel o={o} who={who} onChanged={onChanged} />
      {err && <Banner tone="bad" onClose={() => setErr(null)}>{err}</Banner>}
      {['IN_PRODUCTION', 'READY'].includes(o.status) && (
        <div className="gq-row gq-price" style={{ gap: 6 }}>
          <strong className="gq-small">Batch</strong>
          {o.batch_no ? <span className="gq-small">{o.batch_no} · Mfg {o.mfg_date} · Exp {o.exp_date}</span> : <span className="gq-small gq-muted">not generated</span>}
          <input className="gq-select" type="date" max={today()} aria-label="Manufacturing date" value={mfg} onChange={e => setMfg(e.target.value)} />
          <button className="btn-secondary btn-sm" onClick={() => act(() => ordersApi.batch(o.id, mfg))}>{o.batch_no ? 'Update date' : 'Generate batch'}</button>
          {o.batch_no && priced && <Link className="btn-secondary btn-sm" to={`/fertility/label/${o.id}`}>Print label</Link>}
        </div>)}
      <div className="gq-row" style={{ marginTop: 10 }}>
        {(NEXT[o.status] || []).map(n => (
          <button key={n.to} className="btn-primary btn-sm" disabled={(n.to === 'IN_PRODUCTION' && !priced) || (n.to === 'READY' && !o.batch_no)}
            title={n.to === 'IN_PRODUCTION' && !priced ? 'Blocked until the doctor approves the price' : n.to === 'READY' && !o.batch_no ? 'Generate the batch first' : ''}
            onClick={() => act(() => ordersApi.setStatus(o.id, n.to))}>{n.label}</button>))}
        {canCancel && !['DELIVERED', 'CANCELLED', 'DISPATCHED'].includes(o.status) &&
          <button className="btn-secondary btn-sm" onClick={() => act(() => ordersApi.setStatus(o.id, 'CANCELLED'))}>Cancel</button>}
        <span className="gq-spacer" /><span className="gq-small gq-muted">Updated {new Date(o.updated_at).toLocaleString()}{o.updated_by_name ? ' · ' + o.updated_by_name : ''}</span>
      </div>
    </Card>
  );
}
