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
        // If a tab is open and visible, forward the data so the in-app
        // toast can render it — skip the system notification to avoid
        // duplicate alerts.
        const focusedClient = clients.find(
          (c) => c.visibilityState === "visible"
        );
        if (focusedClient) {
          focusedClient.postMessage({
            type: "push",
            title,
            body: options.body,
            url: options.data.url,
            tag: options.tag,
          });
          return;
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
