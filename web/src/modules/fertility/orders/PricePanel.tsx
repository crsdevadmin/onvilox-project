// Price step for one order, shown according to the viewer's role:
//  store → enter store price;  admin → set markup %;  doctor → enter final MRP or send back.
// What each role can SEE is already filtered by the server.
import { useState } from 'react';
import { Badge, Banner } from '../../../ui';
import { ordersApi, PRICE_STEP, rupees, type Order } from './api';

type Who = 'store' | 'admin' | 'doctor';

export function PricePanel({ o, who, onChanged }: { o: Order; who: Who; onChanged: () => void }) {
  const p = o.price;
  const [val, setVal] = useState<string>(who === 'admin' ? String(p.markup_pct ?? o.default_markup_pct ?? 40) : '');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); setVal(''); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const open = o.status === 'NEW';
  const tone = p.price_status === 'APPROVED' ? 'ok' : 'warn';
  const input = (label: string, placeholder: string) => (
    <input className="gq-select" style={{ width: 130 }} type="number" min={0} step="any" aria-label={label} placeholder={placeholder}
      value={val} onChange={e => setVal(e.target.value)} />);

  return (
    <div className="gq-price">
      <div className="gq-row" style={{ gap: 8 }}>
        <strong className="gq-small">Price</strong><Badge tone={tone}>{PRICE_STEP[p.price_status]}</Badge>
        {p.store_price != null && <span className="gq-small">Store {rupees(p.store_price)}</span>}
        {p.markup_pct != null && <span className="gq-small">· markup {p.markup_pct}%</span>}
        {p.base_price != null && <span className="gq-small">· price {rupees(p.base_price)}</span>}
        {p.final_price != null && <span className="gq-small"><strong>· MRP {rupees(p.final_price)}</strong></span>}
      </div>
      {p.price_note && <p className="gq-small" style={{ color: 'var(--amber)' }}>Sent back: {p.price_note}</p>}
      {err && <Banner tone="bad" onClose={() => setErr(null)}>{err}</Banner>}
      {open && who === 'store' && p.price_status !== 'APPROVED' && (
        <div className="gq-row" style={{ gap: 6, marginTop: 6 }}>
          {input('Store price', 'Store price ₹')}
          <button className="btn-primary btn-sm" disabled={busy || !(Number(val) > 0)} onClick={() => act(() => ordersApi.storePrice(o.id, Number(val)))}>
            {p.store_price != null ? 'Update store price' : 'Send store price'}</button>
        </div>)}
      {open && who === 'admin' && ['AWAITING_ADMIN', 'AWAITING_DOCTOR'].includes(p.price_status) && (
        <div className="gq-row" style={{ gap: 6, marginTop: 6 }}>
          {input('Markup percent', 'Markup %')}<span className="gq-small gq-muted">%
            {p.store_price != null && Number(val) >= 0 ? ` → ${rupees(Math.round(p.store_price * (1 + Number(val) / 100) * 100) / 100)}` : ''}</span>
          <button className="btn-primary btn-sm" disabled={busy || !(Number(val) >= 0) || val === ''} onClick={() => act(() => ordersApi.markup(o.id, Number(val)))}>Send to doctor</button>
        </div>)}
      {open && who === 'doctor' && p.price_status === 'AWAITING_DOCTOR' && (
        <div className="gq-row" style={{ gap: 6, marginTop: 6 }}>
          {input('Final price', `≥ ${Math.ceil(p.base_price || 0)}`)}
          <button className="btn-primary btn-sm" disabled={busy || !(Number(val) >= Math.ceil(p.base_price || 0))}
            onClick={() => act(() => ordersApi.doctorPrice(o.id, Number(val)))}>Approve final price (MRP)</button>
          <input className="gq-select" style={{ minWidth: 180 }} placeholder="Reason to send back" aria-label="Reason to send back" value={note} onChange={e => setNote(e.target.value)} />
          <button className="btn-secondary btn-sm" disabled={busy || !note.trim()} onClick={() => act(() => ordersApi.sendBack(o.id, note))}>Send back to store</button>
        </div>)}
    </div>
  );
}
