// Lab results for one partner — value, unit, the report's own reference range
// and date are all required (rule G-09). Stale (>90 days) results are marked.
import { useState } from 'react';
import { Badge, Banner, DataTable } from '../../../ui';
import { fertilityApi } from '../api';
import { labStatus, today } from '../helpers';
import type { FxSchema, Lab, Partner } from '../types';

const blank = { analyte: '', value: '', unit: '', refLow: '', refHigh: '', collectedOn: today(), source: '' };

export function LabsPanel({ caseId, partner, labs, canEdit, onSaved }: {
  caseId: string; partner: Partner; labs: FxSchema['labs']; canEdit: boolean; onSaved: () => void;
}) {
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const label = (code: string) => labs.find(l => l.code === code)?.label || code;
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = e.target.value;
    setF(s => ({ ...s, [k]: v, ...(k === 'analyte' && !s.unit ? { unit: labs.find(l => l.code === v)?.unit || '' } : {}) }));
  };

  async function add() {
    setBusy(true); setErr(null);
    try { await fertilityApi.addLab(caseId, partner.id, f); setF(blank); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const range = (l: Lab) => `${l.ref_low ?? ''}–${l.ref_high ?? ''}`;
  return (
    <>
      <DataTable<Lab> rows={partner.labs} rowKey={l => String(l.id)} empty="No lab results yet."
        columns={[
          { key: 't', header: 'Test', render: l => label(l.analyte) },
          { key: 'v', header: 'Result', render: l => <strong>{l.value} {l.unit}</strong> },
          { key: 'r', header: 'Reference', render: l => <span className="gq-small">{range(l)}</span> },
          { key: 's', header: 'Status', render: l => { const s = labStatus(l);
            return <div className="gq-row" style={{ gap: 4 }}><Badge tone={s.tone}>{s.label}</Badge>{s.stale && <Badge tone="warn">Over 90 days</Badge>}</div>; } },
          { key: 'd', header: 'Collected', render: l => <span className="gq-small">{l.collected_on}</span> },
        ]} />
      {canEdit && (
        <>
          <h3 className="gq-section-title">Add a result</h3>
          {err && <Banner tone="bad" onClose={() => setErr(null)}>{err}</Banner>}
          <div className="gq-form-grid">
            <div className="form-group"><label htmlFor="la">Test<span className="gq-req">*</span></label>
              <select id="la" value={f.analyte} onChange={set('analyte')}>
                <option value="">Select…</option>{labs.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select></div>
            <div className="form-group"><label htmlFor="lv">Value<span className="gq-req">*</span></label>
              <input id="lv" type="number" step="any" value={f.value} onChange={set('value')} /></div>
            <div className="form-group"><label htmlFor="lu">Unit (as on report)<span className="gq-req">*</span></label>
              <input id="lu" value={f.unit} onChange={set('unit')} /></div>
            <div className="form-group"><label htmlFor="ll">Reference low</label>
              <input id="ll" type="number" step="any" value={f.refLow} onChange={set('refLow')} /></div>
            <div className="form-group"><label htmlFor="lh">Reference high</label>
              <input id="lh" type="number" step="any" value={f.refHigh} onChange={set('refHigh')} /></div>
            <div className="form-group"><label htmlFor="ld">Collected on<span className="gq-req">*</span></label>
              <input id="ld" type="date" max={today()} value={f.collectedOn} onChange={set('collectedOn')} /></div>
          </div>
          <button className="btn-secondary" disabled={busy} onClick={add}>{busy ? 'Adding…' : 'Add result'}</button>
        </>
      )}
    </>
  );
}
