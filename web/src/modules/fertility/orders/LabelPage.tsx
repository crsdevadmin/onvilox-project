// Printable product label. Opens only when the price is approved (MRP) and a
// batch exists. Carries no health claims (rule G-08).
import { useParams } from 'react-router-dom';
import { useAsync } from '../../../core/useAsync';
import { Banner, Loading } from '../../../ui';
import { ordersApi, rupees } from './api';

const d = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export function LabelPage() {
  const { orderId = '' } = useParams();
  const { data: L, error } = useAsync(() => ordersApi.label(Number(orderId)), [orderId]);
  if (error) return <Banner tone="bad">{error}</Banner>;
  if (!L) return <Loading />;
  return (
    <>
      <div className="gq-row gq-noprint" style={{ marginBottom: 12 }}>
        <button className="btn-primary" onClick={() => window.print()}>Print label</button>
        <span className="gq-small gq-muted">Prints on a white page in any theme.</span>
      </div>
      <div className="gq-label">
        <div className="gq-label-head">
          <div><div className="gq-label-brand">GQUENCE</div><div>Personalised nutrition — fertility care</div></div>
          <div style={{ textAlign: 'right' }}><div className="gq-label-mrp">MRP {rupees(L.mrp)}</div><div>(incl. of all taxes)</div></div>
        </div>
        {L.pregnancyPending && <div className="gq-label-warn">Pregnancy-pending — prepared within pregnancy-safe limits. Use only as directed by your clinician.</div>}
        <table><tbody>
          <tr><th>Patient</th><td>{L.partnerName}{L.age ? `, ${L.age} y` : ''}{L.mrn ? ` · MRN ${L.mrn}` : ''}</td></tr>
          <tr><th>Prescribed by</th><td>Dr {L.doctor || '—'}</td></tr>
          <tr><th>For the week of</th><td>{d(L.weekStart)}</td></tr>
        </tbody></table>
        <table className="gq-label-items"><thead><tr><th>Ingredient</th><th>Per day</th></tr></thead><tbody>
          {L.items.map((i, k) => <tr key={k}><td>{i.name}{i.form && i.form !== i.name ? ` (${i.form})` : ''}</td><td>{i.dose} {i.unit}</td></tr>)}
        </tbody></table>
        <p>Use as directed by your clinician. Store in a cool, dry place.</p>
        <table><tbody>
          <tr><th>Batch No.</th><td>{L.batchNo}</td><th>Order</th><td>#{L.orderId}</td></tr>
          <tr><th>Mfg Date</th><td>{d(L.mfgDate)}</td><th>Exp Date</th><td>{d(L.expDate)}</td></tr>
          <tr><th>Manufactured by</th><td colSpan={3}>{L.store.name || '—'}{L.store.address ? `, ${L.store.address}` : ''}</td></tr>
          <tr><th>FSSAI No.</th><td colSpan={3}>{L.store.fssai || '— (add in Admin → Stores)'}</td></tr>
        </tbody></table>
      </div>
    </>
  );
}
