// Admin → edit (or create) one clinical rule. Every save is a new version
// with a change note; the server refuses conflicting edits.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '../../../../core/useAsync';
import { Banner, Card, Loading, PageHeader } from '../../../../ui';
import { useFxSchema } from '../../useFxSchema';
import { rulesApi } from '../api';
import { ConditionBuilder } from '../components/ConditionBuilder';
import { RuleHistory } from '../components/RuleHistory';
import { BEHAVIOURS, DECISIONS, KINDS, LEVELS, MODES, pretty, type CondNode, type Rule } from '../types';

const EMPTY: Partial<Rule> = { area: '', rule_type: '', trigger_text: '', action_text: '', applies_to: 'B', kind: 'RECOMMENDATION',
  behaviour: 'FLAG', evidence_level: 'B', status: 'DRAFT', engine_mode: 'CONDITION', condition: { all: [] }, phases: [] };

export function RuleEditPage() {
  const { ruleId = 'new' } = useParams();
  const isNew = ruleId === 'new';
  const nav = useNavigate();
  const { data: schema } = useFxSchema();
  const { data: facts } = useAsync(rulesApi.facts, []);
  const { data: rule, error, reload } = useAsync(() => (isNew ? Promise.resolve(null) : rulesApi.get(ruleId)), [ruleId]);
  const [r, setR] = useState<Partial<Rule>>(EMPTY);
  const [newId, setNewId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  useEffect(() => { if (rule) setR(rule); }, [rule]);
  if (error) return <Banner tone="bad">{error}</Banner>;
  if ((!isNew && !rule) || !facts || !schema) return <Loading />;

  const set = <K extends keyof Rule>(k: K, v: Rule[K] | null) => setR(s => ({ ...s, [k]: v }));
  const text = (k: keyof Rule, label: string, area = false) => (
    <div className="form-group"><label htmlFor={'r_' + k}>{label}</label>
      {area ? <textarea id={'r_' + k} rows={3} value={(r[k] as string) || ''} onChange={e => set(k, e.target.value as never)} />
        : <input id={'r_' + k} value={(r[k] as string) || ''} onChange={e => set(k, e.target.value as never)} />}</div>);
  const pick = (k: keyof Rule, label: string, opts: string[], fmt = pretty, blank = false) => (
    <div className="form-group"><label htmlFor={'r_' + k}>{label}</label>
      <select id={'r_' + k} value={(r[k] as string) || ''} onChange={e => set(k, (e.target.value || null) as never)}>
        {blank && <option value="">—</option>}{opts.map(o => <option key={o} value={o}>{fmt(o)}</option>)}</select></div>);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const body = { ...r, change_note: note };
      if (isNew) { const { id } = await rulesApi.create({ ...body, id: newId }); nav(`../${encodeURIComponent(id)}`, { replace: true }); return; }
      await rulesApi.update(ruleId, body as Rule & { change_note: string });
      setNote(''); await reload(); setMsg({ tone: 'ok', text: 'Saved as a new version.' });
    } catch (e) { setMsg({ tone: 'bad', text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); }
  }

  const phases = r.phases || [];
  return (
    <>
      <p className="gq-small" style={{ marginBottom: 8 }}><Link to="..">‹ All rules</Link></p>
      <PageHeader title={isNew ? 'New rule' : `Rule ${ruleId}`}
        subtitle={rule ? `Version ${rule.version} · last changed ${new Date(rule.updated_at).toLocaleString()}${rule.updated_by_name ? ' by ' + rule.updated_by_name : ''}` : 'Starts as a draft'} />
      {msg && <Banner tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Banner>}
      {rule?.catalogue_update && (
        <Banner tone="info">
          Rule catalogue {rule.catalogue_update.catalogue_version} has an update for this rule that was not applied because it
          had been edited here. {rule.catalogue_update.note}.{rule.catalogue_update.notes ? ` Catalogue note: “${rule.catalogue_update.notes}”` : ''}
          {' '}<button className="btn-secondary btn-sm" onClick={() => {
            const u = rule.catalogue_update!;
            setR(s => ({ ...s, engine_mode: u.engine_mode, condition: u.condition, phases: u.phases, kind: u.kind,
              trigger_text: u.trigger_text, action_text: u.action_text }));
            setNote(`Applied catalogue ${u.catalogue_version} update`);
          }}>Load the update into the form</button> (your notes are kept; review, then save)
        </Banner>)}

      <Card title="Rule">
        <div className="gq-form-grid">
          {isNew && <div className="form-group"><label htmlFor="r_id">Rule ID</label>
            <input id="r_id" placeholder="e.g. F0-12" value={newId} onChange={e => setNewId(e.target.value.toUpperCase())} /></div>}
          {text('area', 'Area')}{text('pathway', 'Pathway (label)')}{text('rule_type', 'Rule type')}
          {pick('applies_to', 'Applies to', ['B', 'F', 'M'], v => ({ B: 'Both partners', F: 'Female', M: 'Male' } as Record<string, string>)[v])}
          {pick('kind', 'Finding type', KINDS)}{pick('behaviour', 'Engine behaviour', BEHAVIOURS, v => v)}
          {pick('evidence_level', 'Evidence level', LEVELS, v => v)}{text('sources', 'Source IDs')}
        </div>
        {text('trigger_text', 'IF (trigger, plain language)', true)}
        {text('action_text', 'THEN (what the clinician sees)', true)}
        {text('notes', 'Notes / claim restriction', true)}
      </Card>
      <div style={{ height: 16 }} />

      <Card title="How the engine uses it">
        {pick('engine_mode', 'Mode', Object.keys(MODES), m => MODES[m as Rule['engine_mode']])}
        <div className="form-group"><label>Treatment phases (none ticked = all phases)</label>
          <div className="gq-row">{schema.phases.map(p => (
            <label key={p.value} className="gq-small" style={{ display: 'inline-flex', gap: 4, textTransform: 'none', letterSpacing: 0 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={phases.includes(p.value)}
                onChange={e => set('phases', e.target.checked ? [...phases, p.value] : phases.filter(x => x !== p.value))} />
              {p.value} — {p.label}</label>))}</div></div>
        {r.engine_mode === 'CONDITION' && (
          <><label>Condition</label>
            <ConditionBuilder node={(r.condition as CondNode) || { all: [] }} facts={facts} onChange={n => set('condition', n)} /></>)}
      </Card>
      <div style={{ height: 16 }} />

      <Card title="Clinical review">
        <div className="gq-form-grid">
          {pick('ivf_decision', 'IVF specialist decision', DECISIONS, v => v, true)}
          {pick('diet_decision', 'Dietitian decision', DECISIONS, v => v, true)}
          {text('reviewed_by', 'Reviewed by')}
          <div className="form-group"><label htmlFor="r_ro">Date reviewed</label>
            <input id="r_ro" type="date" value={r.reviewed_on || ''} onChange={e => set('reviewed_on', e.target.value || null)} /></div>
          {pick('status', 'Status', ['DRAFT', 'APPROVED', 'RETIRED'])}
        </div>
        {text('reviewer_comments', 'Reviewer comments', true)}
      </Card>

      <div className="gq-row gq-sticky-actions">
        <input className="gq-search" style={{ maxWidth: 420 }} placeholder={isNew ? 'Note (optional)' : 'What changed and why (required)'}
          value={note} onChange={e => setNote(e.target.value)} aria-label="Change note" />
        <button className="btn-primary" disabled={busy || (!isNew && !note.trim()) || (isNew && !newId)} onClick={save}>
          {busy ? 'Saving…' : isNew ? 'Create rule' : 'Save new version'}</button>
      </div>

      {rule && <><div style={{ height: 16 }} /><Card title="Version history"><RuleHistory rows={rule.history} /></Card></>}
    </>
  );
}
