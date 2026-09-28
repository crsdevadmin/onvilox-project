// Admin → one ingredient: every safety field, status, change note, history.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '../../../core/useAsync';
import { Badge, Banner, Card, DataTable, Loading, PageHeader, SchemaForm, type FormValues } from '../../../ui';
import { ingredientsApi, type IngredientHistory } from './api';

export function IngredientEditPage() {
  const { ingredientId = 'new' } = useParams();
  const isNew = ingredientId === 'new';
  const nav = useNavigate();
  const { data: sections } = useAsync(ingredientsApi.fields, []);
  const { data: ing, error, reload } = useAsync(() => (isNew ? Promise.resolve(null) : ingredientsApi.get(ingredientId)), [ingredientId]);
  const [v, setV] = useState<FormValues>({});
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('INACTIVE');
  const [newId, setNewId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  useEffect(() => { if (ing) { setV(ing as unknown as FormValues); setStatus(ing.status); } }, [ing]);
  if (error) return <Banner tone="bad">{error}</Banner>;
  if (!sections || (!isNew && !ing)) return <Loading />;

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const keys = sections!.flatMap(s => s.fields.map(f => f.key));
      const body: Record<string, unknown> = Object.fromEntries(keys.map(k => [k, v[k] ?? null]));
      body.status = status; body.change_note = note;
      if (isNew) { const { id } = await ingredientsApi.create({ ...body, id: newId }); nav(`../${encodeURIComponent(id)}`, { replace: true }); return; }
      await ingredientsApi.update(ingredientId, { ...body, version: ing!.version });
      setNote(''); await reload(); setMsg({ tone: 'ok', text: 'Saved as a new version.' });
    } catch (e) { setMsg({ tone: 'bad', text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <p className="gq-small" style={{ marginBottom: 8 }}><Link to="..">‹ All ingredients</Link></p>
      <PageHeader title={isNew ? 'New ingredient' : `${ing!.id} · ${ing!.name}`}
        subtitle={ing ? <>Version {ing.version} · {ing.usable ? <Badge tone="ok">Usable in formulas</Badge> : <Badge tone="warn">Not usable yet</Badge>}
          {ing.missing.length > 0 && <span className="gq-small"> Missing: {ing.missing.join(', ')}</span>}</> : 'Starts inactive'} />
      {msg && <Banner tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Banner>}
      <Card>
        {isNew && <div className="form-group"><label htmlFor="i_id">Ingredient ID</label>
          <input id="i_id" placeholder="ING-011" value={newId} onChange={e => setNewId(e.target.value.toUpperCase())} /></div>}
        <SchemaForm sections={sections} values={v} onChange={(k, x) => setV(s => ({ ...s, [k]: x }))} />
        <div className="form-group" style={{ maxWidth: 320 }}><label htmlFor="i_st">Status</label>
          <select id="i_st" value={status} onChange={e => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}>
            <option value="INACTIVE">Inactive — cannot be used</option><option value="ACTIVE">Active — usable when complete</option></select></div>
      </Card>
      <div className="gq-row gq-sticky-actions">
        <input className="gq-search" style={{ maxWidth: 420 }} placeholder={isNew ? 'Note (optional)' : 'What changed and why (required)'}
          value={note} onChange={e => setNote(e.target.value)} aria-label="Change note" />
        <button className="btn-primary" disabled={busy || (!isNew && !note.trim()) || (isNew && !newId)} onClick={save}>{busy ? 'Saving…' : isNew ? 'Create' : 'Save new version'}</button>
      </div>
      {ing && <><div style={{ height: 16 }} /><Card title="Version history">
        <DataTable<IngredientHistory> rows={ing.history} rowKey={h => String(h.id)} columns={[
          { key: 'v', header: 'Version', render: h => `v${h.version}` },
          { key: 'w', header: 'When', render: h => new Date(h.changed_at).toLocaleString() },
          { key: 'b', header: 'By', render: h => h.changed_by_name || 'System' },
          { key: 'n', header: 'Note', render: h => h.change_note || '—' }]} /></Card></>}
    </>
  );
}
