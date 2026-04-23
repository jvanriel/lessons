"use client";

import { useCallback, useEffect, useState } from "react";

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "unknown";
const POLL_INTERVAL = 60_000;

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

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.buildId && data.buildId !== BUILD_ID) {
        setNewVersion(true);
      }
    } catch {
      // Offline / network blip — try again on the next tick.
    }
  }, []);

  useEffect(() => {
    setStandalone(isStandalone());

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
          // alongside the build-id ping.
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
          onClick={() => window.location.reload()}
          className="shrink-0 rounded bg-gold-500 px-3 py-1 text-xs font-medium text-green-950 transition-colors hover:bg-gold-400"
        >
          {standalone ? "Update" : "Refresh"}
        </button>
      </div>
    </div>
  );
}
