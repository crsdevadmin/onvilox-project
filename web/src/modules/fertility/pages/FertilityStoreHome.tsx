// Fertility store screen — separate from the Oncology store (/store).
// Orders come from formulas the treating doctor approved. Each shows the label
// contents; pregnancy-pending orders carry a visible warning.
import { useState } from 'react';
import { useAccess } from '../../../core/AccessContext';
import { useAsync } from '../../../core/useAsync';
import { Badge, Banner, Card, EmptyState, Loading, PageHeader, Tabs } from '../../../ui';
import { formulaApi, type Order } from '../formula/api';

const NEXT: Record<string, { to: string; label: string }[]> = {
  NEW: [{ to: 'IN_PRODUCTION', label: 'Start production' }], IN_PRODUCTION: [{ to: 'READY', label: 'Mark ready' }],
  READY: [{ to: 'DISPATCHED', label: 'Dispatch' }], DISPATCHED: [{ to: 'DELIVERED', label: 'Mark delivered' }],
};
type View = 'open' | 'done';

export function FertilityStoreHome() {
  const { roleIn } = useAccess();
  const canCancel = ['STORE_APPROVER', 'ADMIN', 'SUPER_ADMIN'].includes(roleIn('fertility') || '');
  const { data, error, loading, reload } = useAsync(formulaApi.orders, []);
  const [view, setView] = useState<View>('open');
  const [err, setErr] = useState<string | null>(null);
  const rows = (data || []).filter(o => (view === 'open') === !['DELIVERED', 'CANCELLED'].includes(o.status));

  async function move(o: Order, to: string) {
    setErr(null);
    try { await formulaApi.setOrderStatus(o.id, to); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <>
      <PageHeader title="Fertility orders" subtitle="Weekly personalised formulations approved by the treating doctor"
        actions={<Badge tone="info">Fertility store</Badge>} />
      {(error || err) && <Banner tone="bad">{error || err}</Banner>}
      <Tabs<View> value={view} onChange={setView} tabs={[{ key: 'open', label: 'To do' }, { key: 'done', label: 'Delivered / cancelled' }]} />
      {loading ? <Loading /> : !rows.length ? <Card><EmptyState>No orders here.</EmptyState></Card> : rows.map(o => (
        <div key={o.id} style={{ marginBottom: 14 }}>
          <Card title={<>#{o.id} · {o.label.partnerName} <span className="gq-muted gq-small">({o.label.sex === 'F' ? 'female' : 'male'}{o.label.age ? `, ${o.label.age} y` : ''}{o.label.mrn ? `, MRN ${o.label.mrn}` : ''})</span></>}
            actions={<Badge tone={o.status === 'CANCELLED' ? 'bad' : o.status === 'DELIVERED' ? 'ok' : 'warn'}>{o.status.replace('_', ' ').toLowerCase()}</Badge>}>
            {o.label.pregnancyPending && <Banner tone="bad">PREGNANCY-PENDING — prepare exactly as listed; label must carry the pregnancy notice.</Banner>}
            <p className="gq-small gq-muted">Week of {o.label.weekStart} · {o.label.phase} {o.label.phaseLabel} · Dr {o.label.doctor || '—'} · {o.store_name || 'No store assigned'}</p>
            <table className="table"><tbody>
              {o.label.items.map((i, k) => <tr key={k}><td>{i.name}<div className="gq-small gq-muted">{i.form}</div></td><td style={{ textAlign: 'right' }}><strong>{i.dose}</strong> {i.unit}/day</td></tr>)}
            </tbody></table>
            <div className="gq-row" style={{ marginTop: 8 }}>
              {(NEXT[o.status] || []).map(n => <button key={n.to} className="btn-primary btn-sm" onClick={() => move(o, n.to)}>{n.label}</button>)}
              {canCancel && !['DELIVERED', 'CANCELLED', 'DISPATCHED'].includes(o.status) &&
                <button className="btn-secondary btn-sm" onClick={() => move(o, 'CANCELLED')}>Cancel</button>}
              <span className="gq-spacer" /><span className="gq-small gq-muted">Updated {new Date(o.updated_at).toLocaleString()}{o.updated_by_name ? ' · ' + o.updated_by_name : ''}</span>
            </div>
          </Card>
        </div>))}
    </>
  );
}
