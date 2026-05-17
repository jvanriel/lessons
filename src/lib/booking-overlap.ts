/**
 * Cross-pro double-booking guard for a student. (task 143)
 *
 * Before this helper, a student could book a lesson with Pro A at
 * 14:00–15:00 and then book another lesson with Pro B at 14:30–15:30
 * — the booking flow only checked per-pro/per-location slot
 * availability, never the student's own confirmed-bookings calendar
 * across pros. Nadine flagged this; the helper plugs the gap.
 *
 * Used by every booking-create + booking-edit path:
 *   - createPublicBooking (public /book/[proId])
 *   - createBooking + quickCreateBooking (member /member/book)
 *   - proQuickBookForStudent (pro creates on student's behalf)
 *   - updateBooking (member edits own booking)
 *   - proUpdateBooking (pro edits a booking it owns)
 *
 * Half-open intervals: a 10:00–11:00 lesson followed by an 11:00–
 * 12:00 lesson does NOT overlap. Matches the existing
 * `isSlotTakenByOther` convention so back-to-back lessons across
 * pros remain allowed (e.g., golf-school morning + private-pro
 * afternoon).
 */

import { db } from "./db";
import { lessonBookings, proProfiles } from "./db/schema";
import { and, eq, gt, lt, ne } from "drizzle-orm";

export interface StudentOverlap {
  bookingId: number;
  date: string;
  startTime: string;
  endTime: string;
}

export async function findStudentOverlap(params: {
  userId: number;
  date: string;
  startTime: string;
  endTime: string;
  /** Edit path: exclude the booking being edited from the check so
   *  it doesn't conflict with itself. Undefined for create paths. */
  excludeBookingId?: number;
}): Promise<StudentOverlap | null> {
  const conds = [
    eq(lessonBookings.bookedById, params.userId),
    eq(lessonBookings.date, params.date),
    eq(lessonBookings.status, "confirmed"),
    lt(lessonBookings.startTime, params.endTime),
    gt(lessonBookings.endTime, params.startTime),
  ];
  if (params.excludeBookingId != null) {
    conds.push(ne(lessonBookings.id, params.excludeBookingId));
  }
  const [row] = await db
    .select({
      bookingId: lessonBookings.id,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
    })
    .from(lessonBookings)
    .innerJoin(proProfiles, eq(lessonBookings.proProfileId, proProfiles.id))
    .where(and(...conds))
    .limit(1);
  return row ?? null;
}
