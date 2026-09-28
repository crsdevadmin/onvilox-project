import { useMemo, useState } from 'react';
import { DataTable, type Column } from '../../../ui';
import type { Matrix, UserRow } from '../types';
import { UserModuleCell } from './UserModuleCell';

export function UserAccessTable({ matrix, busyKey, onChange }: {
  matrix: Matrix; busyKey: string | null;
  onChange: (user: UserRow, code: string, enabled: boolean, role: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return !s ? matrix.users : matrix.users.filter(u =>
      [u.name, u.email, u.role, u.hospital].some(v => (v || '').toLowerCase().includes(s)));
  }, [q, matrix.users]);

  const storeName = (id: string | null) => matrix.stores.find(s => s.id === id)?.name || '';

  const columns: Column<UserRow>[] = [
    { key: 'user', header: 'User', render: u => (
      <div><strong>{u.name}</strong><div className="gq-small gq-muted">{u.email}</div></div>) },
    { key: 'role', header: 'Platform role', render: u => (
      <div>{u.role.replace('_', ' ').toLowerCase()}
        {u.storeId && <div className="gq-small gq-muted">{storeName(u.storeId)}</div>}</div>) },
    ...matrix.modules.map(m => ({
      key: m.code,
      header: m.name,
      render: (u: UserRow) => (
        <UserModuleCell user={u} mod={m} grant={u.grants[m.code]} busy={busyKey === `${u.id}:${m.code}`}
          onChange={(enabled, role) => onChange(u, m.code, enabled, role)} />),
    })),
  ];

  return (
    <>
      <input className="gq-search" placeholder="Search name, email, role, hospital" value={q}
        onChange={e => setQ(e.target.value)} style={{ marginBottom: 12 }} aria-label="Search users" />
      <DataTable columns={columns} rows={rows} rowKey={u => u.id} empty="No users match." />
    </>
  );
}
