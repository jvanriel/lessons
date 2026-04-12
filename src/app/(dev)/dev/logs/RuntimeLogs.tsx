"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import {
  listDeployments,
  getDeploymentLogs,
  type DeploymentSummary,
  type VercelLogEntry,
} from "./vercel-actions";

const TYPE_COLORS: Record<string, string> = {
  stdout: "text-green-700 bg-green-50 border-green-200",
  stderr: "text-red-700 bg-red-50 border-red-200",
  fatal: "text-red-700 bg-red-50 border-red-200",
  "edge-function-invocation": "text-gold-700 bg-gold-50 border-gold-200",
  "middleware-invocation": "text-gold-700 bg-gold-50 border-gold-200",
  metric: "text-green-600 bg-green-50 border-green-200",
  report: "text-green-600 bg-green-50 border-green-200",
};

function formatDate(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const diff = Date.now() - ms;
  if (diff < 60 * 1000) return "just now";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleString();
}

export default function RuntimeLogs() {
  const [deployments, setDeployments] = useState<DeploymentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<VercelLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();

  // Load deployments on mount
  useEffect(() => {
    (async () => {
      try {
        const list = await listDeployments(10);
        setDeployments(list);
        // Default to newest production, else newest
        const prod = list.find((d) => d.target === "production");
        setSelectedId((prod ?? list[0])?.uid ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const loadLogs = useCallback(() => {
    if (!selectedId) return;
    startTransition(async () => {
      try {
        const entries = await getDeploymentLogs(selectedId, { limit: 200 });
        setLogs(entries);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }, [selectedId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(loadLogs, 10000);
    return () => clearInterval(id);
  }, [autoRefresh, loadLogs]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h3 className="font-medium text-red-900">Couldn&apos;t load Vercel logs</h3>
        <p className="mt-2 text-xs text-red-700 break-all">{error}</p>
        <p className="mt-3 text-xs text-red-600">
          Make sure <code>VERCEL_API_TOKEN</code> is set. Create a token at{" "}
          <a
            href="https://vercel.com/account/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            vercel.com/account/tokens
          </a>
          , then add it via <code>vercel env add VERCEL_API_TOKEN</code>.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Deployment selector + controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
          className="flex-1 min-w-[260px] rounded-md border border-green-200 bg-white px-2 py-1.5 text-xs text-green-900"
        >
          {deployments.length === 0 && <option value="">Loading…</option>}
          {deployments.map((d) => {
            const marker = d.target === "production" ? "● prod" : "○ preview";
            const age = formatDate(d.createdAt);
            const label = `${marker} · ${d.url} · ${age}${d.state === "READY" ? "" : ` · ${d.state}`}`;
            return (
              <option key={d.uid} value={d.uid}>
                {label}
              </option>
            );
          })}
        </select>

        <button
          onClick={loadLogs}
          disabled={isPending || !selectedId}
          className="rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50"
        >
          {isPending ? "..." : "Refresh"}
        </button>

        <label className="flex items-center gap-1.5 text-xs text-green-700">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto (10s)
        </label>
      </div>

      {/* Log list */}
      <div className="rounded-xl border border-green-200 bg-white">
        {logs.length === 0 && !isPending ? (
          <div className="p-8 text-center text-sm text-green-400">
            No runtime logs yet for this deployment
          </div>
        ) : (
          <ul className="divide-y divide-green-50">
            {logs.map((entry) => {
              const typeClass =
                TYPE_COLORS[entry.type] ?? "text-green-700 bg-green-50 border-green-200";
              const isErrorLevel =
                entry.level === "error" || entry.type === "stderr" || entry.type === "fatal";
              const isExpanded = !!expanded[entry.id];
              return (
                <li
                  key={entry.id}
                  className={isErrorLevel ? "bg-red-50/30" : "hover:bg-green-50/30"}
                >
                  <button
                    onClick={() =>
                      setExpanded({ ...expanded, [entry.id]: !isExpanded })
                    }
                    className="flex w-full items-start gap-3 px-4 py-2 text-left"
                  >
                    <span
                      className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase ${typeClass}`}
                    >
                      {entry.type.replace(/-/g, " ")}
                    </span>
                    {entry.proxy?.statusCode && (
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                          entry.proxy.statusCode >= 500
                            ? "bg-red-50 text-red-700"
                            : entry.proxy.statusCode >= 400
                              ? "bg-amber-50 text-amber-700"
                              : "bg-green-50 text-green-700"
                        }`}
                      >
                        {entry.proxy.method} {entry.proxy.statusCode}
                      </span>
                    )}
                    {entry.proxy?.path && (
                      <span className="shrink-0 font-mono text-xs text-green-700">
                        {entry.proxy.path}
                      </span>
                    )}
                    {entry.text && (
                      <span className="flex-1 truncate font-mono text-xs text-green-900">
                        {entry.text}
                      </span>
                    )}
                    {!entry.text && !entry.proxy?.path && (
                      <span className="flex-1" />
                    )}
                    <span className="shrink-0 text-xs text-green-400">
                      {formatDate(entry.created)}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="bg-green-50/50 px-4 py-3">
                      <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-green-900">
                        {entry.text ??
                          JSON.stringify(
                            {
                              type: entry.type,
                              level: entry.level,
                              proxy: entry.proxy,
                              created: new Date(entry.created).toISOString(),
                            },
                            null,
                            2
                          )}
                      </pre>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-3 text-xs text-green-400">
        {logs.length} entries · newest first · deployment logs are kept for a
        limited time by Vercel
      </p>
    </div>
  );
}
