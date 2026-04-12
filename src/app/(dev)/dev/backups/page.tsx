import BackupManager from "./BackupManager";

export const metadata = { title: "Backups — Golf Lessons" };

export default function BackupsPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-green-950">
        Backups
      </h1>
      <p className="mt-3 text-green-800/70">
        Database backup and restore. Backups are stored in Vercel Blob and run
        daily at 02:00 UTC via cron.
      </p>

      <BackupManager />
    </section>
  );
}
