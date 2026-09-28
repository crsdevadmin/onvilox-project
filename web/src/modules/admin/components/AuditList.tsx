import { accessApi } from '../api';
import { useAsync } from '../../../core/useAsync';
import { Badge, Banner, DataTable, Loading } from '../../../ui';
import type { AuditRow } from '../types';

const tone = (a: string) => (/GRANT|ENABLE/.test(a) ? 'ok' : 'bad') as 'ok' | 'bad';

export function AuditList() {
  const { data, error, loading } = useAsync(accessApi.audit, []);
  if (loading) return <Loading />;
  if (error) return <Banner tone="bad">{error}</Banner>;
  return (
    <DataTable<AuditRow> rows={data || []} rowKey={r => String(r.id)} empty="No access changes recorded yet."
      columns={[
        { key: 'at', header: 'When', render: r => new Date(r.at).toLocaleString() },
        { key: 'who', header: 'Changed by', render: r => r.actor_name || '—' },
        { key: 'what', header: 'Change', render: r => <Badge tone={tone(r.action)}>{r.action.replace('_', ' ').toLowerCase()}</Badge> },
        { key: 'target', header: 'For', render: r => `${r.target_name} (${r.target_type})` },
        { key: 'mod', header: 'Module', render: r => r.module_code || '' },
        { key: 'role', header: 'Role', render: r => r.after?.role?.toLowerCase() || '' },
      ]} />
  );
}
