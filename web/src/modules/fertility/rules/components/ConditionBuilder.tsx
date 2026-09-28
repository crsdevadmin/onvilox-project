// Visual editor for a rule condition: ALL / ANY groups of
// "data field — comparison — value" rows, nestable. Admins edit clinical
// logic here without code changes.
import type { CondNode, Fact, Leaf } from '../types';

const OPS: Record<Fact['type'], { op: string; label: string }[]> = {
  number: [{ op: '<', label: 'is below' }, { op: '<=', label: 'is at most' }, { op: '>', label: 'is above' },
    { op: '>=', label: 'is at least' }, { op: '=', label: 'equals' }, { op: 'exists', label: 'is recorded' }, { op: 'missing', label: 'is not recorded' }],
  boolean: [{ op: 'is_true', label: 'is Yes' }, { op: 'is_false', label: 'is No' }, { op: 'missing', label: 'is not answered' }],
  choice: [{ op: '=', label: 'is' }, { op: 'in', label: 'is one of' }, { op: 'not_in', label: 'is none of' },
    { op: 'missing', label: 'is not recorded' }],
  text: [{ op: 'contains_any', label: 'mentions any of' }, { op: 'exists', label: 'is filled in' }, { op: 'missing', label: 'is empty' }],
};
const NO_VALUE = ['exists', 'missing', 'is_true', 'is_false'];
const isGroup = (n: CondNode): n is { all: CondNode[] } | { any: CondNode[] } => 'all' in n || 'any' in n;

function LeafRow({ n, facts, onChange }: { n: Leaf; facts: Fact[]; onChange: (n: Leaf) => void }) {
  const fact = facts.find(f => f.key === n.fact);
  const ops = fact ? OPS[fact.type] : [];
  const list = n.op === 'in' || n.op === 'not_in' || n.op === 'contains_any';
  const value = () => {
    if (!fact || NO_VALUE.includes(n.op)) return null;
    if (fact.type === 'choice' && list) {
      const cur = (n.value as string[]) || [];
      return (
        <span className="gq-row" style={{ gap: 6 }}>
          {fact.options?.map(o => (
            <label key={o.value} className="gq-small" style={{ display: 'inline-flex', gap: 4, textTransform: 'none', letterSpacing: 0 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={cur.includes(o.value)}
                onChange={e => onChange({ ...n, value: e.target.checked ? [...cur, o.value] : cur.filter(v => v !== o.value) })} />{o.label}
            </label>))}
        </span>);
    }
    if (fact.type === 'choice') {
      return <select className="gq-select" value={String(n.value ?? '')} onChange={e => onChange({ ...n, value: e.target.value })}>
        <option value="">Select…</option>{fact.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
    }
    if (list) {
      return <input className="gq-select" style={{ minWidth: 220 }} placeholder="words, separated by commas"
        value={((n.value as string[]) || []).join(', ')}
        onChange={e => onChange({ ...n, value: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />;
    }
    return <span className="gq-row" style={{ gap: 4 }}>
      <input className="gq-select" style={{ width: 100 }} type="number" step="any" value={String(n.value ?? '')}
        onChange={e => onChange({ ...n, value: e.target.value === '' ? '' : Number(e.target.value) })} />
      {fact.unit && <span className="gq-small gq-muted">{fact.unit}</span>}</span>;
  };
  return (
    <>
      <select className="gq-select" aria-label="Data field" value={n.fact} onChange={e => {
        const f = facts.find(x => x.key === e.target.value);
        onChange({ fact: e.target.value, op: f ? OPS[f.type][0].op : '' });
      }}>
        <option value="">Data field…</option>
        {facts.map(f => <option key={f.key} value={f.key}>{f.label}{f.sex !== 'B' ? (f.sex === 'F' ? ' (F)' : ' (M)') : ''}</option>)}
      </select>
      {fact && <select className="gq-select" aria-label="Comparison" value={n.op} onChange={e => {
        const op = e.target.value; onChange({ fact: n.fact, op, ...(NO_VALUE.includes(op) ? {} : { value: op === 'in' || op === 'not_in' || op === 'contains_any' ? [] : '' }) });
      }}>{ops.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}</select>}
      {value()}
    </>
  );
}

export function ConditionBuilder({ node, facts, onChange, onRemove, depth = 0 }: {
  node: CondNode; facts: Fact[]; onChange: (n: CondNode) => void; onRemove?: () => void; depth?: number;
}) {
  if (!isGroup(node)) {
    return (
      <div className="gq-row gq-cond-row">
        <LeafRow n={node} facts={facts} onChange={onChange} />
        {onRemove && <button type="button" className="btn-secondary btn-sm" onClick={onRemove} aria-label="Remove condition">✕</button>}
      </div>);
  }
  const mode = 'all' in node ? 'all' : 'any';
  const kids = 'all' in node ? node.all : node.any;
  const set = (k: CondNode[]) => onChange(mode === 'all' ? { all: k } : { any: k });
  return (
    <div className="gq-cond-group" style={{ marginLeft: depth ? 12 : 0 }}>
      <div className="gq-row" style={{ gap: 8, marginBottom: 6 }}>
        <select className="gq-select" aria-label="Group type" value={mode} onChange={e => onChange(e.target.value === 'all' ? { all: kids } : { any: kids })}>
          <option value="all">ALL of these are true</option><option value="any">ANY of these is true</option>
        </select>
        {kids.length === 0 && <span className="gq-small gq-muted">(empty group = always applies)</span>}
        <span className="gq-spacer" />
        {onRemove && <button type="button" className="btn-secondary btn-sm" onClick={onRemove}>Remove group</button>}
      </div>
      {kids.map((k, i) => (
        <ConditionBuilder key={i} node={k} facts={facts} depth={depth + 1}
          onChange={n => set(kids.map((x, j) => (j === i ? n : x)))} onRemove={() => set(kids.filter((_, j) => j !== i))} />
      ))}
      <div className="gq-row" style={{ gap: 6, marginTop: 6 }}>
        <button type="button" className="btn-secondary btn-sm" onClick={() => set([...kids, { fact: '', op: '' }])}>+ Condition</button>
        {depth < 2 && <button type="button" className="btn-secondary btn-sm" onClick={() => set([...kids, { any: [] }])}>+ Group</button>}
      </div>
    </div>
  );
}
