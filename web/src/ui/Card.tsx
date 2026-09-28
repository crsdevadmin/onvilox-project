import type { ReactNode } from 'react';

export function Card({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="card">
      {(title || actions) && (
        <div className="gq-row" style={{ marginBottom: 14 }}>
          {title && <h2 style={{ margin: 0 }}>{title}</h2>}
          <span className="gq-spacer" />
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
