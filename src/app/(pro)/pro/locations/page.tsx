import { requireProProfile } from "@/lib/pro";
import { redirect } from "next/navigation";
import { getMyLocations } from "./actions";
import LocationManager from "./LocationManager";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import PageHeading from "@/components/app/PageHeading";

export const metadata = { title: "My Locations — Golf Lessons" };

export default async function ProLocationsPage() {
  const { profile } = await requireProProfile();
  if (!profile) redirect("/login");

  const myLocations = await getMyLocations();
  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <PageHeading
        title={t("proLocations.pageTitle", locale)}
        subtitle={t("proLocations.pageSubtitle", locale)}
        helpSlug="pro.locations"
        locale={locale}
      />
      <LocationManager locations={myLocations} locale={locale} />
    </div>
  );
}
