import LogsTabs from "./LogsTabs";

export const metadata = { title: "Logs — Dev — Golf Lessons" };

export default function LogsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-950">
        Logs
      </h1>
      <p className="mt-2 text-sm text-green-600">
        Business events from the app (stored in Postgres) and raw runtime
        logs from Vercel (fetched live).
      </p>

      <div className="mt-6">
        <LogsTabs />
      </div>
    </div>
  );
}
