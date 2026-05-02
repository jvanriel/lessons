import { db } from "@/lib/db";
import { lessonBookings, proStudents } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { jsDayToIso } from "@/lib/lesson-slots";

/**
 * Silently learn/refresh the student's scheduling preferences on the
 * pro_students row, based on the booking they just made plus up to the
 * last 3 earlier confirmed bookings with this pro.
 *
 * - `preferredLocationId` / `preferredDuration` / `preferredDayOfWeek` /
 *   `preferredTime` are set to the values from the current booking.
 * - `preferredInterval` is inferred from the average gap between the
 *   last 2-4 confirmed bookings (weekly / biweekly / monthly), and is
 *   only written when we can classify it cleanly. First booking leaves
 *   it null.
 *
 * Meant to run as a fire-and-forget after every successful booking.
 * Errors are swallowed by the caller — preference drift is not worth
 * failing a booking over.
 */
export async function updateBookingPreferences(
  userId: number,
  proProfileId: number,
  proLocationId: number,
  duration: number,
  date: string,
  startTime: string
): Promise<void> {
  const dayOfWeek = jsDayToIso(new Date(date + "T00:00:00").getDay());

  const recentBookings = await db
    .select({ date: lessonBookings.date })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.bookedById, userId),
        eq(lessonBookings.proProfileId, proProfileId),
        eq(lessonBookings.status, "confirmed")
      )
    )
    .orderBy(desc(lessonBookings.date))
    .limit(4);

  let interval: string | null = null;

  if (recentBookings.length >= 2) {
    const gaps: number[] = [];
    for (let i = 0; i < recentBookings.length - 1 && i < 3; i++) {
      const d1 = new Date(recentBookings[i].date + "T00:00:00");
      const d2 = new Date(recentBookings[i + 1].date + "T00:00:00");
      const diffDays = Math.round(
        (d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)
      );
      gaps.push(diffDays);
    }
    const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
    if (avgGap >= 6 && avgGap <= 8) interval = "weekly";
    else if (avgGap >= 13 && avgGap <= 15) interval = "biweekly";
    else if (avgGap >= 27 && avgGap <= 32) interval = "monthly";
  }

  await db
    .update(proStudents)
    .set({
      preferredLocationId: proLocationId,
      preferredDuration: duration,
      preferredDayOfWeek: dayOfWeek,
      preferredTime: startTime,
      ...(interval !== null ? { preferredInterval: interval } : {}),
    })
    .where(
      and(
        eq(proStudents.userId, userId),
        eq(proStudents.proProfileId, proProfileId)
      )
    );
}
