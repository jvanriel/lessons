import BackupManager from "./BackupManager";
import PageHeading from "@/components/app/PageHeading";

export const metadata = { title: "Backups — Golf Lessons" };

export default function BackupsPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-16">
      <PageHeading
        title="Backups"
        subtitle="Database backup and restore. Backups are stored in Vercel Blob and run daily at 02:00 UTC via cron."
        helpSlug="dev.backups"
        locale="en"
      />
      <BackupManager />
    </section>
  );
}
