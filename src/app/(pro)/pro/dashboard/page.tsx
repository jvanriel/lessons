import { db } from "@/lib/db";
import { lessonBookings } from "@/lib/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { requireProProfile } from "@/lib/pro";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookingRefreshListener } from "@/components/BookingRefreshListener";
import { QRLoginButton } from "@/app/(member)/member/dashboard/QRLoginDialog";
import { getLocale } from "@/lib/locale";
import { todayInTZ } from "@/lib/local-date";
import { t } from "@/lib/i18n/translations";
import PageHeading from "@/components/app/PageHeading";

export const metadata = { title: "Pro Dashboard — Golf Lessons" };

export default async function ProDashboard() {
  const { profile } = await requireProProfile();
  if (!profile) redirect("/login");

  const locale = await getLocale();

  const today = todayInTZ(profile.defaultTimezone);

  // Count upcoming bookings
  const [upcomingResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.proProfileId, profile.id),
        eq(lessonBookings.status, "confirmed"),
        gte(lessonBookings.date, today)
      )
    );
  const upcomingCount = upcomingResult?.count ?? 0;

  // Today's lessons
  const [todayResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.proProfileId, profile.id),
        eq(lessonBookings.status, "confirmed"),
        eq(lessonBookings.date, today)
      )
    );
  const todayCount = todayResult?.count ?? 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <BookingRefreshListener />
      <PageHeading
        title={t("proDashboard.title", locale)}
        subtitle={t("proDashboard.tagline", locale)}
        helpSlug="pro.dashboard"
        locale={locale}
      >
        <QRLoginButton locale={locale} />
      </PageHeading>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Today's lessons */}
        <div className="rounded-xl border border-green-200 bg-white p-6">
          <div className="text-3xl font-semibold text-green-900">
            {todayCount}
          </div>
          <div className="mt-1 text-sm text-green-600">
            {todayCount === 1 ? t("proDashboard.lessonToday", locale) : t("proDashboard.lessonsToday", locale)}
          </div>
        </div>

        {/* Upcoming bookings */}
        <div className="rounded-xl border border-green-200 bg-white p-6">
          <div className="text-3xl font-semibold text-green-900">
            {upcomingCount}
          </div>
          <div className="mt-1 text-sm text-green-600">
            {upcomingCount === 1 ? t("proDashboard.upcomingBooking", locale) : t("proDashboard.upcomingBookings", locale)}
          </div>
        </div>

        {/* Quick links */}
        <div className="rounded-xl border border-green-200 bg-white p-6">
          <div className="text-sm font-medium text-green-800">{t("proDashboard.quickLinks", locale)}</div>
          <div className="mt-3 space-y-2">
            <Link
              href="/pro/bookings"
              className="block text-sm text-gold-600 hover:text-gold-500"
            >
              {t("proDashboard.viewAllBookings", locale)}
            </Link>
            <Link
              href="/pro/availability"
              className="block text-sm text-gold-600 hover:text-gold-500"
            >
              {t("proDashboard.manageAvailability", locale)}
            </Link>
            <Link
              href="/pro/profile"
              className="block text-sm text-gold-600 hover:text-gold-500"
            >
              {t("proDashboard.editProfile", locale)}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
