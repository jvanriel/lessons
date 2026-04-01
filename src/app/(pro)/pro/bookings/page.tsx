import { db } from "@/lib/db";
import {
  lessonBookings,
  proLocations,
  proAvailability,
  locations,
  users,
} from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { requireProProfile } from "@/lib/pro";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookingsCalendar } from "./BookingsCalendar";

export const metadata = { title: "Bookings — Golf Lessons" };

export default async function ProBookingsPage() {
  const { profile } = await requireProProfile();
  if (!profile) redirect("/login");

  const [bookings, availability] = await Promise.all([
    db
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
        studentPhone: users.phone,
        locationName: locations.name,
        locationCity: locations.city,
        proLocationId: lessonBookings.proLocationId,
      })
      .from(lessonBookings)
      .innerJoin(users, eq(lessonBookings.bookedById, users.id))
      .innerJoin(
        proLocations,
        eq(lessonBookings.proLocationId, proLocations.id)
      )
      .innerJoin(locations, eq(proLocations.locationId, locations.id))
      .where(eq(lessonBookings.proProfileId, profile.id))
      .orderBy(asc(lessonBookings.date), asc(lessonBookings.startTime)),

    db
      .select({
        dayOfWeek: proAvailability.dayOfWeek,
        startTime: proAvailability.startTime,
        endTime: proAvailability.endTime,
        proLocationId: proAvailability.proLocationId,
      })
      .from(proAvailability)
      .where(eq(proAvailability.proProfileId, profile.id))
      .orderBy(proAvailability.dayOfWeek, proAvailability.startTime),
  ]);

  const today = new Date().toISOString().split("T")[0];
  const past = bookings.filter(
    (b) => b.date < today || b.status !== "confirmed"
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
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

      {/* Calendar view */}
      <section className="mb-10">
        <BookingsCalendar bookings={bookings} availability={availability} />
      </section>

      {/* Past & cancelled */}
      {past.length > 0 && (
        <section>
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
