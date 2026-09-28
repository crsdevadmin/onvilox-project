import { useEffect, useState } from 'react';
import { push } from '../core/push';

/** "Turn on alerts" until the browser allows notifications; then nothing. */
export function PushButton() {
  const [state, setState] = useState(push.state());
  useEffect(() => { void push.refresh(); }, []);
  if (state !== 'default') return null;
  return (
    <button className="btn-secondary btn-sm" title="Get phone/desktop alerts for red flags"
      onClick={async () => { await push.enable().catch(() => false); setState(push.state()); }}>🔔 Turn on alerts</button>
  );
}
