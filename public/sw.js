/* NIVRA service worker — receives push messages and shows notifications,
   even when no tab is open. Kept dependency-free and tiny. */

const OFFLINE_CACHE = 'nivra-offline-v1';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.addAll(['/offline.html', '/brand/favicon.svg'])));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
// Cache only an explicit offline page. Never serve cached financial API responses.
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'NIVRA', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'NIVRA alert';
  const options = {
    body: data.body || '',
    icon: '/icon.png',
    badge: '/brand/notification-badge.png',
    tag: data.symbol || 'stockscope',
    data: { url: data.url || '/' },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an existing tab if one is open, else open a new one.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
