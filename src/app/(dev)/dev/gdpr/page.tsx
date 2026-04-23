import GdprBrowser from "./GdprBrowser";
import PageHeading from "@/components/app/PageHeading";

export const metadata = { title: "GDPR — Dev — Golf Lessons" };

export default function GdprPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <PageHeading
        title="GDPR — Data subject requests"
        subtitle="Look up a user, export their data (Art. 15/20), or delete + anonymise their account (Art. 17). Bookings and Stripe events are retained anonymised for tax + audit reasons."
        helpSlug="dev.gdpr"
        locale="en"
      />
      <div className="mt-6">
        <GdprBrowser />
      </div>
    </div>
  );
}
