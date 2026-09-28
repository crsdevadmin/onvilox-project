import { Badge } from '../../../ui';
import type { Check } from './api';

/** Safety-check results: blocks (cannot approve) first, then warnings. */
export function ChecksList({ checks }: { checks: Check[] }) {
  if (!checks.length) return <p className="gq-small" style={{ color: 'var(--green)' }}>All safety checks passed.</p>;
  const sorted = [...checks].sort((a, b) => (a.level === b.level ? 0 : a.level === 'BLOCK' ? -1 : 1));
  return (
    <ul style={{ listStyle: 'none', padding: 0 }}>
      {sorted.map((c, i) => (
        <li key={i} className="gq-row" style={{ gap: 6, padding: '3px 0', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <Badge tone={c.level === 'BLOCK' ? 'bad' : 'warn'}>{c.level === 'BLOCK' ? 'Blocks approval' : 'Review'}</Badge>
          <span className="gq-small"><strong>{c.code}</strong> {c.message}</span>
        </li>))}
    </ul>
  );
}
