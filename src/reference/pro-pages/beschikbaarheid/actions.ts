"use server";

import { revalidatePath } from "next/cache";
import { eq, and, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  proProfiles,
  proLocations,
  proAvailability,
  proAvailabilityOverrides,
  lessonBookings,
  users,
  locations as locationsTable,
} from "@/lib/db/schema";
import { getSession, hasRole } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { emailLayout } from "@/lib/email-templates";
import { buildCancelIcs, formatDateNl } from "@/lib/lesson-slots";
import { notifyProCancellation } from "@/lib/lesson-notifications";

async function requireProWithProfile() {
  const session = await getSession();
  if (!session || (!hasRole(session, "pro") && !hasRole(session, "admin"))) {
    throw new Error("Unauthorized");
  }

  const [profile] = await db
    .select()
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);

  if (!profile) throw new Error("No pro profile");
  return { session, profile };
}

// ─── Serialized Types ─────────────────────────────────

export interface SerializedAvailability {
  id: number;
  proLocationId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  validFrom: string | null;
  validUntil: string | null;
}

export interface SerializedOverride {
  id: number;
  proLocationId: number | null;
  date: string;
  type: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

export interface SerializedProLocationWithName {
  id: number;
  locationName: string;
  active: boolean;
}

export interface SerializedBooking {
  id: number;
  proLocationId: number;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  participantCount: number;
  locationName: string | null;
  bookerName: string | null;
}

export interface SerializedProfileSettings {
  bookingHorizon: number;
  bookingNotice: number;
  lessonDurations: number[];
}

// ─── Bulk Save Weekly Template ──────────────────────

export async function saveWeeklyTemplate(data: {
  proLocationId: number;
  slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
}): Promise<{ error?: string }> {
  const { profile } = await requireProWithProfile();

  // Verify location belongs to this pro
  const [loc] = await db
    .select({ id: proLocations.id })
    .from(proLocations)
    .where(
      and(
        eq(proLocations.id, data.proLocationId),
        eq(proLocations.proProfileId, profile.id),
      ),
    )
    .limit(1);
  if (!loc) return { error: "Locatie niet gevonden." };

  // Validate slots
  for (const slot of data.slots) {
    if (slot.dayOfWeek < 0 || slot.dayOfWeek > 6) {
      return { error: "Ongeldige dag." };
    }
    if (slot.startTime >= slot.endTime) {
      return { error: "Eindtijd moet na starttijd liggen." };
    }
  }

  // Delete all existing availability for this location, then insert new
  await db
    .delete(proAvailability)
    .where(
      and(
        eq(proAvailability.proProfileId, profile.id),
        eq(proAvailability.proLocationId, data.proLocationId),
      ),
    );

  if (data.slots.length > 0) {
    await db.insert(proAvailability).values(
      data.slots.map((s) => ({
        proProfileId: profile.id,
        proLocationId: data.proLocationId,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
    );
  }

  revalidatePath("/pro/beschikbaarheid");
  return {};
}

// ─── Availability CRUD (kept for compatibility) ─────

export async function addAvailability(data: {
  proLocationId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  validFrom?: string;
  validUntil?: string;
}): Promise<{ error?: string }> {
  const { profile } = await requireProWithProfile();

  const [loc] = await db
    .select({ id: proLocations.id })
    .from(proLocations)
    .where(
      and(
        eq(proLocations.id, data.proLocationId),
        eq(proLocations.proProfileId, profile.id),
      ),
    )
    .limit(1);
  if (!loc) return { error: "Locatie niet gevonden." };

  if (data.startTime >= data.endTime) {
    return { error: "Eindtijd moet na starttijd liggen." };
  }

  await db.insert(proAvailability).values({
    proProfileId: profile.id,
    proLocationId: data.proLocationId,
    dayOfWeek: data.dayOfWeek,
    startTime: data.startTime,
    endTime: data.endTime,
    validFrom: data.validFrom || null,
    validUntil: data.validUntil || null,
  });

  revalidatePath("/pro/beschikbaarheid");
  return {};
}

export async function removeAvailability(id: number): Promise<void> {
  const { profile } = await requireProWithProfile();
  await db
    .delete(proAvailability)
    .where(
      and(
        eq(proAvailability.id, id),
        eq(proAvailability.proProfileId, profile.id),
      ),
    );
  revalidatePath("/pro/beschikbaarheid");
}

// ─── Bulk Save Week Overrides (blocked + extra available) ─

export async function saveWeekOverrides(data: {
  datesToReplace: string[];
  overrides: Array<{
    date: string;
    type: "blocked" | "available";
    proLocationId?: number;
    startTime?: string;
    endTime?: string;
    reason?: string;
  }>;
}): Promise<{ error?: string }> {
  const { profile } = await requireProWithProfile();

  // Delete all existing overrides for the given dates
  for (const date of data.datesToReplace) {
    await db
      .delete(proAvailabilityOverrides)
      .where(
        and(
          eq(proAvailabilityOverrides.proProfileId, profile.id),
          eq(proAvailabilityOverrides.date, date),
        ),
      );
  }

  // Insert new overrides
  if (data.overrides.length > 0) {
    await db.insert(proAvailabilityOverrides).values(
      data.overrides.map((o) => ({
        proProfileId: profile.id,
        proLocationId: o.proLocationId || null,
        date: o.date,
        type: o.type,
        startTime: o.startTime || null,
        endTime: o.endTime || null,
        reason: o.reason?.trim() || null,
      })),
    );
  }

  revalidatePath("/pro/beschikbaarheid");
  return {};
}

// ─── Overrides CRUD ──────────────────────────────────

export async function addOverride(data: {
  proLocationId?: number;
  date: string;
  type: "available" | "blocked";
  startTime?: string;
  endTime?: string;
  reason?: string;
}): Promise<{ error?: string }> {
  const { profile } = await requireProWithProfile();

  if (data.type === "available" && (!data.startTime || !data.endTime)) {
    return { error: "Start- en eindtijd zijn verplicht voor extra beschikbaarheid." };
  }

  if (data.startTime && data.endTime && data.startTime >= data.endTime) {
    return { error: "Eindtijd moet na starttijd liggen." };
  }

  await db.insert(proAvailabilityOverrides).values({
    proProfileId: profile.id,
    proLocationId: data.proLocationId || null,
    date: data.date,
    type: data.type,
    startTime: data.startTime || null,
    endTime: data.endTime || null,
    reason: data.reason?.trim() || null,
  });

  revalidatePath("/pro/beschikbaarheid");
  return {};
}

export async function removeOverride(id: number): Promise<void> {
  const { profile } = await requireProWithProfile();
  await db
    .delete(proAvailabilityOverrides)
    .where(
      and(
        eq(proAvailabilityOverrides.id, id),
        eq(proAvailabilityOverrides.proProfileId, profile.id),
      ),
    );
  revalidatePath("/pro/beschikbaarheid");
}

// ─── Save Overrides + Cancel Conflicting Bookings ────

export async function saveWeekOverridesWithCancellations(data: {
  datesToReplace: string[];
  overrides: Array<{
    date: string;
    type: "blocked" | "available";
    proLocationId?: number;
    startTime?: string;
    endTime?: string;
    reason?: string;
  }>;
  bookingIdsToCancel: number[];
}): Promise<{ error?: string }> {
  const { profile } = await requireProWithProfile();

  // Cancel affected bookings
  if (data.bookingIdsToCancel.length > 0) {
    // Verify all bookings belong to this pro
    const bookingsToCancel = await db
      .select({
        id: lessonBookings.id,
        date: lessonBookings.date,
        startTime: lessonBookings.startTime,
        endTime: lessonBookings.endTime,
        status: lessonBookings.status,
        bookedById: lessonBookings.bookedById,
        proLocationId: lessonBookings.proLocationId,
      })
      .from(lessonBookings)
      .where(
        and(
          inArray(lessonBookings.id, data.bookingIdsToCancel),
          eq(lessonBookings.proProfileId, profile.id),
          ne(lessonBookings.status, "cancelled"),
        ),
      );

    // Get pro info for emails
    const [proUser] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .innerJoin(proProfiles, eq(proProfiles.userId, users.id))
      .where(eq(proProfiles.id, profile.id))
      .limit(1);
    const proName = proUser ? `${proUser.firstName} ${proUser.lastName}` : "de pro";

    for (const booking of bookingsToCancel) {
      // Update status
      await db
        .update(lessonBookings)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          cancellationReason: "Geblokkeerd door pro",
        })
        .where(eq(lessonBookings.id, booking.id));

      // Get booker + location info for email
      const [booker] = await db
        .select({ firstName: users.firstName, email: users.email })
        .from(users)
        .where(eq(users.id, booking.bookedById))
        .limit(1);

      const [locInfo] = await db
        .select({ name: locationsTable.name })
        .from(proLocations)
        .innerJoin(locationsTable, eq(proLocations.locationId, locationsTable.id))
        .where(eq(proLocations.id, booking.proLocationId))
        .limit(1);

      const locationName = locInfo?.name || "";
      const dateFormatted = formatDateNl(booking.date);

      // Send cancellation email to booker
      if (booker) {
        const icsContent = buildCancelIcs({
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          summary: `Golfles met ${proName}`,
          location: locationName,
          description: `Geannuleerd door pro: golfles bij ${proName}`,
          bookingId: booking.id,
        });

        const htmlBody = `
          <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#091a12;margin:0 0 16px;">
            Je golfles is geannuleerd
          </h2>
          <p>Beste ${booker.firstName},</p>
          <p>Je golfles met ${proName} op ${dateFormatted} (${booking.startTime} – ${booking.endTime})${locationName ? ` bij ${locationName}` : ""} is helaas geannuleerd door de pro.</p>
          <p><strong>Reden:</strong> Tijdslot geblokkeerd</p>
        `;

        sendEmail({
          to: booker.email,
          subject: `Geannuleerd: golfles met ${proName} op ${dateFormatted}`,
          html: (unsubscribeUrl?: string) => emailLayout(htmlBody, unsubscribeUrl),
          userId: booking.bookedById,
          attachments: [
            {
              filename: "golfles-annulering.ics",
              content: icsContent,
              contentType: "text/calendar; method=CANCEL",
            },
          ],
        }).catch((err) => {
          console.error("Failed to send cancellation email:", err);
        });
      }

      // Notify pro + delete calendar event
      notifyProCancellation(booking.id, "Geblokkeerd door pro").catch((err) => {
        console.error("Failed to notify pro of cancellation:", err);
      });
    }
  }

  // Save the overrides (same logic as saveWeekOverrides)
  for (const date of data.datesToReplace) {
    await db
      .delete(proAvailabilityOverrides)
      .where(
        and(
          eq(proAvailabilityOverrides.proProfileId, profile.id),
          eq(proAvailabilityOverrides.date, date),
        ),
      );
  }

  if (data.overrides.length > 0) {
    await db.insert(proAvailabilityOverrides).values(
      data.overrides.map((o) => ({
        proProfileId: profile.id,
        proLocationId: o.proLocationId || null,
        date: o.date,
        type: o.type,
        startTime: o.startTime || null,
        endTime: o.endTime || null,
        reason: o.reason?.trim() || null,
      })),
    );
  }

  revalidatePath("/pro/beschikbaarheid");
  return {};
}
