// Minimal service worker for PWA installability.
// Does not cache aggressively — the app is online-first.

const CACHE_NAME = "golf-lessons-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Online-first: only serve from network
  // No caching strategy — we want fresh data for a booking platform
});
