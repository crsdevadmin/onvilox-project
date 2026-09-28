// Admin → Fertility ingredients: the only ingredients a formula may use (rule IS-01).
import { Link, useNavigate } from 'react-router-dom';
import { useAsync } from '../../../core/useAsync';
import { Badge, Banner, Card, DataTable, Loading, PageHeader } from '../../../ui';
import { ingredientsApi, type Ingredient } from './api';

export function IngredientsPage() {
  const nav = useNavigate();
  const { data, error, loading } = useAsync(ingredientsApi.list, []);
  return (
    <>
      <PageHeader title="Fertility ingredients" subtitle="An ingredient can be used in a formula only when it is Active and every safety field is complete."
        actions={<button className="btn-primary" onClick={() => nav('new')}>+ New ingredient</button>} />
      {error && <Banner tone="bad">{error}</Banner>}
      <Card>
        {loading ? <Loading /> : (
          <DataTable<Ingredient> rows={data || []} rowKey={i => i.id} empty="No ingredients."
            columns={[
              { key: 'id', header: 'ID', render: i => <Link to={encodeURIComponent(i.id)}><strong>{i.id}</strong></Link> },
              { key: 'n', header: 'Ingredient', render: i => <div>{i.name}<div className="gq-small gq-muted">{i.form} · {i.unit}</div></div> },
              { key: 'ev', header: 'Evidence', render: i => i.evidence_level || '—' },
              { key: 'lim', header: 'Max / day (precon · stim · preg)', render: i =>
                <span className="gq-small">{[i.max_preconception, i.max_stimulation, i.max_pregnancy].map(v => (v ?? '—')).join(' · ')} {i.unit}</span> },
              { key: 'ul', header: 'Upper limit', render: i => (i.upper_limit != null ? `${i.upper_limit} ${i.unit}` : '—') },
              { key: 'st', header: 'Status', render: i => (
                <div className="gq-row" style={{ gap: 4 }}>
                  <Badge tone={i.usable ? 'ok' : 'neutral'}>{i.usable ? 'Usable' : i.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge>
                  {i.missing.length > 0 && <Badge tone="warn" title={i.missing.join(', ')}>{i.missing.length} missing</Badge>}
                  {i.reviewExpired && <Badge tone="bad">Review overdue</Badge>}
                  {i.is_herbal && <Badge tone="warn">Herbal</Badge>}
                </div>) },
            ]} />
        )}
      </Card>
    </>
  );
}
