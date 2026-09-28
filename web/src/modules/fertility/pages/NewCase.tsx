// Open a new fertility case: one or both partners and the starting phase.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banner, Card, PageHeader, Toggle } from '../../../ui';
import { fertilityApi } from '../api';
import { emptyPartner, PartnerFields } from '../components/PartnerFields';
import { today } from '../helpers';
import { useFxSchema } from '../useFxSchema';

export function NewCase() {
  const nav = useNavigate();
  const { data: schema } = useFxSchema();
  const [female, setFemale] = useState(emptyPartner());
  const [male, setMale] = useState(emptyPartner());
  const [withF, setWithF] = useState(true);
  const [withM, setWithM] = useState(true);
  const [phase, setPhase] = useState('F0');
  const [phaseDate, setPhaseDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const { id } = await fertilityApi.create({
        female: withF ? female : undefined, male: withM ? male : undefined, phase, phaseDate });
      nav(`../${id}`, { replace: true });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  const partnerCard = (title: string, on: boolean, setOn: (b: boolean) => void, v: typeof female, set: typeof setFemale, p: string) => (
    <Card title={title} actions={<Toggle checked={on} onChange={setOn} label={`Include ${title.toLowerCase()}`} />}>
      {on ? <PartnerFields value={v} onChange={set} prefix={p} /> : <p className="gq-muted">Not included — can be added later.</p>}
    </Card>
  );

  return (
    <>
      <PageHeader title="New fertility case" subtitle="Each partner gets their own assessment and formula." />
      {err && <Banner tone="bad" onClose={() => setErr(null)}>{err}</Banner>}
      <div className="gq-grid-2">
        {partnerCard('Female partner', withF, setWithF, female, setFemale, 'f')}
        {partnerCard('Male partner', withM, setWithM, male, setMale, 'm')}
      </div>
      <div style={{ height: 16 }} />
      <Card title="Treatment phase">
        <div className="gq-form-grid">
          <div className="form-group"><label htmlFor="ph">Starting phase</label>
            <select id="ph" value={phase} onChange={e => setPhase(e.target.value)}>
              {schema?.phases.filter(p => p.value !== 'CLOSED').map(p => <option key={p.value} value={p.value}>{p.value} — {p.label}</option>)}
            </select></div>
          <div className="form-group"><label htmlFor="pd">Phase start date</label>
            <input id="pd" type="date" max={today()} value={phaseDate} onChange={e => setPhaseDate(e.target.value)} /></div>
        </div>
      </Card>
      <div className="gq-row gq-sticky-actions">
        <button className="btn-primary" disabled={busy || (!withF && !withM)} onClick={submit}>{busy ? 'Saving…' : 'Open case'}</button>
        <button className="btn-secondary" onClick={() => nav('..')}>Cancel</button>
      </div>
    </>
  );
}
