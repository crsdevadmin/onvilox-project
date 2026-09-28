// Fertility clinician home: the couples this user can see.
import { Link, useNavigate } from 'react-router-dom';
import { useAccess } from '../../../core/AccessContext';
import { useAsync } from '../../../core/useAsync';
import { Badge, Banner, Card, DataTable, Loading, PageHeader } from '../../../ui';
import { fertilityApi } from '../api';
import { CompletenessBadge } from '../components/CompletenessBadge';
import { CAN_OPEN_CASE, phaseLabel } from '../helpers';
import type { CaseSummary } from '../types';
import { useFxSchema } from '../useFxSchema';

export function CaseList() {
  const { roleIn } = useAccess();
  const nav = useNavigate();
  const { data: schema } = useFxSchema();
  const { data, error, loading } = useAsync(fertilityApi.cases, []);
  const canOpen = CAN_OPEN_CASE.includes(roleIn('fertility') || '');

  const partner = (c: CaseSummary, sex: 'F' | 'M') => c.partners.find(p => p.sex === sex);
  const who = (c: CaseSummary, sex: 'F' | 'M') => {
    const p = partner(c, sex);
    return p ? <div><strong>{p.name}</strong>{p.age ? <span className="gq-muted"> · {p.age}</span> : null}
      <div style={{ marginTop: 4 }}><CompletenessBadge missing={p.missing} /></div></div> : <span className="gq-muted">—</span>;
  };

  return (
    <>
      <PageHeader title="Fertility cases" subtitle="Couples under fertility nutrition care"
        actions={canOpen && <button className="btn-primary" onClick={() => nav('new')}>+ New case</button>} />
      {error && <Banner tone="bad">{error}</Banner>}
      <Card>
        {loading ? <Loading /> : (
          <DataTable<CaseSummary> rows={data || []} rowKey={c => c.id}
            empty={canOpen ? 'No cases yet — open the first one with “New case”.' : 'No cases have been assigned to you yet.'}
            columns={[
              { key: 'f', header: 'Female partner', render: c => who(c, 'F') },
              { key: 'm', header: 'Male partner', render: c => who(c, 'M') },
              { key: 'phase', header: 'Phase', render: c => (
                <div><Badge tone={c.status === 'CLOSED' ? 'neutral' : 'info'}>{c.phase}</Badge>
                  <div className="gq-small gq-muted">{phaseLabel(schema?.phases, c.phase)}</div></div>) },
              { key: 'team', header: 'Care team', render: c => (
                <div className="gq-small">{c.doctor_name || '—'}<div className="gq-muted">{c.dietitian_name ? 'Dietitian: ' + c.dietitian_name : 'No dietitian'}</div></div>) },
              { key: 'upd', header: 'Updated', render: c => <span className="gq-small">{new Date(c.updated_at).toLocaleDateString()}</span> },
              { key: 'open', header: '', render: c => <Link to={c.id}>Open ›</Link> },
            ]} />
        )}
      </Card>
    </>
  );
}
