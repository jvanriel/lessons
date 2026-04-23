import HealthBrowser from "./HealthBrowser";
import PageHeading from "@/components/app/PageHeading";

export const metadata = { title: "Health — Dev — Golf Lessons" };

export default function HealthPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <PageHeading
        title="Health"
        subtitle="Live checks against DB, Stripe, Vercel Blob, Sentry config, and critical env vars. External monitors (Uptime Kuma) poll /api/health."
        helpSlug="dev.health"
        locale="en"
      />
      <div className="mt-6">
        <HealthBrowser />
      </div>
    </div>
  );
}
