import Link from "next/link";
import { db } from "@/lib/db";
import { proProfiles, users, proLocations, locations } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import { cheapestLessonPrice } from "@/lib/pricing";

export const metadata = {
  title: "Our Pros — Golf Lessons",
  description: "Browse certified golf professionals and find the perfect coach for your game.",
};

export default async function ProsPage() {
  const locale = await getLocale();

  const pros = await db
    .select({
      id: proProfiles.id,
      displayName: proProfiles.displayName,
      bio: proProfiles.bio,
      specialties: proProfiles.specialties,
      photoUrl: proProfiles.photoUrl,
      lessonPricing: proProfiles.lessonPricing,
    })
    .from(proProfiles)
    .innerJoin(users, eq(proProfiles.userId, users.id))
    .where(and(eq(proProfiles.published, true), isNull(proProfiles.deletedAt)));

  // Fetch locations per pro
  const proLocationData = await db
    .select({
      proProfileId: proLocations.proProfileId,
      locationName: locations.name,
      city: locations.city,
    })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(proLocations.active, true));

  const locationsByPro = new Map<number, string[]>();
  for (const pl of proLocationData) {
    const list = locationsByPro.get(pl.proProfileId) ?? [];
    list.push(pl.city || pl.locationName);
    locationsByPro.set(pl.proProfileId, list);
  }

  return (
    <div className="bg-cream">
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="font-display text-4xl font-semibold text-green-900">
          {t("pros.browse.title", locale)}
        </h1>
        <p className="mt-3 max-w-2xl text-green-600">
          {t("pros.browse.subtitle", locale)}
        </p>

        {pros.length === 0 ? (
          <div className="mt-12 rounded-xl border border-green-200 bg-white p-12 text-center">
            <p className="text-green-600">{t("pros.browse.empty", locale)}</p>
          </div>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {pros.map((pro) => {
              const locs = locationsByPro.get(pro.id) ?? [];
              return (
                <Link
                  key={pro.id}
                  href={`/pros/${pro.id}`}
                  className="group rounded-xl border border-green-200 bg-white p-6 transition-colors hover:border-green-300"
                >
                  <div className="flex items-start gap-4">
                    {pro.photoUrl ? (
                      <img
                        src={pro.photoUrl}
                        alt={pro.displayName}
                        className="h-16 w-16 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                        </svg>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-lg font-medium text-green-800 group-hover:text-green-900">
                        {pro.displayName}
                      </h2>
                      {pro.specialties && (
                        <p className="mt-0.5 text-xs text-gold-600">
                          {pro.specialties}
                        </p>
                      )}
                    </div>
                  </div>
                  {pro.bio && (
                    <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-green-600">
                      {pro.bio}
                    </p>
                  )}
                  <div className="mt-4 flex items-center justify-between">
                    {locs.length > 0 && (
                      <span className="text-xs text-green-500">
                        {locs.slice(0, 2).join(", ")}
                        {locs.length > 2 && ` +${locs.length - 2}`}
                      </span>
                    )}
                    {(() => {
                      const from = cheapestLessonPrice(
                        pro.lessonPricing as Record<string, number> | null,
                        locale,
                      );
                      return from ? (
                        <span className="text-xs font-medium text-green-700">
                          {t("proBrowse.fromPrice", locale).replace("{price}", from)}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
