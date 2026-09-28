// Fertility store screen — separate from the Oncology store (/store).
// Store staff see their store's orders; admins see every order (and set markups).
import { useState } from 'react';
import { useAccess } from '../../../core/AccessContext';
import { useAsync } from '../../../core/useAsync';
import { isAdmin } from '../../../core/types';
import { Badge, Banner, Card, EmptyState, Loading, PageHeader, Tabs } from '../../../ui';
import { ordersApi } from '../orders/api';
import { OrderCard } from '../orders/OrderCard';

type View = 'open' | 'price' | 'done';

export function FertilityStoreHome() {
  const { roleIn } = useAccess();
  const role = roleIn('fertility') || '';
  const admin = isAdmin(role);
  const { data, error, loading, reload } = useAsync(ordersApi.list, []);
  const [view, setView] = useState<View>('open');
  const closed = (s: string) => ['DELIVERED', 'CANCELLED'].includes(s);
  const needsMe = (o: { price: { price_status: string }; status: string }) => o.status === 'NEW' &&
    (admin ? o.price.price_status === 'AWAITING_ADMIN' : o.price.price_status === 'AWAITING_STORE');
  const rows = (data || []).filter(o => view === 'done' ? closed(o.status) : view === 'price' ? needsMe(o) : !closed(o.status));
  const pending = (data || []).filter(needsMe).length;

  return (
    <>
      <PageHeader title="Fertility orders" subtitle="Weekly personalised formulations approved by the treating doctor"
        actions={<Badge tone="info">{admin ? 'All stores (admin)' : 'Fertility store'}</Badge>} />
      {error && <Banner tone="bad">{error}</Banner>}
      <Tabs<View> value={view} onChange={setView} tabs={[{ key: 'open', label: 'To do' },
        { key: 'price', label: `${admin ? 'Needs markup' : 'Needs store price'}${pending ? ` (${pending})` : ''}` },
        { key: 'done', label: 'Delivered / cancelled' }]} />
      {loading ? <Loading /> : !rows.length ? <Card><EmptyState>No orders here.</EmptyState></Card> : rows.map(o => (
        <div key={o.id} style={{ marginBottom: 14 }}>
          <OrderCard o={o} who={admin ? 'admin' : 'store'} canCancel={['STORE_APPROVER', 'ADMIN', 'SUPER_ADMIN'].includes(role)} onChanged={() => { void reload(); }} />
        </div>))}
    </>
  );
}
