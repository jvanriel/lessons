import { requireProProfile } from "@/lib/pro";
import { getProPages } from "./actions";
import ProPagesList from "./ProPagesList";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

export const metadata = { title: "My Pages — Golf Lessons" };

export default async function ProPagesPage() {
  const { profile } = await requireProProfile();
  const locale = await getLocale();

  if (!profile) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="font-display text-3xl font-semibold text-green-900">
          {t("proPages.pageTitle", locale)}
        </h1>
        <p className="mt-4 text-green-600">
          {t("proPages.noProfile", locale)}
        </p>
      </div>
    );
  }

  const pages = await getProPages();

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-900">
        {t("proPages.pageTitle", locale)}
      </h1>
      <p className="mt-2 text-sm text-green-600">
        {t("proPages.pageSubtitle", locale)}
      </p>
      <ProPagesList pages={pages} proSlug={profile.slug} locale={locale} />
    </div>
  );
}
