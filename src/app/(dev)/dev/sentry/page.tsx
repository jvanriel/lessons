import SentryBrowser from "./SentryBrowser";
import PageHeading from "@/components/app/PageHeading";

export const metadata = { title: "Sentry — Dev — Golf Lessons" };

export default function SentryPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <PageHeading
        title="Sentry"
        subtitle="Uncaught errors from the server and client, grouped by signature. Complements the events table (business events) and Vercel Runtime logs (raw stdout/stderr)."
        helpSlug="dev.sentry"
        locale="en"
      />
      <div className="mt-6">
        <SentryBrowser />
      </div>
    </div>
  );
}
