import { requireProProfile } from "@/lib/pro";
import ProProfileEditor from "./ProProfileEditor";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import PageHeading from "@/components/app/PageHeading";

export const metadata = { title: "Pro Profile — Golf Lessons" };

export default async function ProProfilePage() {
  const { profile } = await requireProProfile();
  const locale = await getLocale();

  if (!profile) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <PageHeading
          title={t("proProfile.pageTitle", locale)}
          helpSlug="pro.profile"
          locale={locale}
        />
        <p className="mt-4 text-green-600">
          {t("proProfile.notCreated", locale)}
        </p>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <PageHeading
        title={t("proProfile.pageTitle", locale)}
        helpSlug="pro.profile"
        locale={locale}
      />
      <div className="mt-8 rounded-xl border border-green-200 bg-white p-8">
        <ProProfileEditor
          locale={locale}
          profile={{
            id: profile.id,
            displayName: profile.displayName,
            bio: profile.bio,
            specialties: profile.specialties,
            photoUrl: profile.photoUrl,
            lessonDurations: profile.lessonDurations as number[],
            // Stored in cents; expose as decimal euros to the editor.
            lessonPricing: Object.fromEntries(
              Object.entries(
                (profile.lessonPricing as Record<string, number>) ?? {}
              ).map(([k, cents]) => [k, cents / 100])
            ),
            maxGroupSize: profile.maxGroupSize,
            bookingEnabled: profile.bookingEnabled,
            bookingNotice: profile.bookingNotice,
            bookingHorizon: profile.bookingHorizon,
            cancellationHours: profile.cancellationHours,
            allowBookingWithoutPayment: profile.allowBookingWithoutPayment,
            published: profile.published,
          }}
        />
      </div>
    </section>
  );
}
