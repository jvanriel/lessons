// Minimal service worker for PWA installability.
// Does not cache aggressively — the app is online-first.
// Version bump forces browsers to pick up updated push handling.

const CACHE_NAME = "golf-lessons-v2";

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
