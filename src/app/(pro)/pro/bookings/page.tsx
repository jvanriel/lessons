import { db } from "@/lib/db";
import {
  lessonBookings,
  lessonParticipants,
  proLocations,
  locations,
  users,
} from "@/lib/db/schema";
import { eq, and, gte, asc, desc } from "drizzle-orm";
import { requireProProfile } from "@/lib/pro";
import { redirect } from "next/navigation";
import Link from "next/link";

export const metadata = { title: "Bookings — Golf Lessons" };

export default async function ProBookingsPage() {
  const { profile } = await requireProProfile();
  if (!profile) redirect("/login");

  const today = new Date().toISOString().split("T")[0];

  const bookings = await db
    .select({
      id: lessonBookings.id,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      status: lessonBookings.status,
      participantCount: lessonBookings.participantCount,
      notes: lessonBookings.notes,
      studentFirstName: users.firstName,
      studentLastName: users.lastName,
      studentEmail: users.email,
      locationName: locations.name,
      locationCity: locations.city,
    })
    .from(lessonBookings)
    .innerJoin(users, eq(lessonBookings.bookedById, users.id))
    .innerJoin(
      proLocations,
      eq(lessonBookings.proLocationId, proLocations.id)
    )
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(lessonBookings.proProfileId, profile.id))
    .orderBy(asc(lessonBookings.date), asc(lessonBookings.startTime));

  const upcoming = bookings.filter(
    (b) => b.status === "confirmed" && b.date >= today
  );
  const past = bookings.filter(
    (b) => b.date < today || b.status !== "confirmed"
  );

  // Group upcoming by date
  const upcomingByDate = upcoming.reduce<
    Record<string, typeof upcoming>
  >((acc, b) => {
    if (!acc[b.date]) acc[b.date] = [];
    acc[b.date].push(b);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold text-green-900">
          Bookings
        </h1>
        <Link
          href="/pro/availability"
          className="rounded-md border border-green-200 bg-white px-4 py-2 text-sm font-medium text-green-800 transition-colors hover:border-green-300"
        >
          Manage availability
        </Link>
      </div>

      {/* Upcoming */}
      <section>
        <h2 className="mb-4 font-display text-xl font-medium text-green-800">
          Upcoming lessons
        </h2>
        {upcoming.length === 0 ? (
          <div className="rounded-xl border border-green-200 bg-white p-6 text-center">
            <p className="text-sm text-green-500">No upcoming bookings.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(upcomingByDate).map(([date, dateBookings]) => (
              <div key={date}>
                <h3 className="mb-2 text-sm font-medium text-green-600">
                  {new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </h3>
                <div className="space-y-2">
                  {dateBookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="rounded-xl border border-green-200 bg-white p-4 transition-colors hover:border-green-300"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-green-900">
                              {booking.startTime} - {booking.endTime}
                            </span>
                            <span className="rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                              {booking.status}
                            </span>
                          </div>
                          <div className="mt-1 text-sm text-green-700">
                            {booking.studentFirstName}{" "}
                            {booking.studentLastName}
                            <span className="ml-1 text-green-500">
                              ({booking.studentEmail})
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-green-500">
                            {booking.locationName}
                            {booking.locationCity &&
                              `, ${booking.locationCity}`}
                            {booking.participantCount > 1 &&
                              ` - ${booking.participantCount} participants`}
                          </div>
                          {booking.notes && (
                            <div className="mt-1 text-xs text-green-400 italic">
                              {booking.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
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
            <div className="mt-4 space-y-2">
              {past.map((booking) => (
                <div
                  key={booking.id}
                  className="rounded-xl border border-green-100 bg-green-50/50 p-4 opacity-75"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-green-800">
                        {booking.date} {booking.startTime} - {booking.endTime}
                      </span>
                      <span className="ml-2 text-sm text-green-600">
                        {booking.studentFirstName} {booking.studentLastName}
                      </span>
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
