// Phone / desktop notifications for the modular shell (same service worker and
// subscription endpoint as the Oncology pages). Permission must come from a
// click, so the top bar shows "Turn on alerts" until the user allows it.
import { api } from './api';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function toKey(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function subscribe() {
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { key } = await fetch('/api/push/vapid-public-key').then(r => r.json());
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) });
  }
  await api.post('/api/push/subscribe', { subscription: sub });
}

export const push = {
  state(): 'unsupported' | 'default' | 'granted' | 'denied' {
    return supported() ? Notification.permission : 'unsupported';
  },
  /** Re-register silently when permission was already given. */
  async refresh() { if (push.state() === 'granted') await subscribe().catch(() => {}); },
  /** Call from a click. */
  async enable() {
    if (!supported()) return false;
    if ((await Notification.requestPermission()) !== 'granted') return false;
    await subscribe();
    return true;
  },
};
