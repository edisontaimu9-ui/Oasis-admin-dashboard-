importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js');

const CACHE = 'nutritrack-admin-pwa-v1';
const offlineFallbackPage = './';

/* Core assets to pre-cache on install — orientation_manager included */
const PRECACHE_ASSETS = [
  './',
  './js/orientation_manager.js',
  './assets/css/styles.css',
  './js/app.js',
];

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', async (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
});

if (workbox.navigationPreload.isSupported()) workbox.navigationPreload.enable();

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preloadResp = await event.preloadResponse;
        if (preloadResp) return preloadResp;
        return await fetch(event.request);
      } catch (error) {
        const cache = await caches.open(CACHE);
        return await cache.match(offlineFallbackPage);
      }
    })());
  }
});
