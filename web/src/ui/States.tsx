import type { ReactNode } from 'react';

export const Loading = ({ what = 'Loading' }: { what?: string }) => <div className="gq-empty">{what}…</div>;

export const EmptyState = ({ children }: { children: ReactNode }) => <div className="gq-empty">{children}</div>;

export function Banner({ tone, children, onClose }: { tone: 'ok' | 'bad' | 'info'; children: ReactNode; onClose?: () => void }) {
  return (
    <div className={`gq-banner tone-${tone} gq-row`} role={tone === 'bad' ? 'alert' : 'status'}>
      <span>{children}</span>
      <span className="gq-spacer" />
      {onClose && <button className="btn-secondary btn-sm" onClick={onClose}>Dismiss</button>}
    </div>
  );
}
