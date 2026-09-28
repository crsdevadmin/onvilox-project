// Weekly formula for each partner. The clinician builds it from the ingredient
// master; every save runs the safety checks; only the treating doctor approves,
// which creates the store order. The engine never builds a formula itself.
import { useState } from 'react';
import { useAccess } from '../../../core/AccessContext';
import { useAsync } from '../../../core/useAsync';
import { Banner, Card, EmptyState, Loading, Tabs } from '../../../ui';
import { CAN_EDIT, CAN_MANAGE, sexLabel } from '../helpers';
import { ingredientsApi } from '../ingredients/api';
import type { CaseDetail, Sex } from '../types';
import { formulaApi, type Formula } from './api';
import { ordersApi } from '../orders/api';
import { isAdmin } from '../../../core/types';
import { FormulaCard } from './FormulaCard';
import { FormulaEditor } from './FormulaEditor';

export function FormulaTab({ c }: { c: CaseDetail }) {
  const role = useAccess().roleIn('fertility') || '';
  const [sex, setSex] = useState<Sex>(c.partners[0]?.sex || 'F');
  const [editing, setEditing] = useState<Formula | 'new' | null>(null);
  const { data: all, loading, error, reload } = useAsync(() => formulaApi.list(c.id), [c.id]);
  const { data: ingredients } = useAsync(ingredientsApi.list, []);
  const { data: orders, reload: reloadOrders } = useAsync(() => ordersApi.forCase(c.id), [c.id]);
  const p = c.partners.find(x => x.sex === sex);
  if (loading || !ingredients) return <Loading />;
  if (error) return <Banner tone="bad">{error}</Banner>;
  if (!p) return <Card><p className="gq-muted">Add a partner first.</p></Card>;
  const mine = (all || []).filter(f => f.partner_id === p.id);
  const canEdit = CAN_EDIT.includes(role);
  const usable = ingredients.filter(i => i.usable).length;

  return (
    <>
      {c.partners.length > 1 && <Tabs<Sex> value={sex} onChange={s => { setSex(s); setEditing(null); }}
        tabs={c.partners.map(x => ({ key: x.sex, label: `${sexLabel(x.sex)} · ${x.name}` }))} />}
      {usable === 0 && <Banner tone="info">No ingredient is usable yet — an admin must complete and activate ingredients (Admin → Ingredients).</Banner>}
      <Card title={`Weekly formula · ${p.name}`}
        actions={canEdit && !editing && <button className="btn-primary btn-sm" onClick={() => setEditing('new')}>+ New formula</button>}>
        {editing ? (
          <FormulaEditor key={editing === 'new' ? 'new' : editing.id} caseId={c.id} partnerId={p.id} ingredients={ingredients}
            draft={editing === 'new' ? undefined : editing} onDone={() => { setEditing(null); void reload(); }} />
        ) : mine.length ? mine.map(f => (
          <FormulaCard key={f.id} f={f} canApprove={CAN_MANAGE.includes(role)} canEdit={canEdit}
            order={(orders || []).find(o => o.formula_id === f.id && o.status !== 'CANCELLED')}
            priceRole={isAdmin(role) ? 'admin' : role === 'DOCTOR' ? 'doctor' : null}
            onEdit={() => setEditing(f)} onChanged={() => { void reload(); void reloadOrders(); }} />
        )) : <EmptyState>No formula yet for {p.name}.</EmptyState>}
      </Card>
    </>
  );
}
