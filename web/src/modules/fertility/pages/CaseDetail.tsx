// One fertility case: care team, phase, and a tab per partner.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAccess } from '../../../core/AccessContext';
import { useAsync } from '../../../core/useAsync';
import { Badge, Banner, Card, Loading, PageHeader, Tabs } from '../../../ui';
import { fertilityApi } from '../api';
import { CareTeam } from '../components/CareTeam';
import { PartnerTab } from '../components/PartnerTab';
import { PhasePanel } from '../components/PhasePanel';
import { CAN_EDIT, CAN_MANAGE, CAN_OPEN_CASE, phaseLabel } from '../helpers';
import { useFxSchema } from '../useFxSchema';

type Tab = 'F' | 'M' | 'phase';

export function CaseDetail() {
  const { caseId = '' } = useParams();
  const { roleIn } = useAccess();
  const role = roleIn('fertility') || '';
  const [tab, setTab] = useState<Tab>('F');
  const { data: schema, error: schemaErr } = useFxSchema();
  const { data: c, error, loading, reload } = useAsync(() => fertilityApi.get(caseId), [caseId]);

  if (error || schemaErr) return <Banner tone="bad">{error || schemaErr}</Banner>;
  if (loading && !c) return <Loading />;
  if (!c || !schema) return null;

  const names = c.partners.map(p => p.name).join(' & ') || 'Case';
  const reloadQuiet = () => { void reload(); };

  return (
    <>
      <p className="gq-small" style={{ marginBottom: 8 }}><Link to="..">‹ All cases</Link></p>
      <PageHeader title={names}
        subtitle={<>Phase <Badge tone="info">{c.phase}</Badge> {phaseLabel(schema.phases, c.phase)}{c.phase_date ? ` · since ${c.phase_date}` : ''}</>}
        actions={<CareTeam c={c} canManage={CAN_MANAGE.includes(role)} onSaved={reloadQuiet} />} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'F', label: 'Female partner' }, { key: 'M', label: 'Male partner' }, { key: 'phase', label: 'Treatment phase' }]} />
      {tab === 'phase' ? (
        <Card><PhasePanel c={c} phases={schema.phases} canManage={CAN_MANAGE.includes(role)} onSaved={reloadQuiet} /></Card>
      ) : (
        <PartnerTab key={tab} c={c} sex={tab} schema={schema} canEdit={CAN_EDIT.includes(role)}
          canAdd={CAN_OPEN_CASE.includes(role)} onSaved={reloadQuiet} />
      )}
    </>
  );
}
