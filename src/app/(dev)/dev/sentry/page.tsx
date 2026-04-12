import SentryBrowser from "./SentryBrowser";

export const metadata = { title: "Sentry — Dev — Golf Lessons" };

export default function SentryPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-950">
        Sentry
      </h1>
      <p className="mt-2 text-sm text-green-600">
        Uncaught errors from the server and client, grouped by signature. This
        complements the <code>events</code> table (business events) and
        Vercel Runtime logs (raw stdout/stderr).
      </p>

      <div className="mt-6">
        <SentryBrowser />
      </div>
    </div>
  );
}
