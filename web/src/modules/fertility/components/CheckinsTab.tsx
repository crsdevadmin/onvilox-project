// Weekly check-in (rule MO-01): weight, adherence, tolerance and — for the
// female partner — symptoms and pregnancy test. Saving re-runs the rules, so a
// red-flag symptom (e.g. OHSS signs, RF-05) shows immediately.
import { useState } from 'react';
import { Badge, Banner, Card, DataTable, SchemaForm, Tabs, type FormValues, type SectionDef } from '../../../ui';
import { fertilityApi } from '../api';
import { sexLabel, today } from '../helpers';
import type { CaseDetail, Checkin, EngineRun, FxSchema, Sex } from '../types';

function symptoms(c: Checkin, sections: SectionDef[]) {
  const s = sections.find(x => x.title.startsWith('Symptoms'));
  return (s?.fields || []).filter(f => c.data[f.key] === true).map(f => f.label);
}

export function CheckinsTab({ c, schema, canEdit, onSaved, onOpenFindings }: {
  c: CaseDetail; schema: FxSchema; canEdit: boolean; onSaved: () => void; onOpenFindings: () => void;
}) {
  const [sex, setSex] = useState<Sex>(c.partners[0]?.sex || 'F');
  const [date, setDate] = useState(today());
  const [values, setValues] = useState<FormValues>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<EngineRun | null>(null);
  const p = c.partners.find(x => x.sex === sex);
  if (!p) return <Card><p className="gq-muted">Add a partner first.</p></Card>;
  const sections = sex === 'F' ? schema.checkin.female : schema.checkin.male;

  async function save() {
    setBusy(true); setErr(null); setResult(null);
    try {
      const run = await fertilityApi.addCheckin(c.id, p!.id, date, values);
      setResult(run); setValues({}); onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const mine = result?.output.partners.find(x => x.partnerId === p.id);
  const flags = mine?.findings.filter(f => f.kind === 'RED_FLAG' || f.kind === 'SAFETY_MODE') || [];
  const prevWeight = (i: number) => Number(p.checkins[i + 1]?.data.weight_kg);

  return (
    <>
      {c.partners.length > 1 && <Tabs<Sex> value={sex} onChange={s => { setSex(s); setValues({}); setResult(null); }}
        tabs={c.partners.map(x => ({ key: x.sex, label: `${sexLabel(x.sex)} · ${x.name}` }))} />}
      {result && (flags.length
        ? <Banner tone="bad">Check-in saved. Rules found: {flags.map(f => `${f.ruleId} — ${f.message}`).join(' · ')}
            {' '}<button className="btn-secondary btn-sm" onClick={onOpenFindings}>Open decision support</button></Banner>
        : <Banner tone="ok" onClose={() => setResult(null)}>Check-in saved and rules re-run — no red flags.</Banner>)}
      {canEdit && (
        <Card title="New check-in">
          {err && <Banner tone="bad" onClose={() => setErr(null)}>{err}</Banner>}
          <div className="gq-form-grid"><div className="form-group"><label htmlFor="ci_d">Check-in date<span className="gq-req">*</span></label>
            <input id="ci_d" type="date" max={today()} value={date} onChange={e => setDate(e.target.value)} /></div></div>
          <SchemaForm sections={sections} values={values} disabled={busy}
            onChange={(k, v) => setValues(s => ({ ...s, [k]: v }))} />
          <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save check-in'}</button>
        </Card>)}
      <div style={{ height: 16 }} />
      <Card title="Previous check-ins">
        <DataTable<Checkin> rows={p.checkins} rowKey={x => String(x.id)} empty="No check-ins yet."
          columns={[
            { key: 'd', header: 'Date', render: x => <div>{x.checkin_date}<div className="gq-small gq-muted">{x.phase}</div></div> },
            { key: 'w', header: 'Weight', render: x => {
              const i = p.checkins.indexOf(x); const w = Number(x.data.weight_kg); const d = w - prevWeight(i);
              return <span>{w} kg{Number.isFinite(d) && d !== 0 && <span className="gq-small gq-muted"> ({d > 0 ? '+' : ''}{Math.round(d * 10) / 10})</span>}</span>; } },
            { key: 'a', header: 'Adherence', render: x => (x.data.adherence_pct != null ? `${x.data.adherence_pct}%` : '—') },
            { key: 's', header: 'Symptoms', render: x => { const s = symptoms(x, sections);
              return s.length ? <div className="gq-row" style={{ gap: 4 }}>{s.map(l => <Badge key={l} tone="warn">{l}</Badge>)}</div> : <span className="gq-muted">None</span>; } },
            { key: 't', header: 'Pregnancy test', render: x => (x.data.pregnancy_test as string) || '—' },
            { key: 'b', header: 'By', render: x => <span className="gq-small">{x.created_by_name || '—'}</span> },
          ]} />
      </Card>
    </>
  );
}
