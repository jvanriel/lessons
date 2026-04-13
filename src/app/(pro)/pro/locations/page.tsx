import { requireProProfile } from "@/lib/pro";
import { redirect } from "next/navigation";
import { getMyLocations } from "./actions";
import LocationManager from "./LocationManager";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

export const metadata = { title: "My Locations — Golf Lessons" };

export default async function ProLocationsPage() {
  const { profile } = await requireProProfile();
  if (!profile) redirect("/login");

  const myLocations = await getMyLocations();
  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-900">
        {t("proLocations.pageTitle", locale)}
      </h1>
      <p className="mt-2 text-sm text-green-600">
        {t("proLocations.pageSubtitle", locale)}
      </p>
      <LocationManager locations={myLocations} />
    </div>
  );
}
