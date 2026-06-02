const CACHE_NAME = 'gquence-v1';

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });

// Push notification received
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'Gquence';
  const options = {
    body: data.body || 'New update',
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    data: { url: data.url || '/store' },
    vibrate: [200, 100, 200],
    requireInteraction: true
  };
  e.waitUntil(self.registration.showNotification(title, options));
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
