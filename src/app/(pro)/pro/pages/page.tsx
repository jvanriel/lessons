import { requireProProfile } from "@/lib/pro";
import { getProPages } from "./actions";
import ProPagesList from "./ProPagesList";

export const metadata = { title: "My Pages — Golf Lessons" };

export default async function ProPagesPage() {
  const { profile } = await requireProProfile();

  if (!profile) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="font-display text-3xl font-semibold text-green-900">
          My Pages
        </h1>
        <p className="mt-4 text-green-600">
          No pro profile found. Contact an administrator.
        </p>
      </div>
    );
  }

  const pages = await getProPages();

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-900">
        My Pages
      </h1>
      <p className="mt-2 text-sm text-green-600">
        Create flyers and landing pages to promote your services.
      </p>
      <ProPagesList pages={pages} proSlug={profile.slug} />
    </div>
  );
}
