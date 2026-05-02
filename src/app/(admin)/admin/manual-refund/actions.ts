"use server";

import { db } from "@/lib/db";
import { lessonBookings, users, proProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/**
 * Mark a booking as refunded out-of-band — the admin's escape hatch
 * when `stripe.refunds.create` failed (network, already-refunded,
 * payment too old) and the refund had to be reconciled manually in
 * the Stripe dashboard. Sets `paymentStatus="refunded"` + `refundedAt`
 * and appends an audit line to `booking.notes` recording who did it,
 * when, and why. Idempotent: refusing to re-mark already-refunded
 * rows so the audit line stays accurate.
 */
export async function markAsManuallyRefunded(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session || !hasRole(session, "admin")) {
    return { error: "Unauthorized" };
  }

  const bookingId = parseInt(formData.get("bookingId") as string, 10);
  const reason = (formData.get("reason") as string)?.trim();
  if (!bookingId || isNaN(bookingId)) return { error: "Invalid booking ID" };
  if (!reason || reason.length < 4) {
    return { error: "Reason is required (4+ chars)" };
  }

  const [booking] = await db
    .select({
      id: lessonBookings.id,
      paymentStatus: lessonBookings.paymentStatus,
      notes: lessonBookings.notes,
    })
    .from(lessonBookings)
    .where(eq(lessonBookings.id, bookingId))
    .limit(1);

  if (!booking) return { error: "Booking not found" };
  if (booking.paymentStatus === "refunded") {
    return { error: "Already marked as refunded" };
  }
  // We deliberately accept `pending` too — a Stripe error during
  // initial charge can leave a row at `pending` that the admin still
  // needs to mark when the customer is refunded out-of-band.
  const allowed = new Set(["paid", "failed", "requires_action", "pending"]);
  if (!allowed.has(booking.paymentStatus)) {
    return {
      error: `Cannot mark a "${booking.paymentStatus}" booking as refunded`,
    };
  }

  const auditLine = `Manually marked refunded by ${session.email} on ${new Date()
    .toISOString()
    .slice(0, 19)
    .replace("T", " ")}: ${reason}`;
  const newNotes = booking.notes
    ? `${booking.notes}\n\n${auditLine}`
    : auditLine;

  await db
    .update(lessonBookings)
    .set({
      paymentStatus: "refunded",
      refundedAt: new Date(),
      notes: newNotes,
      updatedAt: new Date(),
    })
    .where(eq(lessonBookings.id, bookingId));

  revalidatePath("/admin/manual-refund");
  return { ok: true };
}

export async function lookupBookingForRefund(bookingId: number) {
  const session = await getSession();
  if (!session || !hasRole(session, "admin")) return null;

  const [row] = await db
    .select({
      id: lessonBookings.id,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      status: lessonBookings.status,
      paymentStatus: lessonBookings.paymentStatus,
      priceCents: lessonBookings.priceCents,
      currency: lessonBookings.currency,
      stripePaymentIntentId: lessonBookings.stripePaymentIntentId,
      refundedAt: lessonBookings.refundedAt,
      paidAt: lessonBookings.paidAt,
      notes: lessonBookings.notes,
      proDisplayName: proProfiles.displayName,
      studentEmail: users.email,
      studentFirstName: users.firstName,
      studentLastName: users.lastName,
    })
    .from(lessonBookings)
    .innerJoin(proProfiles, eq(lessonBookings.proProfileId, proProfiles.id))
    .innerJoin(users, eq(lessonBookings.bookedById, users.id))
    .where(eq(lessonBookings.id, bookingId))
    .limit(1);

  return row ?? null;
}
