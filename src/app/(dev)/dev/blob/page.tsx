import BlobBrowser from "./BlobBrowser";

export const metadata = { title: "Blob Store — Dev — Golf Lessons" };

export default function BlobPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-950">
        Blob Store
      </h1>
      <p className="mt-2 text-sm text-green-600">
        Browse and manage files in Vercel Blob. Handle with care — deletes are
        permanent.
      </p>

      <div className="mt-6">
        <BlobBrowser />
      </div>
    </div>
  );
}
