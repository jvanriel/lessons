import BlobBrowser from "./BlobBrowser";
import PageHeading from "@/components/app/PageHeading";

export const metadata = { title: "Blob Store — Dev — Golf Lessons" };

export default function BlobPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <PageHeading
        title="Blob Store"
        subtitle="Browse and manage files in Vercel Blob. Handle with care — deletes are permanent."
        helpSlug="dev.blob"
        locale="en"
      />
      <div className="mt-6">
        <BlobBrowser />
      </div>
    </div>
  );
}
