import LogsTabs from "./LogsTabs";
import PageHeading from "@/components/app/PageHeading";

export const metadata = { title: "Logs — Dev — Golf Lessons" };

export default function LogsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <PageHeading
        title="Logs"
        subtitle="Business events from the app (stored in Postgres) and raw runtime logs from Vercel (fetched live)."
        helpSlug="dev.logs"
        locale="en"
      />
      <div className="mt-6">
        <LogsTabs />
      </div>
    </div>
  );
}
