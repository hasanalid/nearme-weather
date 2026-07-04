// ============================================================
// Minimal service worker for NearMe Weather.
//
// What this does:
// - Caches the app "shell" (the HTML/manifest/icons) on install,
//   so the app still opens even with a flaky connection.
// - Live data (weather, geocoding, landmarks) is NOT cached here —
//   those should always be fetched fresh so information stays current.
// This is intentionally simple; it's what makes browsers consider
// the page "installable" as a PWA.
// ============================================================

const CACHE_NAME = 'nearme-weather-v1';
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
  // Everything else (Nominatim, Open-Meteo, Wikipedia APIs) goes
  // straight to the network so data is always live.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
