// Minimal service worker: lets the app open offline after at least one
// successful visit. No hardcoded precache list -- this same file is served
// at two different real filenames (foodpick-ai.html and
// foodpick-ai-no-image.html) plus as index.html on Pages, so there's no
// single "the page" path to precache. Instead, runtime cache-then-network:
// every successful same-origin GET gets cached as it's fetched, and a
// failed fetch (offline) falls back to whatever was last cached for that
// exact URL.
const CACHE_NAME = 'foodpick-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Cross-origin (fonts, the maps embed, dish photos, the chat API) passes
  // straight through to the browser's own handling -- not this cache.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const fresh = await fetch(event.request);
        cache.put(event.request, fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        throw err;
      }
    })
  );
});
