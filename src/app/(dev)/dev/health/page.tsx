import HealthBrowser from "./HealthBrowser";

export const metadata = { title: "Health — Dev — Golf Lessons" };

export default function HealthPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-950">
        Health
      </h1>
      <p className="mt-2 text-sm text-green-600">
        Live checks against Database, Stripe, Vercel Blob, Sentry config, and
        critical env vars. External monitors (Uptime Kuma on Hetzner) poll{" "}
        <code>/api/health</code> to alert on outages.
      </p>

      <div className="mt-6">
        <HealthBrowser />
      </div>
    </div>
  );
}
