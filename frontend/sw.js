// ============================================================
// Minimal service worker for Near Halal.
//
// What this does:
// - Caches the app "shell" (the HTML/manifest/icons) on install,
//   so the app still opens even with a flaky connection.
// - Live data (weather, geocoding, places, halal screening — all now
//   served by our own backend under /api/*, same-origin as the frontend)
//   is NOT cached here, so information stays current. /api/ requests are
//   explicitly excluded below rather than relying on them simply never
//   having been added to the cache, now that they share an origin with
//   the app shell.
// This is intentionally simple; it's what makes browsers consider
// the page "installable" as a PWA.
// ============================================================

const CACHE_NAME = 'nearme-weather-v12';
const APP_SHELL = [
  'index.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only apply cache-first behavior to same-origin app-shell files.
  // Everything under /api/ (our backend's weather/geocode/places/
  // restaurants/halal endpoints) goes straight to the network so data
  // is always live.
  if (url.origin === self.location.origin && !url.pathname.startsWith('/api/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
