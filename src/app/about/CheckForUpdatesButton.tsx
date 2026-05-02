"use client";

import { useCallback, useState, useTransition } from "react";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current" }
  | { kind: "update"; serverBuildId: string }
  | { kind: "error" };

interface Props {
  locale: Locale;
  /** The build ID baked into the running JS bundle. */
  runningBuildId: string;
}

/**
 * Manual "check for updates" button on the About page. Mirrors the
 * background check the `DeploymentChecker` component runs every 60s,
 * but exposes it as an explicit user action so people can verify
 * they're on the latest build (and force a reload from there).
 */
export function CheckForUpdatesButton({ locale, runningBuildId }: Props) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  const check = useCallback(() => {
    startTransition(async () => {
      setStatus({ kind: "checking" });
      try {
        // Cache-bust on top of `cache: "no-store"` — same approach as
        // the background poller, in case mobile Safari ignores the
        // request hint after a process resume.
        const res = await fetch(`/api/version?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setStatus({ kind: "error" });
          return;
        }
        const data: { buildId?: string } = await res.json();
        const serverBuildId = data.buildId ?? "";
        if (!serverBuildId) {
          setStatus({ kind: "error" });
          return;
        }
        if (serverBuildId === runningBuildId) {
          setStatus({ kind: "current" });
        } else {
          setStatus({ kind: "update", serverBuildId });
        }
      } catch {
        setStatus({ kind: "error" });
      }
    });
  }, [runningBuildId]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={check}
        disabled={pending}
        className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-800 disabled:opacity-50"
      >
        {pending
          ? t("about.checking", locale)
          : t("about.checkForUpdates", locale)}
      </button>

      {status.kind === "current" && (
        <span className="text-sm text-green-700">
          ✓ {t("about.upToDate", locale)}
        </span>
      )}
      {status.kind === "update" && (
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-amber-700">
            {t("about.updateAvailable", locale)}
          </span>
          <span className="font-mono text-xs text-green-500">
            {status.serverBuildId}
          </span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-gold-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-gold-500"
          >
            {t("about.reload", locale)}
          </button>
        </span>
      )}
      {status.kind === "error" && (
        <span className="text-sm text-red-600">
          {t("about.checkFailed", locale)}
        </span>
      )}
    </div>
  );
}
