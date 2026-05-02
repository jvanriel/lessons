"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "unknown";
const POLL_INTERVAL = 60_000;
const RELOAD_PARAM = "_v";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (
    "standalone" in navigator &&
    (navigator as unknown as { standalone: boolean }).standalone
  ) {
    return true;
  }
  return window.matchMedia("(display-mode: standalone)").matches;
}

export default function DeploymentChecker() {
  const [newVersion, setNewVersion] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [reloading, setReloading] = useState(false);
  // Latest server-reported build id, captured during `check()`. Used as
  // the cache-bust marker when the user clicks Update so the reloaded
  // page is guaranteed to fetch a fresh HTML response (and therefore a
  // new JS bundle with a new BUILD_ID) instead of being served the
  // pre-deploy HTML out of the browser/edge cache.
  const newBuildIdRef = useRef<string | null>(null);

  const check = useCallback(async () => {
    try {
      // Cache-bust the URL on top of `cache: "no-store"`. Mobile
      // Safari (and therefore every iOS PWA) sometimes ignores the
      // `no-store` request hint after a process resume — the unique
      // query string forces a real network round-trip every time.
      const res = await fetch(`/api/version?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.buildId && data.buildId !== BUILD_ID) {
        newBuildIdRef.current = String(data.buildId);
        setNewVersion(true);
      }
    } catch {
      // Offline / network blip — try again on the next tick.
    }
  }, []);

  useEffect(() => {
    setStandalone(isStandalone());

    // After a successful update-and-reload, the URL still carries the
    // `?_v=<buildId>` cache-bust marker. Strip it so it doesn't pollute
    // the address bar / shared links. Only do this when the marker
    // matches the now-running BUILD_ID — otherwise we'd swallow the
    // signal we still need to fire the toast.
    try {
      const url = new URL(window.location.href);
      const stamped = url.searchParams.get(RELOAD_PARAM);
      if (stamped && stamped === BUILD_ID) {
        url.searchParams.delete(RELOAD_PARAM);
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      // Old browsers without URL — non-fatal.
    }

    // 1. Immediate build-id check on launch, so an installed PWA that
    //    reopens after a deploy flags the update right away — not a
    //    minute later like the old polling-only behaviour.
    check();

    // 2. Ask the service worker to re-fetch sw.js right now. Registered
    //    SWs otherwise only re-check on navigation, so a PWA launched
    //    once can keep serving stale assets for a long time.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => {
          try {
            reg.update();
          } catch {
            // Some browsers throw if the SW isn't controllable yet.
          }
          // A newly-found worker means a new build is ready; flag it
          // alongside the build-id ping. We don't have the new
          // buildId here — the periodic check() will fill in
          // `newBuildIdRef` when it next runs.
          reg.addEventListener?.("updatefound", () => setNewVersion(true));
        })
        .catch(() => {});
    }

    // 3. Re-check when the tab comes back to the foreground (common
    //    for PWAs — user switches apps and returns).
    function handleVisibility() {
      if (document.visibilityState === "visible") check();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    const interval = setInterval(check, POLL_INTERVAL);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [check]);

  /**
   * Reload the page with a cache-bust marker. Plain
   * `window.location.reload()` lets the browser (and Vercel's edge)
   * serve cached HTML, so the new page can come up still running the
   * old BUILD_ID — which means `check()` fires immediately and the
   * toast re-appears. Adding `?_v=<newBuildId>` forces a fresh fetch
   * for that URL, so the next mount sees the post-deploy HTML+JS and
   * the version match silences the toast on the very first reload.
   */
  function handleUpdate() {
    if (reloading) return;
    setReloading(true);
    try {
      const stamp =
        newBuildIdRef.current ??
        // Fallback when updatefound fired without a /api/version round-trip.
        String(Date.now());
      const url = new URL(window.location.href);
      url.searchParams.set(RELOAD_PARAM, stamp);
      window.location.replace(url.toString());
    } catch {
      // URL constructor unavailable — fall back to plain reload.
      window.location.reload();
    }
  }

  if (!newVersion) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2 px-4">
      <div className="flex flex-col items-center gap-2 rounded-lg border border-gold-300/50 bg-green-950 px-5 py-3 text-center shadow-xl sm:flex-row sm:text-left">
        <span className="flex-1 text-sm text-green-100/80">
          {standalone
            ? "A newer version of the app is available."
            : "A new version is available"}
        </span>
        <button
          onClick={handleUpdate}
          disabled={reloading}
          className="shrink-0 rounded bg-gold-500 px-3 py-1 text-xs font-medium text-green-950 transition-colors hover:bg-gold-400 disabled:opacity-60"
        >
          {reloading
            ? "Updating…"
            : standalone
              ? "Update"
              : "Refresh"}
        </button>
      </div>
    </div>
  );
}
