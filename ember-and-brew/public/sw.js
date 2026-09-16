// Ember & Brew Official Service Worker — Fast App Shell & Real-time Live API Data
const CACHE_NAME = 'ember-brew-v8.1';

const STATIC_APP_SHELL = [
  '/',
  '/index.html',
  '/menu.html',
  '/customer.html',
  '/manifest.json',
  '/pwa-engine.js',
  '/images/app-logo.png',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/images/apple-touch-icon.png',
  '/images/screenshot-desktop.png',
  '/images/screenshot-mobile.png'
];

// Install Event: Pre-cache core static app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_APP_SHELL).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Activate Event: Clear outdated caches and claim clients immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch Strategy:
// 1. All API routes (/api/*), Socket.io, and Non-GET requests -> NETWORK ONLY (Never Stale Database Data)
// 2. HTML navigation requests -> NETWORK FIRST with offline App Shell fallback
// 3. Static assets (images, fonts, stylesheets, scripts) -> STALE-WHILE-REVALIDATE / CACHE FIRST
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Never intercept or cache dynamic API data, live orders, or non-GET requests
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/socket.io/') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/kitchen') ||
    url.pathname.startsWith('/delivery') ||
    url.pathname.startsWith('/superadmin')
  ) {
    return; // Handled directly by live network
  }

  // 2. HTML navigation requests: Network First, falling back to cache
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          return caches.match('/index.html');
        })
    );
    return;
  }

  // 3. Static assets (images, fonts, css, js): Cache First with Background Revalidation
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      const fetchPromise = fetch(request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// Push Notifications
self.addEventListener('push', event => {
  let payload = { title: 'Ember & Brew', body: 'Your order update is ready!', url: '/?view=tracking' };
  try {
    if (event.data) payload = event.data.json();
  } catch (_) {}

  const options = {
    body: payload.body || 'Track your order in real-time.',
    icon: '/images/icon-192.png',
    badge: '/images/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: payload.url || '/?view=tracking' }
  };
  event.waitUntil(self.registration.showNotification(payload.title || 'Ember & Brew', options));
});

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
