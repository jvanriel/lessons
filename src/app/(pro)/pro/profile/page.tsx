import { requireProProfile } from "@/lib/pro";
import ProProfileEditor from "./ProProfileEditor";
import EnablePushButton from "@/components/notifications/EnablePushButton";
import InstallPwaSection from "@/components/app/InstallPwaSection";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

export const metadata = { title: "Pro Profile — Golf Lessons" };

export default async function ProProfilePage() {
  const { profile } = await requireProProfile();
  const locale = await getLocale();

  if (!profile) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="font-display text-3xl font-semibold text-green-900">
          {t("proProfile.pageTitle", locale)}
        </h1>
        <p className="mt-4 text-green-600">
          {t("proProfile.notCreated", locale)}
        </p>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-900">
        {t("proProfile.pageTitle", locale)}
      </h1>
      <div className="mt-8 rounded-xl border border-green-200 bg-white p-8">
        <ProProfileEditor
          locale={locale}
          profile={{
            id: profile.id,
            displayName: profile.displayName,
            bio: profile.bio,
            specialties: profile.specialties,
            pricePerHour: profile.pricePerHour,
            lessonDurations: profile.lessonDurations as number[],
            // Stored in cents; expose as whole euros to the editor.
            lessonPricing: Object.fromEntries(
              Object.entries(
                (profile.lessonPricing as Record<string, number>) ?? {}
              ).map(([k, cents]) => [k, Math.round(cents / 100)])
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

      <div className="mt-8">
        <InstallPwaSection locale={locale} />
      </div>

      <div className="mt-8 rounded-xl border border-green-200 bg-white p-8">
        <h2 className="font-display text-xl font-semibold text-green-950">
          {t("proProfile.notifications", locale)}
        </h2>
        <p className="mt-1 text-sm text-green-600">
          {t("proProfile.notificationsDesc", locale)}
        </p>
        <div className="mt-4">
          <EnablePushButton locale={locale} />
        </div>
      </div>
    </section>
  );
}
