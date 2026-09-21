const CACHE_NAME = 'gquence-v2';

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  // Self-heal: delete every old cache left by previous service-worker versions so
  // stale HTML/JS (e.g. an old label layout) can never be served again. This SW does
  // NOT cache anything itself — pages always load fresh from the network.
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (err) { /* ignore */ }
    await clients.claim();
  })());
});

// No fetch handler on purpose: without one the browser goes straight to the
// network (nothing is cached by this worker). An empty handler only added
// overhead to every request ("no-op fetch handler" warning).

// Push notification received
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil((async () => {
    // If the app is already open and focused, let the page show its own
    // in-page alert with the custom sound instead of a duplicate OS notification.
    // Only the store and admin dashboards show in-page alerts; on any other
    // page the OS notification is still shown so nothing is silently dropped.
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const focused = wins.find(c => c.focused || c.visibilityState === 'visible');
    const inPage = focused && /\/(store|admin)(\.html)?(\?|#|$)/.test(new URL(focused.url).pathname + (new URL(focused.url).search || ''));
    if (inPage) {
      focused.postMessage({ type: 'push', data });
      return;
    }
    const title = data.title || 'Gquence';
    const options = {
      body: data.body || 'New update',
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      data: { url: data.url || '/store' },
      vibrate: [200, 100, 200],
      requireInteraction: true
    };
    return self.registration.showNotification(title, options);
  })());
});

// Notification click — open the relevant page
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data;
  const path = (data && data.url) ? data.url : '/store';
  const fullUrl = new URL(path, self.location.origin).href;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url === fullUrl && 'focus' in client) return client.focus();
      }
      return clients.openWindow(fullUrl);
    })
  );
});
