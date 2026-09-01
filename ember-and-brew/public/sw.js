// Ember & Brew Service Worker - Instant Cache & Offline Resilience
const CACHE_NAME = 'ember-brew-v2.1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/menu.html',
  '/customer.html',
  '/manifest.json',
  '/images/expresso.jpeg',
  '/images/Cappuccino.jpeg',
  '/images/cold brew.jpeg'
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

  // Do not cache API mutations or real-time tracking endpoints
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-first strategy with cache fallback
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
