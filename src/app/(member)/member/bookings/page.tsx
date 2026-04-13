import { db } from "@/lib/db";
import {
  lessonBookings,
  proProfiles,
  proLocations,
  locations,
} from "@/lib/db/schema";
import { eq, and, gte, lt, or, desc, asc } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CancelBookingButton } from "./CancelBookingButton";
import { BookingRefreshListener } from "@/components/BookingRefreshListener";

export const metadata = { title: "My Bookings — Golf Lessons" };

export default async function MemberBookingsPage() {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    redirect("/login");
  }

  const today = new Date().toISOString().split("T")[0];

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
      proSlug: proProfiles.slug,
      locationName: locations.name,
      locationCity: locations.city,
      cancellationHours: proProfiles.cancellationHours,
    })
    .from(lessonBookings)
    .innerJoin(proProfiles, eq(lessonBookings.proProfileId, proProfiles.id))
    .innerJoin(
      proLocations,
      eq(lessonBookings.proLocationId, proLocations.id)
    )
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(lessonBookings.bookedById, session.userId))
    .orderBy(asc(lessonBookings.date), asc(lessonBookings.startTime));

  const upcoming = allBookings.filter(
    (b) => b.status === "confirmed" && b.date >= today
  );
  const past = allBookings.filter(
    (b) => b.date < today || b.status !== "confirmed"
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <BookingRefreshListener />
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold text-green-900">
          My Bookings
        </h1>
        <Link
          href="/member/dashboard"
          className="rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-500"
        >
          Book a lesson
        </Link>
      </div>

      {/* Upcoming */}
      <section>
        <h2 className="mb-4 font-display text-xl font-medium text-green-800">
          Upcoming lessons
        </h2>
        {upcoming.length === 0 ? (
          <div className="rounded-xl border border-green-200 bg-white p-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
            </div>
            <h3 className="font-display text-lg font-medium text-green-900">
              No upcoming lessons
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-green-600">
              Browse our pros and book your first lesson — it only takes a minute.
            </p>
            <Link
              href="/pros"
              className="mt-5 inline-block rounded-md bg-gold-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-500"
            >
              Browse pros
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
                      {new Date(
                        booking.date + "T00:00:00"
                      ).toLocaleDateString("en-US", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </div>
                    <div className="mt-0.5 text-sm text-green-700">
                      {booking.startTime} - {booking.endTime}
                    </div>
                    <div className="mt-1 text-sm text-green-600">
                      with{" "}
                      <span className="font-medium">{booking.proName}</span> at{" "}
                      {booking.locationName}
                      {booking.locationCity && `, ${booking.locationCity}`}
                    </div>
                    {booking.participantCount > 1 && (
                      <div className="mt-0.5 text-xs text-green-500">
                        {booking.participantCount} participants
                      </div>
                    )}
                  </div>
                  <CancelBookingButton
                    bookingId={booking.id}
                    date={booking.date}
                    startTime={booking.startTime}
                    cancellationHours={booking.cancellationHours}
                  />
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
              Past &amp; cancelled ({past.length})
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
                        {new Date(
                          booking.date + "T00:00:00"
                        ).toLocaleDateString("en-US", {
                          weekday: "short",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </div>
                      <div className="text-sm text-green-600">
                        {booking.startTime} - {booking.endTime} with{" "}
                        {booking.proName}
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
                        ? "Cancelled"
                        : "Completed"}
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
