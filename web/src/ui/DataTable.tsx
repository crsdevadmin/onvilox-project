// Generic table: pass columns + rows. Used by every list screen so tables
// behave the same everywhere (and so no page hand-builds <table> markup again).
import type { ReactNode } from 'react';
import { EmptyState } from './States';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  width?: number | string;
}

export function DataTable<T>({ columns, rows, rowKey, empty = 'Nothing here yet.' }: {
  columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; empty?: ReactNode;
}) {
  if (!rows.length) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="gq-table-wrap">
      <table className="table">
        <thead>
          <tr>{columns.map(c => <th key={c.key} style={{ width: c.width }}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={rowKey(r)}>{columns.map(c => <td key={c.key}>{c.render(r)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
