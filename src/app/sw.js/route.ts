/**
 * Dynamic service-worker route.
 *
 * Replaces the previous static `public/sw.js`. Two reasons:
 *
 *   1. The static file was byte-identical between deploys, so when the
 *      browser re-fetched `/sw.js` after a deploy it concluded the SW
 *      was unchanged and never fired `updatefound`. The
 *      `DeploymentChecker` component's secondary update trigger
 *      (`reg.addEventListener("updatefound", ...)`) was therefore
 *      dead. Baking the build ID into a comment makes the file
 *      byte-different on every deploy → updatefound fires reliably.
 *
 *   2. Embedding the build ID in `CACHE_NAME` means the `activate`
 *      handler's "delete every cache name that isn't the current one"
 *      logic actually does something — pre-fix, the cache name never
 *      changed, so nothing was ever stale to delete.
 *
 * The body of the worker is the same as the old `public/sw.js` — only
 * `CACHE_NAME` and the leading comment now vary per deploy. Headers
 * declared on `/sw.js` in next.config.ts (`Service-Worker-Allowed: /`,
 * `Cache-Control: max-age=0, must-revalidate`) still apply because
 * that route config is matched by URL.
 */

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

const SOURCE = `// build: ${BUILD_ID}
// Minimal service worker for PWA installability.
// Does not cache aggressively — the app is online-first.
// CACHE_NAME varies per deploy so the activate-time cleanup
// actually purges stale per-build caches.

const CACHE_NAME = "golf-lessons-${BUILD_ID}";

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

// ─── Push notifications ─────────────────────────────────

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data?.text() || "Golf Lessons" };
  }

  const title = data.title || "Golf Lessons";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag,
    data: { url: data.url || "/" },
    requireInteraction: true,
    vibrate: [200, 100, 200],
    renotify: true,
  };

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // A client is "active" if it's visible AND focused. We forward
        // the push to active clients so the in-app toast can render it.
        // We ALSO show the system notification in all cases — the bell
        // icon keeps history and a system notification ensures the user
        // doesn't miss anything if they're scrolling another part of
        // the app. The tag collapses duplicates.
        const activeClient = clients.find(
          (c) => c.visibilityState === "visible" && c.focused
        );
        if (activeClient) {
          activeClient.postMessage({
            type: "push",
            title,
            body: options.body,
            url: options.data.url,
            tag: options.tag,
          });
        }
        return self.registration.showNotification(title, options);
      })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing tab if one is open
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Otherwise open a new one
        return self.clients.openWindow(url);
      })
  );
});
`;

export const dynamic = "force-static";

export function GET(): Response {
  return new Response(SOURCE, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Mirror the headers we used to declare in next.config.ts for
      // the static /sw.js path so PWA scope + revalidation stay
      // identical post-migration.
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
