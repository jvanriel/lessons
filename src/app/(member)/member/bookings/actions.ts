"use server";

import { db } from "@/lib/db";
import {
  lessonBookings,
  proProfiles,
  users,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { checkCancellationAllowed } from "@/lib/lesson-slots";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function cancelBooking(bookingId: number) {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    redirect("/login");
  }

  // Fetch the booking
  const [booking] = await db
    .select()
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.id, bookingId),
        eq(lessonBookings.bookedById, session.userId)
      )
    )
    .limit(1);

  if (!booking) {
    return { error: "Booking not found." };
  }

  // Get pro's cancellation policy
  const [pro] = await db
    .select({
      cancellationHours: proProfiles.cancellationHours,
      userId: proProfiles.userId,
      displayName: proProfiles.displayName,
    })
    .from(proProfiles)
    .where(eq(proProfiles.id, booking.proProfileId))
    .limit(1);

  if (!pro) {
    return { error: "Pro not found." };
  }

  const check = checkCancellationAllowed(
    booking.date,
    booking.startTime,
    pro.cancellationHours,
    booking.status
  );

  if (!check.canCancel) {
    return {
      error: `Cancellation is no longer allowed. The deadline was ${check.deadline.toLocaleString("en-US")}.`,
    };
  }

  // Cancel the booking
  await db
    .update(lessonBookings)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: "Cancelled by student",
      updatedAt: new Date(),
    })
    .where(eq(lessonBookings.id, bookingId));

  // Get student name for the notification
  const [student] = await db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const studentName = student
    ? `${student.firstName} ${student.lastName}`
    : "A student";

  // Notify the pro
  await createNotification({
    type: "booking_cancelled",
    priority: "high",
    targetUserId: pro.userId,
    title: "Booking cancelled",
    message: `${studentName} cancelled the lesson on ${booking.date} at ${booking.startTime}.`,
    actionUrl: "/pro/bookings",
    actionLabel: "View bookings",
  });

  revalidatePath("/member/bookings");
  return { success: true };
}
