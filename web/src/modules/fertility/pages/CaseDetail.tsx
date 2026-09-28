// One fertility case: care team, phase, and a tab per partner.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAccess } from '../../../core/AccessContext';
import { useAsync } from '../../../core/useAsync';
import { Badge, Banner, Card, Loading, PageHeader, Tabs } from '../../../ui';
import { fertilityApi } from '../api';
import { AlertsBar } from '../components/AlertsBar';
import { CareTeam } from '../components/CareTeam';
import { CheckinsTab } from '../components/CheckinsTab';
import { DecisionSupport } from '../components/DecisionSupport';
import { PartnerTab } from '../components/PartnerTab';
import { PhasePanel } from '../components/PhasePanel';
import { FormulaTab } from '../formula/FormulaTab';
import { CAN_EDIT, CAN_MANAGE, CAN_OPEN_CASE, phaseLabel } from '../helpers';
import { useFxSchema } from '../useFxSchema';

type Tab = 'F' | 'M' | 'checkins' | 'phase' | 'rules' | 'formula';

export function CaseDetail() {
  const { caseId = '' } = useParams();
  const { roleIn } = useAccess();
  const role = roleIn('fertility') || '';
  const [tab, setTab] = useState<Tab>('F');
  const [alertsKey, setAlertsKey] = useState(0);
  const { data: schema, error: schemaErr } = useFxSchema();
  const { data: c, error, loading, reload } = useAsync(() => fertilityApi.get(caseId), [caseId]);

  if (error || schemaErr) return <Banner tone="bad">{error || schemaErr}</Banner>;
  if (loading && !c) return <Loading />;
  if (!c || !schema) return null;

  const names = c.partners.map(p => p.name).join(' & ') || 'Case';
  const reloadQuiet = () => { void reload(); setAlertsKey(k => k + 1); };

  return (
    <>
      <p className="gq-small" style={{ marginBottom: 8 }}><Link to="..">‹ All cases</Link></p>
      <PageHeader title={names}
        subtitle={<>Phase <Badge tone="info">{c.phase}</Badge> {phaseLabel(schema.phases, c.phase)}{c.phase_date ? ` · since ${c.phase_date}` : ''}</>}
        actions={<CareTeam c={c} canManage={CAN_MANAGE.includes(role)} onSaved={reloadQuiet} />} />
      <AlertsBar caseId={c.id} canAck={CAN_MANAGE.includes(role)} refreshKey={alertsKey} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'F', label: 'Female partner' }, { key: 'M', label: 'Male partner' }, { key: 'checkins', label: 'Check-ins' }, { key: 'phase', label: 'Treatment phase' }, { key: 'rules', label: 'Decision support' }, { key: 'formula', label: 'Formula' }]} />
      {tab === 'formula' ? <FormulaTab c={c} />
        : tab === 'rules' ? <DecisionSupport key={c.updated_at} c={c} schema={schema} onRan={() => setAlertsKey(k => k + 1)} />
        : tab === 'checkins' ? <CheckinsTab c={c} schema={schema} canEdit={CAN_EDIT.includes(role)} onSaved={reloadQuiet} onOpenFindings={() => setTab('rules')} />
        : tab === 'phase' ? (
        <Card><PhasePanel c={c} phases={schema.phases} canManage={CAN_MANAGE.includes(role)} onSaved={reloadQuiet} /></Card>
      ) : (
        <PartnerTab key={tab} c={c} sex={tab} schema={schema} canEdit={CAN_EDIT.includes(role)}
          canAdd={CAN_OPEN_CASE.includes(role)} onSaved={reloadQuiet} />
      )}
    </>
  );
}
