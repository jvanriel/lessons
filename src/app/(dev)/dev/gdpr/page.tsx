import GdprBrowser from "./GdprBrowser";

export const metadata = { title: "GDPR — Dev — Golf Lessons" };

export default function GdprPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-950">
        GDPR — Data subject requests
      </h1>
      <p className="mt-2 text-sm text-green-600">
        Dev-only tool for handling GDPR data subject requests. Look up a user
        by email, review what data we hold on them, export it as JSON (Article
        15 / 20 — right to access + portability), or delete + anonymise their
        account (Article 17 — right to erasure). Bookings, participants, and
        Stripe events are retained in anonymised form for legitimate-interest
        reasons (tax records + audit trail).
      </p>

      <div className="mt-6">
        <GdprBrowser />
      </div>
    </div>
  );
}
