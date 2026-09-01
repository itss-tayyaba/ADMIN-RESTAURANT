// Ember & Brew Service Worker - Instant Cache & App Store Capabilities
const CACHE_NAME = 'ember-brew-v3.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/menu.html',
  '/customer.html',
  '/manifest.json',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/images/screenshot-desktop.png',
  '/images/screenshot-mobile.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200 && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('/index.html')))
  );
});

// Background Sync Capability
self.addEventListener('sync', event => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(Promise.resolve());
  }
});

// Periodic Background Sync Capability
self.addEventListener('periodicsync', event => {
  if (event.tag === 'update-menu') {
    event.waitUntil(Promise.resolve());
  }
});

// Push Notifications Capability
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : { title: 'Ember & Brew', body: 'Your order update is ready!' };
  const options = {
    body: data.body || 'Track your live order status now.',
    icon: '/images/icon-192.png',
    badge: '/images/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/?view=tracking' }
  };
  event.waitUntil(self.registration.showNotification(data.title || 'Ember & Brew', options));
});

// Notification Click Action
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
