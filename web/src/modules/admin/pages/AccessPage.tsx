// Admin → Module Access. Grant or revoke Oncology / Fertility per user (with
// their role in each module), choose which modules each store serves, and see
// the audit trail of every change.
import { useState } from 'react';
import { accessApi } from '../api';
import { useAsync } from '../../../core/useAsync';
import { Banner, Card, Loading, PageHeader, Tabs } from '../../../ui';
import { AuditList } from '../components/AuditList';
import { StoreAccessTable } from '../components/StoreAccessTable';
import { UserAccessTable } from '../components/UserAccessTable';
import type { StoreRow, UserRow } from '../types';

type TabKey = 'users' | 'stores' | 'audit';

export function AccessPage() {
  const [tab, setTab] = useState<TabKey>('users');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const { data, error, loading, reload } = useAsync(accessApi.matrix, []);

  async function save(key: string, action: () => Promise<unknown>, okText: string) {
    setBusyKey(key);
    setMsg(null);
    try {
      await action();
      await reload();
      setMsg({ tone: 'ok', text: okText });
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyKey(null);
    }
  }

  const modName = (code: string) => data?.modules.find(m => m.code === code)?.name || code;

  const onUser = (u: UserRow, code: string, enabled: boolean, role: string | null) =>
    save(`${u.id}:${code}`, () => accessApi.setUser(u.id, code, enabled, role),
      `${u.name}: ${modName(code)} ${enabled ? `granted${role ? ` as ${role.toLowerCase()}` : ''}` : 'removed'}.`);

  const onStore = (s: StoreRow, code: string, enabled: boolean) =>
    save(`${s.id}:${code}`, () => accessApi.setStore(s.id, code, enabled),
      `${s.name} ${enabled ? 'now serves' : 'no longer serves'} ${modName(code)}.`);

  let body;
  if (tab === 'audit') body = <AuditList />;
  else if (loading && !data) body = <Loading />;
  else if (error) body = <Banner tone="bad">{error}</Banner>;
  else if (data && tab === 'users') body = <UserAccessTable matrix={data} busyKey={busyKey} onChange={onUser} />;
  else if (data) body = <StoreAccessTable matrix={data} busyKey={busyKey} onChange={onStore} />;

  return (
    <>
      <PageHeader title="Module access"
        subtitle="Everyone signs in on the same login page. What they see afterwards is decided here." />
      {msg && <Banner tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Banner>}
      <Tabs<TabKey> value={tab} onChange={setTab}
        tabs={[{ key: 'users', label: 'Users' }, { key: 'stores', label: 'Stores' }, { key: 'audit', label: 'Change log' }]} />
      <Card>{body}</Card>
      <p className="gq-small gq-muted" style={{ marginTop: 12 }}>
        Oncology roles follow the user’s platform role (set on Create Users). Admins always have every module.
        Changes reach other signed-in users within about 30 seconds.
      </p>
    </>
  );
}
