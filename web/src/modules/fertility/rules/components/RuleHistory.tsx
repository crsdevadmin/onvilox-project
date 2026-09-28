import { DataTable } from '../../../../ui';
import type { RuleHistoryRow } from '../types';

/** Every saved version of a rule — who changed it, when and why. */
export function RuleHistory({ rows }: { rows: RuleHistoryRow[] }) {
  return (
    <DataTable<RuleHistoryRow> rows={rows} rowKey={r => String(r.id)} empty="No history."
      columns={[
        { key: 'v', header: 'Version', render: r => `v${r.version}` },
        { key: 'when', header: 'When', render: r => <span className="gq-small">{new Date(r.changed_at).toLocaleString()}</span> },
        { key: 'who', header: 'By', render: r => r.changed_by_name || 'System' },
        { key: 'note', header: 'Change note', render: r => <span className="gq-small">{r.change_note || '—'}</span> },
        { key: 'st', header: 'Status then', render: r => <span className="gq-small">{r.snapshot.status}</span> },
      ]} />
  );
}
