// Admin → Fertility rules: every clinical rule, searchable, with review status.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAsync } from '../../../../core/useAsync';
import { Badge, Banner, Card, DataTable, Loading, PageHeader } from '../../../../ui';
import { rulesApi } from '../api';
import { pretty, type Rule } from '../types';

const statusTone = (s: string) => (s === 'APPROVED' ? 'ok' : s === 'RETIRED' ? 'neutral' : 'warn') as 'ok' | 'neutral' | 'warn';
const decTone = (d: string | null) => (d === 'Approve' ? 'ok' : d === 'Reject' ? 'bad' : d ? 'warn' : 'neutral') as 'ok' | 'bad' | 'warn' | 'neutral';

export function RulesPage() {
  const nav = useNavigate();
  const { data, error, loading } = useAsync(rulesApi.list, []);
  const [q, setQ] = useState('');
  const [area, setArea] = useState('');
  const [status, setStatus] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const areas = useMemo(() => [...new Set((data || []).map(r => r.area))], [data]);
  const rows = useMemo(() => (data || []).filter(r =>
    (!area || r.area === area) && (!status || r.status === status) &&
    (!q || [r.id, r.trigger_text, r.action_text, r.notes].some(v => (v || '').toLowerCase().includes(q.toLowerCase())))), [data, q, area, status]);
  const count = (s: string) => (data || []).filter(r => r.status === s).length;

  return (
    <>
      <PageHeader title="Fertility clinical rules"
        subtitle={data ? `${data.length} rules · ${count('APPROVED')} approved · ${count('DRAFT')} draft · ${count('RETIRED')} retired` : ' '}
        actions={<div className="gq-row">
          <button className="btn-secondary" onClick={() => rulesApi.exportCsv().catch(e => setErr(e.message))}>Export CSV</button>
          <button className="btn-primary" onClick={() => nav('new')}>+ New rule</button></div>} />
      <Banner tone="info">
        Draft rules run in the engine for testing and are labelled “Draft” wherever they appear. A rule becomes
        “Approved” only when both the IVF specialist and the dietitian have approved it.
      </Banner>
      {(error || err) && <Banner tone="bad">{error || err}</Banner>}
      <Card>
        <div className="gq-row" style={{ marginBottom: 12 }}>
          <input className="gq-search" placeholder="Search ID or text" value={q} onChange={e => setQ(e.target.value)} aria-label="Search rules" />
          <select className="gq-select" value={area} onChange={e => setArea(e.target.value)} aria-label="Area">
            <option value="">All areas</option>{areas.map(a => <option key={a}>{a}</option>)}</select>
          <select className="gq-select" value={status} onChange={e => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option><option value="DRAFT">Draft</option><option value="APPROVED">Approved</option><option value="RETIRED">Retired</option></select>
          <span className="gq-small gq-muted">{rows.length} shown</span>
        </div>
        {loading ? <Loading /> : (
          <DataTable<Rule> rows={rows} rowKey={r => r.id} empty="No rules match."
            columns={[
              { key: 'id', header: 'Rule', render: r => <div><Link to={encodeURIComponent(r.id)}><strong>{r.id}</strong></Link>
                {r.has_catalogue_update && <div><Badge tone="info" title="A catalogue update is waiting for review">Update</Badge></div>}</div> },
              { key: 'area', header: 'Area', render: r => <span className="gq-small">{r.area}</span> },
              { key: 'if', header: 'If', width: '30%', render: r => <span className="gq-small">{r.trigger_text}</span> },
              { key: 'kind', header: 'Type', render: r => <div className="gq-small">{pretty(r.kind)}
                <div className="gq-muted">{r.engine_mode === 'CONDITION' ? 'Engine' : r.engine_mode === 'SYSTEM' ? 'System' : 'Manual'}</div></div> },
              { key: 'ev', header: 'Evidence', render: r => r.evidence_level || '—' },
              { key: 'rev', header: 'IVF / Dietitian', render: r => <div className="gq-row" style={{ gap: 4 }}>
                <Badge tone={decTone(r.ivf_decision)}>{r.ivf_decision || '—'}</Badge><Badge tone={decTone(r.diet_decision)}>{r.diet_decision || '—'}</Badge></div> },
              { key: 'st', header: 'Status', render: r => <div><Badge tone={statusTone(r.status)}>{pretty(r.status)}</Badge>
                <div className="gq-small gq-muted">v{r.version}</div></div> },
            ]} />
        )}
      </Card>
    </>
  );
}
