import { db } from "@/lib/db";
import {
  lessonBookings,
  proProfiles,
  proLocations,
  locations,
  users,
} from "@/lib/db/schema";
import { eq, and, gte, lt, or, desc, asc } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CancelBookingButton } from "./CancelBookingButton";
import { BookingRefreshListener } from "@/components/BookingRefreshListener";
import { getLocale } from "@/lib/locale";
import { formatDate } from "@/lib/format-date";
import { todayInTZ } from "@/lib/local-date";
import { t } from "@/lib/i18n/translations";
import PageHeading from "@/components/app/PageHeading";

export const metadata = { title: "My Bookings — Golf Lessons" };

export default async function MemberBookingsPage() {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    redirect("/login");
  }

  const locale = await getLocale();

  const allBookings = await db
    .select({
      id: lessonBookings.id,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      status: lessonBookings.status,
      participantCount: lessonBookings.participantCount,
      notes: lessonBookings.notes,
      proName: proProfiles.displayName,
      proId: proProfiles.id,
      proEmail: users.email,
      proPhone: proProfiles.contactPhone,
      locationName: locations.name,
      locationCity: locations.city,
      locationTimezone: locations.timezone,
      cancellationHours: proProfiles.cancellationHours,
    })
    .from(lessonBookings)
    .innerJoin(proProfiles, eq(lessonBookings.proProfileId, proProfiles.id))
    .innerJoin(users, eq(proProfiles.userId, users.id))
    .innerJoin(
      proLocations,
      eq(lessonBookings.proLocationId, proLocations.id)
    )
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(lessonBookings.bookedById, session.userId))
    .orderBy(asc(lessonBookings.date), asc(lessonBookings.startTime));

  // Per-booking "today" — each booking's date column is wall-clock in
  // its location's TZ, so the cutoff for upcoming/past has to be
  // computed in that same TZ. Cache `todayInTZ()` per timezone string
  // so we don't re-compute Brussels-today for every booking in the
  // common case. (gaps.md §0)
  const todayCache = new Map<string, string>();
  function todayFor(tz: string): string {
    let cached = todayCache.get(tz);
    if (cached === undefined) {
      cached = todayInTZ(tz);
      todayCache.set(tz, cached);
    }
    return cached;
  }
  const upcoming = allBookings.filter(
    (b) =>
      b.status === "confirmed" && b.date >= todayFor(b.locationTimezone),
  );
  const past = allBookings.filter(
    (b) =>
      b.date < todayFor(b.locationTimezone) || b.status !== "confirmed",
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <BookingRefreshListener />
      <PageHeading
        title={t("memberBookings.title", locale)}
        helpSlug="member.bookings"
        locale={locale}
        className="mb-8"
      >
        <Link
          href="/member/dashboard"
          className="rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-500"
        >
          {t("memberBookings.bookLesson", locale)}
        </Link>
      </PageHeading>

      {/* Upcoming */}
      <section>
        <h2 className="mb-4 font-display text-xl font-medium text-green-800">
          {t("memberBookings.upcoming", locale)}
        </h2>
        {upcoming.length === 0 ? (
          <div className="rounded-xl border border-green-200 bg-white p-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
            </div>
            <h3 className="font-display text-lg font-medium text-green-900">
              {t("memberBookings.emptyTitle", locale)}
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-green-600">
              {t("memberBookings.emptyDesc", locale)}
            </p>
            <Link
              href="/pros"
              className="mt-5 inline-block rounded-md bg-gold-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-500"
            >
              {t("memberBookings.browsePros", locale)}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((booking) => (
              <div
                key={booking.id}
                className="rounded-xl border border-green-200 bg-white p-5 transition-colors hover:border-green-300"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium text-green-900">
                      {formatDate(booking.date, locale)}
                    </div>
                    <div className="mt-0.5 text-sm text-green-700">
                      {booking.startTime} - {booking.endTime}
                    </div>
                    <div className="mt-1 text-sm text-green-600">
                      {t("memberBookings.with", locale)}{" "}
                      <span className="font-medium">{booking.proName}</span>{" "}
                      {t("memberBookings.at", locale)}{" "}
                      {booking.locationName}
                      {booking.locationCity && `, ${booking.locationCity}`}
                    </div>
                    {booking.participantCount > 1 && (
                      <div className="mt-0.5 text-xs text-green-500">
                        {t("memberBookings.participants", locale).replace(
                          "{n}",
                          String(booking.participantCount)
                        )}
                      </div>
                    )}
                    {(booking.proEmail || booking.proPhone) && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-green-600">
                        {booking.proEmail && (
                          <a
                            href={`mailto:${booking.proEmail}`}
                            className="text-green-700 underline-offset-2 hover:underline"
                          >
                            {booking.proEmail}
                          </a>
                        )}
                        {booking.proPhone && (
                          <a
                            href={`tel:${booking.proPhone.replace(/\s+/g, "")}`}
                            className="text-green-700 underline-offset-2 hover:underline"
                          >
                            {booking.proPhone}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/member/bookings/${booking.id}/edit`}
                      className="rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-50"
                    >
                      Edit
                    </Link>
                    <CancelBookingButton
                      bookingId={booking.id}
                      date={booking.date}
                      startTime={booking.startTime}
                      cancellationHours={booking.cancellationHours}
                      locale={locale}
                      timezone={booking.locationTimezone}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Past */}
      {past.length > 0 && (
        <section className="mt-10">
          <details>
            <summary className="cursor-pointer font-display text-xl font-medium text-green-800">
              {t("memberBookings.pastCancelled", locale).replace(
                "{n}",
                String(past.length)
              )}
            </summary>
            <div className="mt-4 space-y-3">
              {past.map((booking) => (
                <div
                  key={booking.id}
                  className="rounded-xl border border-green-100 bg-green-50/50 p-5 opacity-75"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-medium text-green-800">
                        {formatDate(booking.date, locale, {
                          weekday: "short",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </div>
                      <div className="text-sm text-green-600">
                        {booking.startTime} - {booking.endTime}{" "}
                        {t("memberBookings.with", locale)} {booking.proName}
                      </div>
                    </div>
                    <span
                      className={
                        booking.status === "cancelled"
                          ? "text-xs font-medium text-red-500"
                          : "text-xs font-medium text-green-500"
                      }
                    >
                      {booking.status === "cancelled"
                        ? t("memberBookings.status.cancelled", locale)
                        : t("memberBookings.status.completed", locale)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
