import { DataTable, Toggle, type Column } from '../../../ui';
import type { Matrix, StoreRow } from '../types';

export function StoreAccessTable({ matrix, busyKey, onChange }: {
  matrix: Matrix; busyKey: string | null;
  onChange: (store: StoreRow, code: string, enabled: boolean) => void;
}) {
  const columns: Column<StoreRow>[] = [
    { key: 'store', header: 'Store', render: s => (
      <div><strong>{s.name}</strong><div className="gq-small gq-muted">{s.hospital}</div></div>) },
    ...matrix.modules.map(m => ({
      key: m.code,
      header: `Serves ${m.name}`,
      render: (s: StoreRow) => (
        <Toggle checked={s.modules[m.code]} disabled={busyKey === `${s.id}:${m.code}`}
          label={`${s.name} serves ${m.name}`} onChange={next => onChange(s, m.code, next)} />),
    })),
  ];
  return (
    <>
      <p className="gq-small gq-muted" style={{ marginBottom: 12 }}>
        Store staff see a module only if their store serves it <em>and</em> they have been granted it.
        A store serving both modules gets both store screens.
      </p>
      <DataTable columns={columns} rows={matrix.stores} rowKey={s => s.id} empty="No stores yet." />
    </>
  );
}
