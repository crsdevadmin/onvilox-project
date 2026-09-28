// Decision support: runs the clinical rules on this case and shows what they
// found. Findings only — the engine never prescribes or changes a formula.
import { useState } from 'react';
import { useAsync } from '../../../core/useAsync';
import { Banner, Card, EmptyState, Loading } from '../../../ui';
import { fertilityApi } from '../api';
import { sexLabel } from '../helpers';
import type { CaseDetail, EngineRun, FxSchema } from '../types';
import { FindingCard } from './FindingCard';

export function DecisionSupport({ c, schema, onRan }: { c: CaseDetail; schema: FxSchema; onRan?: () => void }) {
  const { data: latest, loading } = useAsync(() => fertilityApi.latestRun(c.id), [c.id]);
  const [run, setRun] = useState<EngineRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const shown = run || latest;
  const label = (key: string) => {
    for (const s of [...schema.female, ...schema.male]) { const f = s.fields.find(x => x.key === key); if (f) return f.label; }
    return key.replace(/^lab_(\w+)_(value|status)$/, (_m, code: string) => schema.labs.find(l => l.code === code)?.label || code).replace(/_/g, ' ');
  };

  async function go() {
    setBusy(true); setErr(null);
    try { setRun(await fertilityApi.runEngine(c.id)); onRan?.(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  if (loading) return <Loading />;
  const out = shown?.output;
  return (
    <>
      <Banner tone="info">
        Decision support only. Findings come from the fertility rule set; rules marked “Draft” are not yet clinically
        approved. The treating clinician decides every action. No formula is created here.
      </Banner>
      {err && <Banner tone="bad" onClose={() => setErr(null)}>{err}</Banner>}
      <div className="gq-row" style={{ marginBottom: 14 }}>
        <button className="btn-primary" disabled={busy} onClick={go}>{busy ? 'Running…' : shown ? 'Run again with latest data' : 'Run rules'}</button>
        {shown && <span className="gq-small gq-muted">Last run {new Date(shown.created_at).toLocaleString()}{shown.run_by_name ? ' · ' + shown.run_by_name : ''} · {shown.engine}</span>}
      </div>
      {!out ? <Card><EmptyState>Not run yet for this case.</EmptyState></Card> : (
        <>
          {out.formulaChangesStopped && <Banner tone="bad">Red flag present — automated formula changes are stopped until the treating specialist reviews (rule G-05).</Banner>}
          {out.pregnancyPending && <Banner tone="bad">Pregnancy-pending mode — pregnancy safety limits apply (rules F9-01…F9-04).</Banner>}
          {out.partners.map(p => (
            <div key={p.partnerId} style={{ marginBottom: 16 }}>
              <Card title={`${sexLabel(p.sex)} · ${p.name}`}
                actions={<span className="gq-small gq-muted">{p.findings.length} finding(s)</span>}>
                {!p.assessed && <Banner tone="bad">No assessment saved yet — most rules cannot run.</Banner>}
                {p.missingRequired && p.missingRequired.length > 0 &&
                  <p className="gq-small gq-muted" style={{ marginBottom: 8 }}>Assessment incomplete: {p.missingRequired.join(', ')}.</p>}
                {p.findings.length ? p.findings.map(f => <FindingCard key={f.ruleId} f={f} />) : <EmptyState>No rule matched.</EmptyState>}
                {(p.dataGaps.length > 0 || p.staleLabs.length > 0) && (
                  <p className="gq-small gq-muted" style={{ marginTop: 10 }}>
                    {p.dataGaps.length > 0 && <>Some rules could not be checked — missing: {p.dataGaps.map(label).join(', ')}. </>}
                    {p.staleLabs.length > 0 && <>Older than 90 days: {p.staleLabs.join(', ')}.</>}
                  </p>)}
              </Card>
            </div>
          ))}
        </>
      )}
    </>
  );
}
