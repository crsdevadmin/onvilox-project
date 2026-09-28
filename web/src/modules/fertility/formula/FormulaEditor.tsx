// Build or edit a draft weekly formula from the ingredient master.
import { useState } from 'react';
import { Banner } from '../../../ui';
import type { Ingredient } from '../ingredients/api';
import { formulaApi, type Check, type Formula, type FormulaLine } from './api';
import { ChecksList } from './ChecksList';

const monday = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

export function FormulaEditor({ caseId, partnerId, ingredients, draft, onDone }: {
  caseId: string; partnerId: string; ingredients: Ingredient[]; draft?: Formula; onDone: () => void;
}) {
  const [week, setWeek] = useState(draft?.week_start || monday());
  const [lines, setLines] = useState<FormulaLine[]>(draft?.items.map(l => ({ ingredientId: l.ingredientId, dose: l.dose, reason: l.reason })) || [{ ingredientId: '', dose: null }]);
  const [notes, setNotes] = useState(draft?.notes || '');
  const [checks, setChecks] = useState<Check[] | null>(draft ? draft.checks : null);
  const [id, setId] = useState<number | undefined>(draft?.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ing = (i: string) => ingredients.find(x => x.id === i);
  const set = (i: number, p: Partial<FormulaLine>) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  async function save() {
    setBusy(true); setErr(null);
    try {
      const r = await formulaApi.save(caseId, { formulaId: id, partnerId, weekStart: week, notes,
        items: lines.filter(l => l.ingredientId).map(l => ({ ...l, dose: l.dose === null ? null : Number(l.dose) })) });
      setId(r.id); setChecks(r.checks);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div>
      {err && <Banner tone="bad" onClose={() => setErr(null)}>{err}</Banner>}
      <div className="gq-form-grid"><div className="form-group"><label htmlFor="fw">Week starting</label>
        <input id="fw" type="date" value={week} onChange={e => setWeek(e.target.value)} /></div></div>
      {lines.map((l, i) => {
        const g = ing(l.ingredientId);
        return (
          <div key={i} className="gq-row" style={{ gap: 8, marginBottom: 8 }}>
            <select className="gq-select" style={{ minWidth: 260 }} aria-label="Ingredient" value={l.ingredientId} onChange={e => set(i, { ingredientId: e.target.value })}>
              <option value="">Ingredient…</option>
              {ingredients.map(x => <option key={x.id} value={x.id} disabled={!x.usable}>{x.name}{x.form ? ` (${x.form})` : ''}{x.usable ? '' : ' — not usable yet'}</option>)}
            </select>
            <input className="gq-select" style={{ width: 110 }} type="number" step="any" min={0} aria-label="Dose per day" placeholder="Dose/day"
              value={l.dose ?? ''} onChange={e => set(i, { dose: e.target.value === '' ? null : Number(e.target.value) })} />
            <span className="gq-small gq-muted">{g?.unit || ''}/day</span>
            {g && ['C', 'D'].includes(g.evidence_level || '') &&
              <input className="gq-select" style={{ minWidth: 240 }} placeholder={`Clinical reason (level ${g.evidence_level})`} aria-label="Clinical reason"
                value={l.reason || ''} onChange={e => set(i, { reason: e.target.value })} />}
            <button type="button" className="btn-secondary btn-sm" aria-label="Remove line" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>✕</button>
          </div>);
      })}
      <button type="button" className="btn-secondary btn-sm" onClick={() => setLines(ls => [...ls, { ingredientId: '', dose: null }])}>+ Ingredient</button>
      <div className="form-group" style={{ marginTop: 12 }}><label htmlFor="fn">Notes for the store / patient</label>
        <textarea id="fn" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
      {checks && <><h3 className="gq-section-title">Safety checks</h3><ChecksList checks={checks} /></>}
      <div className="gq-row" style={{ marginTop: 10 }}>
        <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Checking…' : id ? 'Save & re-check draft' : 'Save draft & check'}</button>
        <button className="btn-secondary" onClick={onDone}>{id ? 'Done' : 'Cancel'}</button>
      </div>
    </div>
  );
}
