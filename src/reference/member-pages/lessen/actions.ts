"use server";

import { eq, and, gte, lte, asc, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  proProfiles,
  proLocations,
  proAvailability,
  proAvailabilityOverrides,
  lessonBookings,
  lessonParticipants,
  locations,
  users,
} from "@/lib/db/schema";
import { getSession, hasRole } from "@/lib/auth";
import { addDays, format } from "date-fns";
import crypto from "crypto";
import { sendEmail } from "@/lib/mail";
import { emailLayout } from "@/lib/email-templates";
import { computeAvailableSlots, buildIcs, buildCancelIcs, formatDateNl, checkCancellationAllowed } from "@/lib/lesson-slots";
import { notifyProNewBooking, notifyProCancellation } from "@/lib/lesson-notifications";

// ─── Types ───────────────────────────────────────────

export interface AvailableSlot {
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
}

export interface BookablePro {
  proProfileId: number;
  slug: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  priceIndication: string | null;
  lessonDurations: number[];
  maxGroupSize: number;
  locations: Array<{
    proLocationId: number;
    locationName: string;
    priceIndication: string | null;
  }>;
}

export interface AvailableDate {
  date: string; // YYYY-MM-DD
}

// ─── Server Actions ──────────────────────────────────

async function requireMember() {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function getBookablePros(): Promise<BookablePro[]> {
  const session = await getSession();
  const isAdmin = session && hasRole(session, "admin");

  // Get all pros with bookingEnabled + at least 1 active location
  // Hide dummy pro from regular members; admins can see it for testing
  const rows = await db
    .select({
      proProfileId: proProfiles.id,
      slug: proProfiles.slug,
      photoUrl: proProfiles.photoUrl,
      priceIndication: proProfiles.priceIndication,
      lessonDurations: proProfiles.lessonDurations,
      maxGroupSize: proProfiles.maxGroupSize,
      firstName: users.firstName,
      lastName: users.lastName,
      proLocationId: proLocations.id,
      locationName: locations.name,
      locationPriceIndication: proLocations.priceIndication,
    })
    .from(proProfiles)
    .innerJoin(users, eq(proProfiles.userId, users.id))
    .innerJoin(proLocations, and(
      eq(proLocations.proProfileId, proProfiles.id),
      eq(proLocations.active, true),
    ))
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(and(
      eq(proProfiles.bookingEnabled, true),
      ...(!isAdmin ? [ne(users.email, "dummy.pro@silverswing.golf")] : []),
    ))
    .orderBy(asc(users.firstName));

  // Group by pro
  const map = new Map<number, BookablePro>();
  for (const r of rows) {
    if (!map.has(r.proProfileId)) {
      map.set(r.proProfileId, {
        proProfileId: r.proProfileId,
        slug: r.slug,
        firstName: r.firstName,
        lastName: r.lastName,
        photoUrl: r.photoUrl,
        priceIndication: r.priceIndication,
        lessonDurations: r.lessonDurations as number[],
        maxGroupSize: r.maxGroupSize,
        locations: [],
      });
    }
    map.get(r.proProfileId)!.locations.push({
      proLocationId: r.proLocationId,
      locationName: r.locationName,
      priceIndication: r.locationPriceIndication,
    });
  }

  return Array.from(map.values());
}

export async function getAvailableDates(
  proProfileId: number,
  proLocationId: number,
): Promise<AvailableDate[]> {
  await requireMember();

  const [profile] = await db
    .select({
      bookingNotice: proProfiles.bookingNotice,
      bookingHorizon: proProfiles.bookingHorizon,
      lessonDurations: proProfiles.lessonDurations,
    })
    .from(proProfiles)
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);

  if (!profile) return [];

  const today = new Date();
  const startDate = today; // Start from today; time-level filtering handles bookingNotice
  const endDate = addDays(today, profile.bookingHorizon);
  const startStr = format(startDate, "yyyy-MM-dd");
  const endStr = format(endDate, "yyyy-MM-dd");

  const [templates, overrides, bookings] = await Promise.all([
    db
      .select({
        dayOfWeek: proAvailability.dayOfWeek,
        startTime: proAvailability.startTime,
        endTime: proAvailability.endTime,
        validFrom: proAvailability.validFrom,
        validUntil: proAvailability.validUntil,
      })
      .from(proAvailability)
      .where(
        and(
          eq(proAvailability.proProfileId, proProfileId),
          eq(proAvailability.proLocationId, proLocationId),
        ),
      ),
    db
      .select({
        date: proAvailabilityOverrides.date,
        type: proAvailabilityOverrides.type,
        startTime: proAvailabilityOverrides.startTime,
        endTime: proAvailabilityOverrides.endTime,
        proLocationId: proAvailabilityOverrides.proLocationId,
      })
      .from(proAvailabilityOverrides)
      .where(
        and(
          eq(proAvailabilityOverrides.proProfileId, proProfileId),
          gte(proAvailabilityOverrides.date, startStr),
          lte(proAvailabilityOverrides.date, endStr),
        ),
      ),
    db
      .select({
        date: lessonBookings.date,
        startTime: lessonBookings.startTime,
        endTime: lessonBookings.endTime,
      })
      .from(lessonBookings)
      .where(
        and(
          eq(lessonBookings.proProfileId, proProfileId),
          eq(lessonBookings.proLocationId, proLocationId),
          gte(lessonBookings.date, startStr),
          lte(lessonBookings.date, endStr),
          ne(lessonBookings.status, "cancelled"),
        ),
      ),
  ]);

  // Use shortest duration to check if any slot fits
  const durations = profile.lessonDurations as number[];
  const minDuration = Math.min(...durations);

  const availableDates: AvailableDate[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    const dateStr = format(cursor, "yyyy-MM-dd");

    // Filter overrides for this date (matching location or global)
    const dayOverrides = overrides.filter(
      (o) => o.date === dateStr && (o.proLocationId === proLocationId || o.proLocationId === null),
    );
    const dayBookings = bookings.filter((b) => b.date === dateStr);

    const slots = computeAvailableSlots(
      dateStr,
      templates,
      dayOverrides,
      dayBookings,
      profile.bookingNotice,
      minDuration,
    );

    if (slots.length > 0) {
      availableDates.push({ date: dateStr });
    }

    cursor = addDays(cursor, 1);
  }

  return availableDates;
}

export async function getAvailableSlots(
  proProfileId: number,
  proLocationId: number,
  date: string,
  duration: number,
): Promise<AvailableSlot[]> {
  await requireMember();

  const [profile] = await db
    .select({
      bookingNotice: proProfiles.bookingNotice,
    })
    .from(proProfiles)
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);

  if (!profile) return [];

  const [templates, overrides, bookings] = await Promise.all([
    db
      .select({
        dayOfWeek: proAvailability.dayOfWeek,
        startTime: proAvailability.startTime,
        endTime: proAvailability.endTime,
        validFrom: proAvailability.validFrom,
        validUntil: proAvailability.validUntil,
      })
      .from(proAvailability)
      .where(
        and(
          eq(proAvailability.proProfileId, proProfileId),
          eq(proAvailability.proLocationId, proLocationId),
        ),
      ),
    db
      .select({
        type: proAvailabilityOverrides.type,
        startTime: proAvailabilityOverrides.startTime,
        endTime: proAvailabilityOverrides.endTime,
        proLocationId: proAvailabilityOverrides.proLocationId,
      })
      .from(proAvailabilityOverrides)
      .where(
        and(
          eq(proAvailabilityOverrides.proProfileId, proProfileId),
          eq(proAvailabilityOverrides.date, date),
        ),
      ),
    db
      .select({
        startTime: lessonBookings.startTime,
        endTime: lessonBookings.endTime,
      })
      .from(lessonBookings)
      .where(
        and(
          eq(lessonBookings.proProfileId, proProfileId),
          eq(lessonBookings.proLocationId, proLocationId),
          eq(lessonBookings.date, date),
          ne(lessonBookings.status, "cancelled"),
        ),
      ),
  ]);

  const dayOverrides = overrides.filter(
    (o) => o.proLocationId === proLocationId || o.proLocationId === null,
  );

  return computeAvailableSlots(
    date,
    templates,
    dayOverrides,
    bookings,
    profile.bookingNotice,
    duration,
  );
}

export async function createBooking(data: {
  proProfileId: number;
  proLocationId: number;
  date: string;
  startTime: string;
  duration: number;
  participantCount: number;
  participants: Array<{ firstName: string; lastName: string; email?: string; phone?: string }>;
  notes?: string;
}): Promise<{ bookingId?: number; error?: string }> {
  const session = await requireMember();

  // Re-validate that the slot is still available
  const slots = await getAvailableSlots(
    data.proProfileId,
    data.proLocationId,
    data.date,
    data.duration,
  );

  const matchingSlot = slots.find((s) => s.startTime === data.startTime);
  if (!matchingSlot) {
    return { error: "Dit tijdstip is helaas niet meer beschikbaar. Kies een ander tijdstip." };
  }

  // Validate participant count against maxGroupSize
  const [profile] = await db
    .select({ maxGroupSize: proProfiles.maxGroupSize })
    .from(proProfiles)
    .where(eq(proProfiles.id, data.proProfileId))
    .limit(1);

  if (!profile) return { error: "Pro niet gevonden." };

  if (data.participantCount > profile.maxGroupSize) {
    return { error: `Maximaal ${profile.maxGroupSize} deelnemers per les.` };
  }

  const manageToken = crypto.randomBytes(32).toString("hex");

  // Fetch pro name + location name for confirmation email
  const [proInfo] = await db
    .select({
      proFirstName: users.firstName,
      proLastName: users.lastName,
      locationName: locations.name,
    })
    .from(proProfiles)
    .innerJoin(users, eq(proProfiles.userId, users.id))
    .innerJoin(proLocations, eq(proLocations.id, data.proLocationId))
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(proProfiles.id, data.proProfileId))
    .limit(1);

  const [booker] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const [booking] = await db
    .insert(lessonBookings)
    .values({
      proProfileId: data.proProfileId,
      bookedById: session.userId,
      proLocationId: data.proLocationId,
      date: data.date,
      startTime: data.startTime,
      endTime: matchingSlot.endTime,
      participantCount: data.participantCount,
      notes: data.notes?.trim() || null,
      manageToken,
    })
    .returning({ id: lessonBookings.id });

  // Insert participants
  if (data.participants.length > 0) {
    await db.insert(lessonParticipants).values(
      data.participants.map((p) => ({
        bookingId: booking.id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email || null,
        phone: p.phone || null,
      })),
    );
  }

  // ── Send confirmation email with .ics attachment ──
  if (booker && proInfo) {
    const proName = `${proInfo.proFirstName} ${proInfo.proLastName}`;
    const locationName = proInfo.locationName;
    const dateFormatted = formatDateNl(data.date);

    const icsContent = buildIcs({
      date: data.date,
      startTime: data.startTime,
      endTime: matchingSlot.endTime,
      summary: `Golfles met ${proName}`,
      location: locationName,
      description: [
        `Golfles bij ${proName}`,
        `Locatie: ${locationName}`,
        `Deelnemers: ${data.participantCount}`,
        ...(data.notes ? [`Opmerkingen: ${data.notes}`] : []),
      ].join("\\n"),
      bookingId: booking.id,
    });

    const htmlBody = `
      <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#091a12;margin:0 0 16px;">
        Je golfles is bevestigd
      </h2>
      <p>Beste ${booker.firstName},</p>
      <p>Je les is succesvol geboekt. Hier zijn de details:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;width:100%;">
        <tr>
          <td style="padding:8px 0;color:#8a9b8f;width:120px;">Pro</td>
          <td style="padding:8px 0;font-weight:600;">${proName}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#8a9b8f;">Locatie</td>
          <td style="padding:8px 0;font-weight:600;">${locationName}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#8a9b8f;">Datum</td>
          <td style="padding:8px 0;font-weight:600;">${dateFormatted}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#8a9b8f;">Tijd</td>
          <td style="padding:8px 0;font-weight:600;">${data.startTime} – ${matchingSlot.endTime}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#8a9b8f;">Duur</td>
          <td style="padding:8px 0;font-weight:600;">${data.duration} minuten</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#8a9b8f;">Deelnemers</td>
          <td style="padding:8px 0;font-weight:600;">${data.participantCount}</td>
        </tr>
        ${data.notes ? `<tr><td style="padding:8px 0;color:#8a9b8f;">Opmerking</td><td style="padding:8px 0;">${data.notes}</td></tr>` : ""}
      </table>
      <p style="font-size:13px;color:#8a9b8f;">
        Er is een agenda-uitnodiging (.ics) bijgevoegd die je kunt importeren in je agenda.
      </p>
    `;

    sendEmail({
      to: booker.email,
      subject: `Bevestiging: golfles met ${proName} op ${dateFormatted}`,
      html: (unsubscribeUrl) => emailLayout(htmlBody, unsubscribeUrl),
      userId: session.userId,
      attachments: [
        {
          filename: "golfles.ics",
          content: icsContent,
          contentType: "text/calendar; method=REQUEST",
        },
      ],
    }).catch((err) => {
      console.error("Failed to send booking confirmation email:", err);
    });
  }

  // Notify pro (fire-and-forget)
  notifyProNewBooking(booking.id).catch((err) => {
    console.error("Failed to notify pro of new booking:", err);
  });

  return { bookingId: booking.id };
}

// ─── My Bookings ────────────────────────────────────

export interface MyBooking {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  participantCount: number;
  notes: string | null;
  status: string;
  proFirstName: string;
  proLastName: string;
  locationName: string;
  canCancel: boolean;
  cancellationDeadline: string | null;
}

export async function getMyBookings(): Promise<MyBooking[]> {
  const session = await requireMember();
  const today = format(new Date(), "yyyy-MM-dd");

  const rows = await db
    .select({
      id: lessonBookings.id,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      participantCount: lessonBookings.participantCount,
      notes: lessonBookings.notes,
      status: lessonBookings.status,
      cancellationHours: proProfiles.cancellationHours,
      proFirstName: users.firstName,
      proLastName: users.lastName,
      locationName: locations.name,
    })
    .from(lessonBookings)
    .innerJoin(proProfiles, eq(lessonBookings.proProfileId, proProfiles.id))
    .innerJoin(users, eq(proProfiles.userId, users.id))
    .innerJoin(proLocations, eq(lessonBookings.proLocationId, proLocations.id))
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(
      and(
        eq(lessonBookings.bookedById, session.userId),
        gte(lessonBookings.date, today),
      ),
    )
    .orderBy(asc(lessonBookings.date), asc(lessonBookings.startTime));

  return rows.map((r) => {
    const { canCancel, deadline } = checkCancellationAllowed(
      r.date, r.startTime, r.cancellationHours, r.status,
    );

    return {
      id: r.id,
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
      participantCount: r.participantCount,
      notes: r.notes,
      status: r.status,
      proFirstName: r.proFirstName,
      proLastName: r.proLastName,
      locationName: r.locationName,
      canCancel,
      cancellationDeadline: canCancel ? deadline.toISOString() : null,
    };
  });
}

export async function cancelBooking(
  bookingId: number,
  reason?: string,
): Promise<{ error?: string }> {
  const session = await requireMember();

  // Fetch booking + pro info
  const [booking] = await db
    .select({
      id: lessonBookings.id,
      bookedById: lessonBookings.bookedById,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      status: lessonBookings.status,
      proProfileId: lessonBookings.proProfileId,
      proLocationId: lessonBookings.proLocationId,
      cancellationHours: proProfiles.cancellationHours,
    })
    .from(lessonBookings)
    .innerJoin(proProfiles, eq(lessonBookings.proProfileId, proProfiles.id))
    .where(eq(lessonBookings.id, bookingId))
    .limit(1);

  if (!booking) return { error: "Boeking niet gevonden." };
  if (booking.bookedById !== session.userId) return { error: "Niet geautoriseerd." };
  if (booking.status === "cancelled") return { error: "Deze boeking is al geannuleerd." };

  // Check cancellation deadline
  const lessonStart = new Date(`${booking.date}T${booking.startTime}:00`);
  const deadline = new Date(lessonStart.getTime() - booking.cancellationHours * 60 * 60 * 1000);
  if (new Date() >= deadline) {
    return { error: `Annuleren is niet meer mogelijk (deadline: ${booking.cancellationHours} uur voor aanvang).` };
  }

  // Update booking status
  await db
    .update(lessonBookings)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: reason?.trim() || null,
    })
    .where(eq(lessonBookings.id, bookingId));

  // Send cancel ICS email to booker
  const [booker] = await db
    .select({ firstName: users.firstName, email: users.email })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const [proInfo] = await db
    .select({
      proFirstName: users.firstName,
      proLastName: users.lastName,
      locationName: locations.name,
    })
    .from(proProfiles)
    .innerJoin(users, eq(proProfiles.userId, users.id))
    .innerJoin(proLocations, eq(proLocations.id, booking.proLocationId))
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(proProfiles.id, booking.proProfileId))
    .limit(1);

  if (booker && proInfo) {
    const proName = `${proInfo.proFirstName} ${proInfo.proLastName}`;
    const dateFormatted = formatDateNl(booking.date);

    const icsContent = buildCancelIcs({
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      summary: `Golfles met ${proName}`,
      location: proInfo.locationName,
      description: `Geannuleerd: golfles bij ${proName}`,
      bookingId: booking.id,
    });

    const htmlBody = `
      <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#091a12;margin:0 0 16px;">
        Je golfles is geannuleerd
      </h2>
      <p>Beste ${booker.firstName},</p>
      <p>Je golfles met ${proName} op ${dateFormatted} (${booking.startTime} – ${booking.endTime}) bij ${proInfo.locationName} is geannuleerd.</p>
      ${reason ? `<p><strong>Reden:</strong> ${reason}</p>` : ""}
    `;

    sendEmail({
      to: booker.email,
      subject: `Geannuleerd: golfles met ${proName} op ${dateFormatted}`,
      html: (unsubscribeUrl) => emailLayout(htmlBody, unsubscribeUrl),
      userId: session.userId,
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

  // Notify pro
  notifyProCancellation(bookingId, reason).catch((err) => {
    console.error("Failed to notify pro of cancellation:", err);
  });

  return {};
}
