const CACHE_NAME = 'ukeire-pwa-v3';

const LOCAL_ASSETS = [
  './',
  './index.html',
  './admin.html',
  './css/style.css',
  './js/shared.js',
  './js/dashboard.js',
  './js/admin-panel.js',
  './assets/icon.svg',
  './manifest.json',
];

// Install: cache tất cả local asset
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(LOCAL_ASSETS))
  );
  self.skipWaiting();
});

// Activate: xóa cache cũ
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: pass-through only (caching disabled temporarily)
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request));
});
