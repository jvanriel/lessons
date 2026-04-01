"use client";

import { useEffect, useState } from "react";

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "unknown";
const POLL_INTERVAL = 60_000;

export default function DeploymentChecker() {
  const [newVersion, setNewVersion] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.buildId && data.buildId !== BUILD_ID) {
          setNewVersion(true);
        }
      } catch {}
    }

    const interval = setInterval(check, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  if (!newVersion) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-lg border border-gold-300/50 bg-green-950 px-5 py-3 shadow-xl">
        <span className="text-sm text-green-100/80">
          A new version is available
        </span>
        <button
          onClick={() => window.location.reload()}
          className="rounded bg-gold-500 px-3 py-1 text-xs font-medium text-green-950 transition-colors hover:bg-gold-400"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
