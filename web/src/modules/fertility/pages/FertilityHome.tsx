// Fertility clinician home. Phase 0: proves access end-to-end.
// V1-a replaces the empty list with the couple/case list and assessment flow.
import { fertilityApi } from '../api';
import { useAsync } from '../../../core/useAsync';
import { Badge, Banner, Card, EmptyState, Loading, PageHeader } from '../../../ui';

export function FertilityHome() {
  const { data, error, loading } = useAsync(fertilityApi.home, []);
  return (
    <>
      <PageHeader title="Fertility" subtitle="Preconception, IVF and male-factor nutrition"
        actions={data && <Badge tone="info">{data.module.role.toLowerCase()}</Badge>} />
      {error && <Banner tone="bad">{error}</Banner>}
      <Card title="Couples under care">
        {loading ? <Loading /> : (
          <EmptyState>
            No couples yet. Case creation, female and male assessments and the clinical
            rule engine arrive in the next release (Fertility V1-a).
          </EmptyState>
        )}
      </Card>
    </>
  );
}
