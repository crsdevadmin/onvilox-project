const CACHE_NAME = 'gquence-v2';

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });

// Push notification received
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil((async () => {
    // If the app is already open and focused, let the page show its own
    // in-page alert with the custom sound instead of a duplicate OS notification.
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const focused = wins.find(c => c.focused || c.visibilityState === 'visible');
    if (focused) {
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
