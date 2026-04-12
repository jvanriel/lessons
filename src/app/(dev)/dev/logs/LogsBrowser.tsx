"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { queryEvents, type EventRow, type LogsResult } from "./actions";

const LEVEL_COLORS: Record<string, string> = {
  info: "text-green-700 bg-green-50 border-green-200",
  warn: "text-amber-700 bg-amber-50 border-amber-200",
  error: "text-red-700 bg-red-50 border-red-200",
};

const SINCE_OPTIONS = [
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60 * 1000) return "just now";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleString();
}

export default function LogsBrowser() {
  const [result, setResult] = useState<LogsResult | null>(null);
  const [type, setType] = useState("");
  const [level, setLevel] = useState("");
  const [search, setSearch] = useState("");
  const [since, setSince] = useState("24h");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [helpOpen, setHelpOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      try {
        const r = await queryEvents({
          type: type || undefined,
          level: level || undefined,
          search: search || undefined,
          since,
          limit: 200,
        });
        setResult(r);
      } catch (e) {
        console.error(e);
      }
    });
  }, [type, level, search, since]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={since}
          onChange={(e) => setSince(e.target.value)}
          className="rounded-md border border-green-200 bg-white px-2 py-1.5 text-xs text-green-900"
        >
          {SINCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-md border border-green-200 bg-white px-2 py-1.5 text-xs text-green-900"
        >
          <option value="">All types</option>
          {result?.distinctTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="rounded-md border border-green-200 bg-white px-2 py-1.5 text-xs text-green-900"
        >
          <option value="">All levels</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search type + payload…"
          className="flex-1 min-w-[180px] rounded-md border border-green-200 bg-white px-3 py-1.5 text-xs text-green-900 placeholder:text-green-400"
        />

        <button
          onClick={load}
          disabled={isPending}
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
          Auto (5s)
        </label>

        <button
          onClick={() => setHelpOpen(true)}
          className="flex items-center justify-center rounded-md border border-green-200 bg-white p-1.5 text-green-500 hover:bg-green-50 hover:text-green-700"
          title="What do we log?"
          aria-label="Help"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 17.25h.008v.008H12v-.008ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        </button>
      </div>

      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}

      {result && (
        <>
          {/* Summary cards */}
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-green-200 bg-white p-4">
              <div className="text-xs text-green-500">Total events</div>
              <div className="mt-1 font-display text-2xl font-semibold text-green-950">
                {result.total.toLocaleString()}
              </div>
            </div>

            <div className="rounded-xl border border-green-200 bg-white p-4">
              <div className="text-xs text-green-500">By level</div>
              <div className="mt-1 flex gap-2 text-xs">
                {result.levelStats.length === 0 ? (
                  <span className="text-green-400">—</span>
                ) : (
                  result.levelStats.map((s) => (
                    <span
                      key={s.level}
                      className={`rounded-md border px-1.5 py-0.5 ${LEVEL_COLORS[s.level] ?? LEVEL_COLORS.info}`}
                    >
                      {s.level}: {s.count}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-green-200 bg-white p-4">
              <div className="text-xs text-green-500">Top types</div>
              <div className="mt-1 space-y-0.5">
                {result.stats.slice(0, 5).map((s) => (
                  <button
                    key={s.type}
                    onClick={() => setType(s.type)}
                    className="flex w-full justify-between text-left text-xs text-green-700 hover:text-green-900"
                  >
                    <span className="font-mono">{s.type}</span>
                    <span className="text-green-500">{s.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Event list */}
          <div className="rounded-xl border border-green-200 bg-white">
            {result.rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-green-400">
                No events match these filters
              </div>
            ) : (
              <ul className="divide-y divide-green-50">
                {result.rows.map((row) => (
                  <EventItem
                    key={row.id}
                    row={row}
                    expanded={!!expanded[row.id]}
                    onToggle={() =>
                      setExpanded({ ...expanded, [row.id]: !expanded[row.id] })
                    }
                  />
                ))}
              </ul>
            )}
          </div>

          <p className="mt-3 text-xs text-green-400">
            Showing {result.rows.length} of {result.total.toLocaleString()}{" "}
            events. Newest first.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Help dialog ───────────────────────────────────────

interface EventTypeDoc {
  type: string;
  level: string;
  description: string;
  actor: string;
  payload: string;
}

const EVENT_DOCS: { group: string; events: EventTypeDoc[] }[] = [
  {
    group: "Authentication",
    events: [
      {
        type: "auth.login",
        level: "info",
        description: "User signed in successfully",
        actor: "user who logged in",
        payload: "method: 'password' | 'google'",
      },
      {
        type: "auth.oauth.no_account",
        level: "warn",
        description:
          "Google OAuth succeeded but the email isn't in the users table",
        actor: "none",
        payload: "email",
      },
    ],
  },
  {
    group: "Bookings",
    events: [
      {
        type: "booking.cancelled",
        level: "info",
        description: "Student cancelled a booking",
        actor: "student",
        payload: "bookingId, date, startTime, proId",
      },
    ],
  },
  {
    group: "Notifications",
    events: [
      {
        type: "notification.created",
        level: "info",
        description:
          "In-app notification created and fanned out to DB + push + WebSocket + ntfy",
        actor: "none",
        payload: "kind, priority, targetCount, title",
      },
      {
        type: "push.sent",
        level: "info / warn",
        description:
          "Web Push fan-out completed. level=warn if any delivery failed.",
        actor: "none",
        payload:
          "tag, title, recipients, subscriptions, sent, failed, pruned (stale subs removed on 404/410)",
      },
    ],
  },
  {
    group: "Backups",
    events: [
      {
        type: "backup.created",
        level: "info",
        description:
          "Daily cron (02:00 UTC) or manual backup completed successfully",
        actor: "none",
        payload: "pathname, size, notificationsDeleted, eventsDeleted",
      },
      {
        type: "backup.failed",
        level: "error",
        description: "Backup creation threw",
        actor: "none",
        payload: "error",
      },
    ],
  },
];

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl border border-green-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-green-100 px-5 py-3">
          <h3 className="font-display text-lg font-semibold text-green-950">
            What do we log?
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-green-400 hover:bg-green-50 hover:text-green-700"
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

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 text-sm text-green-800">
          <section className="mb-5">
            <h4 className="mb-1 font-semibold text-green-950">Storage</h4>
            <p className="text-xs text-green-700">
              Events are stored in the <code>events</code> Postgres table
              (indexed on <code>type + created_at</code> and{" "}
              <code>actor_id + created_at</code>). Rows older than 90 days are
              purged nightly by the backup cron.
            </p>
          </section>

          <section className="mb-5">
            <h4 className="mb-1 font-semibold text-green-950">
              How to log from code
            </h4>
            <pre className="overflow-x-auto rounded-md bg-green-50 p-3 font-mono text-[11px] text-green-900">
              {`import { logEvent } from "@/lib/events";

await logEvent({
  type: "booking.cancelled",
  level: "info",           // info | warn | error
  actorId: session.userId, // who performed
  targetId: pro.userId,    // who it affected
  payload: { bookingId, date },
});`}
            </pre>
            <p className="mt-1 text-xs text-green-600">
              <code>logEvent</code> is fire-and-forget: it never throws. Use it
              for business events — bookings, signups, pushes, errors — not for
              high-volume page views or every chat message.
            </p>
          </section>

          <section>
            <h4 className="mb-1 font-semibold text-green-950">
              Events we currently log
            </h4>
            <div className="space-y-4">
              {EVENT_DOCS.map((group) => (
                <div key={group.group}>
                  <h5 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-green-500">
                    {group.group}
                  </h5>
                  <div className="space-y-2">
                    {group.events.map((e) => (
                      <div
                        key={e.type}
                        className="rounded-md border border-green-100 bg-green-50/40 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs text-green-900">
                            {e.type}
                          </code>
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                              LEVEL_COLORS[e.level.split(" ")[0]] ??
                              LEVEL_COLORS.info
                            }`}
                          >
                            {e.level}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-green-700">
                          {e.description}
                        </p>
                        <div className="mt-1 text-[11px] text-green-500">
                          <span className="text-green-600">actor:</span>{" "}
                          {e.actor}
                          {" · "}
                          <span className="text-green-600">payload:</span>{" "}
                          <span className="font-mono">{e.payload}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-5">
            <h4 className="mb-1 font-semibold text-green-950">
              What we don&apos;t log
            </h4>
            <ul className="ml-5 list-disc space-y-0.5 text-xs text-green-700">
              <li>
                Page views, scroll events, or any high-volume telemetry — use
                Vercel Analytics for that
              </li>
              <li>
                Request-level errors and stack traces — those go to Vercel
                logs via <code>console.error</code>
              </li>
              <li>
                Chat messages (each one is already a DB row in the{" "}
                <code>comments</code> table)
              </li>
              <li>Notification clicks / reads (already in the bell dropdown)</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Event row ─────────────────────────────────────────

function EventItem({
  row,
  expanded,
  onToggle,
}: {
  row: EventRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const levelClass = LEVEL_COLORS[row.level] ?? LEVEL_COLORS.info;

  return (
    <li className="hover:bg-green-50/30">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-2 text-left"
      >
        <span
          className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase ${levelClass}`}
        >
          {row.level}
        </span>
        <span className="shrink-0 font-mono text-xs text-green-900">
          {row.type}
        </span>
        {row.actorName && (
          <span className="shrink-0 text-xs text-green-500">
            {row.actorName}
          </span>
        )}
        <span className="flex-1" />
        <span className="shrink-0 text-xs text-green-400">
          {formatDate(row.createdAt)}
        </span>
      </button>
      {expanded && (
        <div className="bg-green-50/50 px-4 py-3 text-xs">
          <div className="mb-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-green-700">
            <div>
              <span className="text-green-500">id:</span> {row.id}
            </div>
            <div>
              <span className="text-green-500">at:</span>{" "}
              {new Date(row.createdAt).toLocaleString()}
            </div>
            {row.actorId !== null && (
              <div>
                <span className="text-green-500">actor:</span> #{row.actorId}{" "}
                {row.actorName || ""}
              </div>
            )}
            {row.targetId !== null && (
              <div>
                <span className="text-green-500">target:</span> #{row.targetId}
              </div>
            )}
          </div>
          {row.payload && (
            <pre className="mt-2 overflow-x-auto rounded-md bg-white p-2 font-mono text-[11px] text-green-900">
              {JSON.stringify(row.payload, null, 2)}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}
