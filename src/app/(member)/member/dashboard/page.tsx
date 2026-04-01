import { db } from "@/lib/db";
import {
  lessonBookings,
  proProfiles,
  proLocations,
  locations,
} from "@/lib/db/schema";
import { eq, and, gte, asc } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import { redirect } from "next/navigation";
import Link from "next/link";

export const metadata = { title: "Dashboard — Golf Lessons" };

export default async function MemberDashboard() {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    redirect("/login");
  }
  const locale = await getLocale();

  const today = new Date().toISOString().split("T")[0];

  // Fetch upcoming bookings
  const upcomingBookings = await db
    .select({
      id: lessonBookings.id,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      proName: proProfiles.displayName,
      proSlug: proProfiles.slug,
      locationName: locations.name,
    })
    .from(lessonBookings)
    .innerJoin(proProfiles, eq(lessonBookings.proProfileId, proProfiles.id))
    .innerJoin(
      proLocations,
      eq(lessonBookings.proLocationId, proLocations.id)
    )
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(
      and(
        eq(lessonBookings.bookedById, session.userId),
        eq(lessonBookings.status, "confirmed"),
        gte(lessonBookings.date, today)
      )
    )
    .orderBy(asc(lessonBookings.date), asc(lessonBookings.startTime))
    .limit(5);

  // Get bookable pros for the CTA
  const bookablePros = await db
    .select({
      slug: proProfiles.slug,
      displayName: proProfiles.displayName,
      photoUrl: proProfiles.photoUrl,
      specialties: proProfiles.specialties,
    })
    .from(proProfiles)
    .where(
      and(eq(proProfiles.published, true), eq(proProfiles.bookingEnabled, true))
    )
    .limit(6);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-900">
        {t("member.welcome", locale)}
      </h1>
      <p className="mt-2 text-green-700">{session.email}</p>

      {/* Upcoming bookings */}
      <div className="mt-8 rounded-xl border border-green-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-medium text-green-800">
            {t("member.yourLessons", locale)}
          </h2>
          {upcomingBookings.length > 0 && (
            <Link
              href="/member/bookings"
              className="text-sm text-gold-600 hover:text-gold-500"
            >
              View all
            </Link>
          )}
        </div>

        {upcomingBookings.length === 0 ? (
          <p className="mt-2 text-sm text-green-600">
            {t("member.noLessons", locale)}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {upcomingBookings.map((booking) => (
              <div
                key={booking.id}
                className="flex items-center justify-between rounded-lg border border-green-100 p-3"
              >
                <div>
                  <div className="text-sm font-medium text-green-900">
                    {new Date(
                      booking.date + "T00:00:00"
                    ).toLocaleDateString("en-US", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                    {" "}
                    {booking.startTime} - {booking.endTime}
                  </div>
                  <div className="text-xs text-green-600">
                    with {booking.proName} at {booking.locationName}
                  </div>
                </div>
                <Link
                  href="/member/bookings"
                  className="text-xs text-gold-600 hover:text-gold-500"
                >
                  Details
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Book a lesson CTA */}
      {bookablePros.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 font-display text-xl font-medium text-green-800">
            Book a lesson
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bookablePros.map((pro) => (
              <Link
                key={pro.slug}
                href={`/member/book/${pro.slug}`}
                className="rounded-xl border border-green-200 bg-white p-4 transition-all hover:border-gold-400 hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  {pro.photoUrl ? (
                    <img
                      src={pro.photoUrl}
                      alt={pro.displayName}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-sm font-medium text-green-600">
                      {pro.displayName.charAt(0)}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium text-green-900">
                      {pro.displayName}
                    </div>
                    {pro.specialties && (
                      <div className="text-xs text-green-500">
                        {pro.specialties}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
