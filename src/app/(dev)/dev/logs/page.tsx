import LogsBrowser from "./LogsBrowser";

export const metadata = { title: "Logs — Dev — Golf Lessons" };

export default function LogsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-950">
        Event logs
      </h1>
      <p className="mt-2 text-sm text-green-600">
        Business events from the <code>events</code> table. 90-day retention.
        Use this for counters, diagnostics, and audit trails.
      </p>

      <div className="mt-6">
        <LogsBrowser />
      </div>
    </div>
  );
}
