"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import {
  listIssues,
  getLatestEvent,
  resolveIssue,
  type SentryIssue,
  type SentryEventDetail,
  type SentryException,
  type SentryBreadcrumb,
} from "./actions";

const LEVEL_COLORS: Record<string, string> = {
  fatal: "text-red-800 bg-red-50 border-red-300",
  error: "text-red-700 bg-red-50 border-red-200",
  warning: "text-amber-700 bg-amber-50 border-amber-200",
  info: "text-green-700 bg-green-50 border-green-200",
  debug: "text-green-500 bg-green-50 border-green-100",
};

const STATS_PERIODS = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 days" },
  { value: "14d", label: "14 days" },
  { value: "30d", label: "30 days" },
] as const;

const QUERY_OPTIONS = [
  { value: "is:unresolved", label: "Unresolved" },
  { value: "is:resolved", label: "Resolved" },
  { value: "", label: "All" },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60 * 1000) return "just now";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString() + " " + d.toLocaleTimeString();
}

export default function SentryBrowser() {
  const [issues, setIssues] = useState<SentryIssue[]>([]);
  const [statsPeriod, setStatsPeriod] =
    useState<"24h" | "7d" | "14d" | "30d">("24h");
  const [query, setQuery] = useState("is:unresolved");
  const [selected, setSelected] = useState<SentryIssue | null>(null);
  const [selectedEvent, setSelectedEvent] =
    useState<SentryEventDetail | null>(null);
  const [eventLoading, setEventLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const list = await listIssues({
          statsPeriod,
          query,
          limit: 50,
        });
        setIssues(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }, [statsPeriod, query]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSelect(issue: SentryIssue) {
    setSelected(issue);
    setSelectedEvent(null);
    setEventLoading(true);
    try {
      const ev = await getLatestEvent(issue.id);
      setSelectedEvent(ev);
    } catch (e) {
      setStatus({
        type: "error",
        message: `Failed to load event: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setEventLoading(false);
    }
  }

  async function handleThrowTest() {
    setStatus(null);
    try {
      const res = await fetch("/api/dev/throw");
      if (res.ok) {
        // Should have thrown; if we got 200 something's off
        setStatus({
          type: "error",
          message: "Test endpoint returned 200 — expected a 500 error",
        });
      } else {
        setStatus({
          type: "success",
          message: `Test error thrown (HTTP ${res.status}). Refresh in a few seconds to see it in Sentry.`,
        });
        // Refresh after a short delay to pick up the new issue
        setTimeout(load, 3000);
      }
    } catch (e) {
      // Even network failures here count as "error emitted"
      setStatus({
        type: "success",
        message: `Test error triggered: ${e instanceof Error ? e.message : String(e)}. Refresh in a few seconds.`,
      });
      setTimeout(load, 3000);
    }
  }

  async function handleResolve(issueId: string) {
    setStatus(null);
    try {
      await resolveIssue(issueId);
      setStatus({ type: "success", message: "Issue resolved." });
      setSelected(null);
      load();
    } catch (e) {
      setStatus({
        type: "error",
        message: `Resolve failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h3 className="font-medium text-red-900">
          Couldn&apos;t load Sentry issues
        </h3>
        <p className="mt-2 text-xs text-red-700 break-all">{error}</p>
        <p className="mt-3 text-xs text-red-600">
          The Marketplace-provisioned <code>SENTRY_AUTH_TOKEN</code> only has
          project write scopes for source map uploads. You need a separate
          token with <code>event:read</code> (and <code>event:admin</code>{" "}
          for resolve).
        </p>
        <p className="mt-2 text-xs text-red-600">
          Create one at{" "}
          <a
            href="https://sentry.io/settings/auth-tokens/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            sentry.io/settings/auth-tokens
          </a>{" "}
          → New token → scopes: <code>event:read</code>,{" "}
          <code>event:admin</code>, <code>project:read</code>. Save as{" "}
          <code>SENTRY_READ_TOKEN</code>.
        </p>
      </div>
    );
  }

  const totalEvents = issues.reduce((sum, i) => sum + Number(i.count || "0"), 0);
  const totalUsers = issues.reduce((sum, i) => sum + (i.userCount || 0), 0);
  const fatalCount = issues.filter(
    (i) => i.level === "error" || i.level === "fatal"
  ).length;

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={statsPeriod}
          onChange={(e) =>
            setStatsPeriod(e.target.value as typeof statsPeriod)
          }
          className="rounded-md border border-green-200 bg-white px-2 py-1.5 text-xs text-green-900"
        >
          {STATS_PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              Last {p.label}
            </option>
          ))}
        </select>
        <select
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="rounded-md border border-green-200 bg-white px-2 py-1.5 text-xs text-green-900"
        >
          {QUERY_OPTIONS.map((q) => (
            <option key={q.value} value={q.value}>
              {q.label}
            </option>
          ))}
        </select>
        <button
          onClick={load}
          disabled={isPending}
          title="Refresh"
          aria-label="Refresh"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-green-300 bg-white text-green-700 hover:bg-green-50 disabled:opacity-50"
        >
          <svg
            className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`}
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
        </button>

        <button
          onClick={handleThrowTest}
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
          title="Hits /api/dev/throw to generate a test error"
        >
          Throw test error
        </button>

        <span className="flex-1" />
        <a
          href={`https://${process.env.NEXT_PUBLIC_SENTRY_ORG || "sentry"}.sentry.io/issues/`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gold-600 hover:text-gold-500"
        >
          Open in Sentry &rarr;
        </a>
      </div>

      {status && (
        <div
          className={`mb-3 rounded-md px-3 py-2 text-xs ${
            status.type === "success"
              ? "border border-green-200 bg-green-50 text-green-800"
              : "border border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {status.message}
        </div>
      )}

      {/* Summary cards */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card label="Issues" value={issues.length.toLocaleString()} />
        <Card
          label="Events"
          value={totalEvents.toLocaleString()}
          sub={`${totalUsers} users affected`}
        />
        <Card
          label="Errors"
          value={fatalCount.toLocaleString()}
          sub={issues.length - fatalCount + " warnings/info"}
        />
      </div>

      {/* Issue list */}
      <div className="rounded-xl border border-green-200 bg-white">
        {issues.length === 0 && !isPending ? (
          <div className="p-8 text-center text-sm text-green-400">
            No issues match these filters
          </div>
        ) : (
          <ul className="divide-y divide-green-50">
            {issues.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                onClick={() => handleSelect(issue)}
              />
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-xs text-green-400">
        {issues.length} issues · grouped by signature
      </p>

      {/* Issue detail dialog */}
      {selected && (
        <IssueDialog
          issue={selected}
          event={selectedEvent}
          loading={eventLoading}
          onClose={() => {
            setSelected(null);
            setSelectedEvent(null);
          }}
          onResolve={() => handleResolve(selected.id)}
        />
      )}
    </div>
  );
}

// ─── Summary card ──────────────────────────────────────

function Card({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-green-200 bg-white p-4">
      <div className="text-xs text-green-500">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold text-green-950">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-green-500">{sub}</div>}
    </div>
  );
}

// ─── Issue row ─────────────────────────────────────────

function IssueRow({
  issue,
  onClick,
}: {
  issue: SentryIssue;
  onClick: () => void;
}) {
  const levelClass = LEVEL_COLORS[issue.level] ?? LEVEL_COLORS.info;
  return (
    <li>
      <button
        onClick={onClick}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-green-50/50"
      >
        <span
          className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase ${levelClass}`}
        >
          {issue.level}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium text-green-950">
              {issue.title}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-green-400">
              {issue.shortId}
            </span>
          </div>
          {issue.culprit && (
            <div className="mt-0.5 truncate font-mono text-[11px] text-green-500">
              {issue.culprit}
            </div>
          )}
          <div className="mt-1 flex items-center gap-3 text-[11px] text-green-500">
            <span>{Number(issue.count).toLocaleString()} events</span>
            <span>{issue.userCount} users</span>
            <span>{formatDate(issue.lastSeen)}</span>
            <span className="text-green-400">
              first: {formatDate(issue.firstSeen)}
            </span>
          </div>
        </div>
      </button>
    </li>
  );
}

// ─── Issue detail dialog ───────────────────────────────

// ─── Breadcrumb row ────────────────────────────────────

const CRUMB_COLORS: Record<string, string> = {
  navigation: "bg-gold-50 text-gold-700 border-gold-200",
  "ui.click": "bg-green-50 text-green-700 border-green-200",
  http: "bg-green-50 text-green-700 border-green-200",
  console: "bg-green-50 text-green-600 border-green-100",
  error: "bg-red-50 text-red-700 border-red-200",
  default: "bg-green-50 text-green-600 border-green-100",
};

function BreadcrumbItem({ crumb }: { crumb: SentryBreadcrumb }) {
  const category = crumb.category || crumb.type || "default";
  const colorClass = CRUMB_COLORS[category] ?? CRUMB_COLORS.default;
  const time = crumb.timestamp ? formatCrumbTime(crumb.timestamp) : "";

  // Build a readable message from the crumb data
  let text = crumb.message || "";
  if (!text && crumb.data) {
    if (crumb.type === "http" && typeof crumb.data.url === "string") {
      text = `${crumb.data.method ?? "GET"} ${crumb.data.url}${
        crumb.data.status_code ? ` → ${crumb.data.status_code}` : ""
      }`;
    } else if (crumb.type === "navigation" && typeof crumb.data.to === "string") {
      text = `${crumb.data.from ?? ""} → ${crumb.data.to}`;
    } else {
      text = JSON.stringify(crumb.data).slice(0, 120);
    }
  }

  return (
    <li className="flex items-start gap-2">
      <span className="shrink-0 w-14 text-right font-mono text-[10px] text-green-400">
        {time}
      </span>
      <span
        className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${colorClass}`}
      >
        {category}
      </span>
      <span className="min-w-0 flex-1 break-all font-mono text-green-800">
        {text || "—"}
      </span>
    </li>
  );
}

function formatCrumbTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toISOString().slice(11, 19); // HH:MM:SS
  } catch {
    return "";
  }
}

function IssueDialog({
  issue,
  event,
  loading,
  onClose,
  onResolve,
}: {
  issue: SentryIssue;
  event: SentryEventDetail | null;
  loading: boolean;
  onClose: () => void;
  onResolve: () => void;
}) {
  const exception = event?.entries?.find((e) => e.type === "exception")?.data
    ?.values?.[0] as SentryException | undefined;
  const request = event?.entries?.find((e) => e.type === "request")?.data;
  const breadcrumbs =
    (event?.entries?.find((e) => e.type === "breadcrumbs")?.data?.values ??
      []) as SentryBreadcrumb[];
  const frames = exception?.stacktrace?.frames ?? [];
  const relevantFrames = frames.filter((f) => f.inApp !== false).slice(-10);
  const levelClass = LEVEL_COLORS[issue.level] ?? LEVEL_COLORS.info;

  // Filter tags to the most useful ones and put them in a stable order
  const USEFUL_TAG_KEYS = [
    "environment",
    "release",
    "handled",
    "mechanism",
    "browser",
    "os",
    "client_os",
    "runtime",
    "url",
    "transaction",
  ];
  const tagMap = new Map(
    (event?.tags ?? []).map((t) => [t.key, t.value])
  );
  const displayTags = USEFUL_TAG_KEYS.filter((k) => tagMap.has(k)).map((k) => ({
    key: k,
    value: tagMap.get(k)!,
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl border border-green-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-green-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase ${levelClass}`}
              >
                {issue.level}
              </span>
              <span className="font-mono text-xs text-green-400">
                {issue.shortId}
              </span>
            </div>
            <h3 className="mt-1 font-display text-lg font-semibold text-green-950">
              {issue.title}
            </h3>
            {issue.culprit && (
              <p className="mt-0.5 font-mono text-xs text-green-500">
                {issue.culprit}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 text-green-400 hover:bg-green-50 hover:text-green-700"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 4l10 10M14 4L4 14" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="p-8 text-center text-sm text-green-400">
              Loading event details...
            </div>
          )}

          {event && (
            <>
              {/* Stats */}
              <div className="border-b border-green-100 px-5 py-3">
                <div className="grid grid-cols-2 gap-2 text-xs text-green-700 sm:grid-cols-4">
                  <div>
                    <div className="text-green-400">Events</div>
                    <div>{Number(issue.count).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-green-400">Users</div>
                    <div>{issue.userCount}</div>
                  </div>
                  <div>
                    <div className="text-green-400">First seen</div>
                    <div>{formatDate(issue.firstSeen)}</div>
                  </div>
                  <div>
                    <div className="text-green-400">Last seen</div>
                    <div>{formatDate(issue.lastSeen)}</div>
                  </div>
                </div>
              </div>

              {/* User + env */}
              {(event.user || event.environment || event.release?.version) && (
                <div className="border-b border-green-100 px-5 py-3 text-xs text-green-700">
                  {event.user && (
                    <div>
                      <span className="text-green-400">User:</span>{" "}
                      {event.user.email || event.user.username || event.user.id || "—"}
                    </div>
                  )}
                  {event.environment && (
                    <div>
                      <span className="text-green-400">Environment:</span>{" "}
                      {event.environment}
                    </div>
                  )}
                  {event.release?.version && (
                    <div>
                      <span className="text-green-400">Release:</span>{" "}
                      <code className="font-mono">
                        {event.release.version.slice(0, 12)}
                      </code>
                    </div>
                  )}
                </div>
              )}

              {/* Tags */}
              {displayTags.length > 0 && (
                <div className="border-b border-green-100 px-5 py-3">
                  <div className="mb-1.5 text-xs font-semibold text-green-700">
                    Tags
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {displayTags.map((t) => (
                      <span
                        key={t.key}
                        className="rounded-md border border-green-100 bg-green-50/50 px-2 py-0.5 text-[11px]"
                      >
                        <span className="text-green-500">{t.key}</span>
                        <span className="mx-1 text-green-300">·</span>
                        <span className="font-mono text-green-800">
                          {t.value}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Request */}
              {request && (
                <div className="border-b border-green-100 px-5 py-3">
                  <div className="mb-1 text-xs font-semibold text-green-700">
                    Request
                  </div>
                  <pre className="overflow-x-auto font-mono text-[11px] text-green-800">
                    {request.method} {request.url}
                  </pre>
                </div>
              )}

              {/* Stack trace (in-app frames only, max 10) */}
              {relevantFrames.length > 0 && (
                <div className="border-b border-green-100 px-5 py-3">
                  <div className="mb-1 text-xs font-semibold text-green-700">
                    Stack ({relevantFrames.length} frames, in-app only)
                  </div>
                  <ol className="space-y-1 font-mono text-[11px] text-green-800">
                    {relevantFrames.map((frame, i) => (
                      <li
                        key={i}
                        className="rounded border border-green-100 bg-green-50/50 px-2 py-1"
                      >
                        <div className="font-medium">
                          {frame.function || "(anonymous)"}
                        </div>
                        <div className="text-green-500">
                          {frame.filename}
                          {frame.lineno ? `:${frame.lineno}` : ""}
                          {frame.colno ? `:${frame.colno}` : ""}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Breadcrumbs (newest first) */}
              {breadcrumbs.length > 0 && (
                <div className="px-5 py-3">
                  <div className="mb-1 text-xs font-semibold text-green-700">
                    Breadcrumbs ({breadcrumbs.length})
                  </div>
                  <ol className="space-y-1 text-[11px]">
                    {[...breadcrumbs].reverse().slice(0, 30).map((b, i) => (
                      <BreadcrumbItem key={i} crumb={b} />
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-green-100 px-5 py-3">
          <a
            href={issue.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gold-600 hover:text-gold-500"
          >
            Open full issue in Sentry &rarr;
          </a>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-green-200 px-3 py-1.5 text-xs text-green-800 hover:bg-green-50"
            >
              Close
            </button>
            {issue.status === "unresolved" && (
              <button
                onClick={onResolve}
                className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800"
              >
                Resolve
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
