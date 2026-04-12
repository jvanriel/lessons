"use client";

import { useState, useEffect, useCallback, useTransition } from "react";

interface HealthCheck {
  ok: boolean;
  ms?: number;
  error?: string;
  note?: string;
}

interface HealthResult {
  status: "ok" | "degraded";
  deploy: string | null;
  env: string;
  timestamp: string;
  checks: Record<string, HealthCheck>;
}

const CHECK_LABELS: Record<string, string> = {
  db: "Database (Neon Postgres)",
  env: "Critical environment vars",
  sentry: "Sentry configuration",
  stripe: "Stripe API",
  blob: "Vercel Blob storage",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString();
}

export default function HealthBrowser() {
  const [result, setResult] = useState<HealthResult | null>(null);
  const [deep, setDeep] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/health${deep ? "?deep=1" : ""}`);
        const data = await res.json();
        setResult(data);
        setLastFetchedAt(new Date().toLocaleTimeString());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }, [deep]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const statusColor =
    result?.status === "ok"
      ? "text-green-700 bg-green-50 border-green-300"
      : result
        ? "text-red-700 bg-red-50 border-red-300"
        : "text-green-500 bg-green-50 border-green-200";

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={load}
          disabled={isPending}
          className="flex h-8 items-center justify-center rounded-md border border-green-300 bg-white px-3 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50"
        >
          <svg
            className={`mr-1.5 h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
          Refresh
        </button>

        <label className="flex items-center gap-1.5 text-xs text-green-700">
          <input
            type="checkbox"
            checked={deep}
            onChange={(e) => setDeep(e.target.checked)}
          />
          Deep (Stripe + Blob)
        </label>

        <label className="flex items-center gap-1.5 text-xs text-green-700">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto (10s)
        </label>

        <span className="flex-1" />

        {lastFetchedAt && (
          <span className="text-xs text-green-400">
            Last fetched {lastFetchedAt}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Request failed: {error}
        </div>
      )}

      {result && (
        <>
          {/* Overall status */}
          <div className={`rounded-xl border p-5 ${statusColor}`}>
            <div className="flex items-center gap-3">
              <StatusIcon ok={result.status === "ok"} />
              <div>
                <div className="text-xs uppercase tracking-wider opacity-70">
                  Overall
                </div>
                <div className="font-display text-2xl font-semibold">
                  {result.status === "ok" ? "Healthy" : "Degraded"}
                </div>
              </div>
              <div className="ml-auto text-right text-xs">
                <div>
                  <span className="opacity-60">env:</span> {result.env}
                </div>
                <div>
                  <span className="opacity-60">deploy:</span>{" "}
                  <code>{result.deploy ?? "—"}</code>
                </div>
                <div>
                  <span className="opacity-60">at:</span>{" "}
                  {formatTime(result.timestamp)}
                </div>
              </div>
            </div>
          </div>

          {/* Per-check list */}
          <div className="mt-4 rounded-xl border border-green-200 bg-white">
            <ul className="divide-y divide-green-50">
              {Object.entries(result.checks).map(([key, check]) => (
                <CheckRow key={key} name={key} check={check} />
              ))}
            </ul>
          </div>
        </>
      )}

      {/* Reference info */}
      <div className="mt-6 rounded-xl border border-green-100 bg-green-50/40 p-4 text-xs text-green-700">
        <p className="mb-2 font-medium text-green-900">
          External monitoring
        </p>
        <p>
          Point your Uptime Kuma instance at <code>/api/health</code> (HTTP
          keyword check, expect the string <code>&quot;status&quot;:&quot;ok&quot;</code>).
          Defaults to light checks (DB + env + sentry). Append{" "}
          <code>?deep=1</code> for deep checks (adds Stripe + Blob) — use
          sparingly, say every 10 minutes.
        </p>
      </div>
    </div>
  );
}

function StatusIcon({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <svg
        className="h-10 w-10 shrink-0 text-green-700"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
    );
  }
  return (
    <svg
      className="h-10 w-10 shrink-0 text-red-600"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
      />
    </svg>
  );
}

function CheckRow({ name, check }: { name: string; check: HealthCheck }) {
  const label = CHECK_LABELS[name] ?? name;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="mt-0.5 shrink-0">
        {check.ok ? (
          <svg
            className="h-5 w-5 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m4.5 12.75 6 6 9-13.5"
            />
          </svg>
        ) : (
          <svg
            className="h-5 w-5 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-green-950">{label}</span>
          <span className="font-mono text-[10px] text-green-400">{name}</span>
        </div>
        {check.note && (
          <p className="mt-0.5 text-xs text-green-500">{check.note}</p>
        )}
        {check.error && (
          <p className="mt-0.5 break-all font-mono text-xs text-red-600">
            {check.error}
          </p>
        )}
      </div>
      {typeof check.ms === "number" && (
        <span className="shrink-0 rounded-md bg-green-50 px-2 py-0.5 text-[11px] text-green-700">
          {check.ms} ms
        </span>
      )}
    </li>
  );
}
