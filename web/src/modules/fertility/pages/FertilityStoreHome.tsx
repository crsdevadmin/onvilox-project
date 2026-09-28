// Fertility store screen — separate from the Oncology store (/store).
// Phase 0: access-checked shell. V1-a lists weekly, phase-tagged formulation
// orders (female and male labels side by side, pregnancy-pending warnings).
import { fertilityApi } from '../api';
import { useAsync } from '../../../core/useAsync';
import { Badge, Banner, Card, DataTable, Loading, PageHeader } from '../../../ui';

interface OrderRow { id: string }

export function FertilityStoreHome() {
  const { data, error, loading } = useAsync(fertilityApi.home, []);
  return (
    <>
      <PageHeader title="Fertility orders" subtitle="Weekly personalised formulations for fertility patients"
        actions={<Badge tone="info">Fertility store</Badge>} />
      {error && <Banner tone="bad">{error}</Banner>}
      <Card title="Awaiting manufacture">
        {loading ? <Loading /> : (
          <DataTable<OrderRow>
            rows={(data?.orders as OrderRow[]) || []}
            rowKey={r => r.id}
            columns={[
              { key: 'couple', header: 'Couple', render: () => '' },
              { key: 'phase', header: 'Treatment phase', render: () => '' },
              { key: 'week', header: 'Week', render: () => '' },
              { key: 'status', header: 'Status', render: () => '' },
            ]}
            empty="No fertility orders yet." />
        )}
      </Card>
    </>
  );
}
