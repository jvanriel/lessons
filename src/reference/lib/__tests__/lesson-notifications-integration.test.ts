/**
 * Integration tests for lesson email & calendar notifications.
 *
 * Uses REAL workspace accounts and Google APIs:
 * - dummy.pro@silverswing.golf — pro (receives notification emails + calendar events)
 * - claude.code@silverswing.golf (user_id=11) — booker
 * - noreply@silverswing.golf (GMAIL_SEND_AS) — sender
 *
 * All test bookings and calendar events are cleaned up in afterAll.
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, inArray } from "drizzle-orm";
import { addDays, format } from "date-fns";
import {
  lessonBookings,
  proProfiles,
  proLocations,
  proAvailability,
  proAvailabilityOverrides,
  locations,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/mail";
import { emailLayout } from "@/lib/email-templates";
import { buildIcs, buildCancelIcs, formatDateNl, computeAvailableSlots } from "@/lib/lesson-slots";
import { getGmailClient, getCalendarClient } from "@/lib/google-service-account";
import type { AvailabilityTemplate, AvailabilityOverride, ExistingBooking } from "@/lib/lesson-slots";

// ─── DB Setup ────────────────────────────────────────

const sql = neon(process.env.DB_POSTGRES_URL!);
const db = drizzle(sql);

// ─── Constants ───────────────────────────────────────

const DUMMY_PRO_PROFILE_ID = 3;
const DUMMY_PRO_LOCATION_ID = 3;
const CLAUDE_USER_ID = 11;
const DUMMY_PRO_EMAIL = "dummy.pro@silverswing.golf";
const CLAUDE_EMAIL = "claude.code@silverswing.golf";

// Track resources for cleanup
const createdBookingIds: number[] = [];
const createdCalendarEventIds: string[] = [];

// Shared test state
let testDate: string;
let testStartTime: string;
let testEndTime: string;
let testBookingId: number;
let proLocationName: string;

// ─── Helpers ─────────────────────────────────────────

/**
 * Wait for an email matching subject substring to arrive in a mailbox.
 * Polls Gmail API every 2s for up to 20s.
 */
async function waitForEmail(
  mailbox: string,
  subjectContains: string,
  afterTimestamp: number,
  timeoutMs = 20000,
): Promise<{ id: string; subject: string; snippet: string } | null> {
  const gmail = getGmailClient(mailbox);
  const deadline = Date.now() + timeoutMs;
  const afterSec = Math.floor(afterTimestamp / 1000);

  while (Date.now() < deadline) {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: `subject:(${subjectContains}) after:${afterSec}`,
      maxResults: 5,
    });

    if (res.data.messages && res.data.messages.length > 0) {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: res.data.messages[0].id!,
        format: "metadata",
        metadataHeaders: ["Subject"],
      });
      const subjectHeader = msg.data.payload?.headers?.find(
        (h) => h.name === "Subject",
      );
      return {
        id: msg.data.id!,
        subject: subjectHeader?.value ?? "",
        snippet: msg.data.snippet ?? "",
      };
    }

    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

/**
 * Delete a Gmail message by ID.
 */
async function deleteEmail(mailbox: string, messageId: string) {
  const gmail = getGmailClient(mailbox);
  await gmail.users.messages.trash({ userId: "me", id: messageId });
}

/**
 * Find available slot for the dummy pro, far in the future.
 */
async function findTestSlot(): Promise<{
  date: string;
  startTime: string;
  endTime: string;
  locationName: string;
}> {
  const [profile] = await db
    .select({
      bookingNotice: proProfiles.bookingNotice,
      bookingHorizon: proProfiles.bookingHorizon,
      lessonDurations: proProfiles.lessonDurations,
    })
    .from(proProfiles)
    .where(eq(proProfiles.id, DUMMY_PRO_PROFILE_ID))
    .limit(1);

  const today = new Date();
  const endDate = addDays(today, profile.bookingHorizon);

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
      .where(eq(proAvailability.proProfileId, DUMMY_PRO_PROFILE_ID)),
    db
      .select({
        date: proAvailabilityOverrides.date,
        type: proAvailabilityOverrides.type,
        startTime: proAvailabilityOverrides.startTime,
        endTime: proAvailabilityOverrides.endTime,
        proLocationId: proAvailabilityOverrides.proLocationId,
      })
      .from(proAvailabilityOverrides)
      .where(eq(proAvailabilityOverrides.proProfileId, DUMMY_PRO_PROFILE_ID)),
    db
      .select({
        date: lessonBookings.date,
        startTime: lessonBookings.startTime,
        endTime: lessonBookings.endTime,
      })
      .from(lessonBookings)
      .where(eq(lessonBookings.proProfileId, DUMMY_PRO_PROFILE_ID)),
  ]);

  const durations = profile.lessonDurations as number[];
  const minDuration = Math.min(...durations);

  // Start from 2 weeks out to avoid notice issues
  let cursor = addDays(today, 14);
  while (cursor <= endDate) {
    const dateStr = format(cursor, "yyyy-MM-dd");
    const dayOverrides = (overrides as AvailabilityOverride[]).filter(
      (o) =>
        o.date === dateStr &&
        (o.proLocationId === DUMMY_PRO_LOCATION_ID || o.proLocationId === null),
    );
    const dayBookings = (bookings as ExistingBooking[]).filter(
      (b: ExistingBooking & { date?: string }) => (b as { date: string }).date === dateStr,
    );

    const slots = computeAvailableSlots(
      dateStr,
      templates as AvailabilityTemplate[],
      dayOverrides,
      dayBookings,
      profile.bookingNotice,
      minDuration,
    );

    if (slots.length > 0) {
      // Get location name
      const [loc] = await db
        .select({ name: locations.name })
        .from(proLocations)
        .innerJoin(locations, eq(proLocations.locationId, locations.id))
        .where(eq(proLocations.id, DUMMY_PRO_LOCATION_ID))
        .limit(1);

      return {
        date: dateStr,
        startTime: slots[0].startTime,
        endTime: slots[0].endTime,
        locationName: loc?.name ?? "Testlocatie",
      };
    }

    cursor = addDays(cursor, 1);
  }

  throw new Error("No available slot found for dummy pro");
}

// ─── Setup & Cleanup ─────────────────────────────────

beforeAll(async () => {
  const slot = await findTestSlot();
  testDate = slot.date;
  testStartTime = slot.startTime;
  testEndTime = slot.endTime;
  proLocationName = slot.locationName;
}, 30000);

afterAll(async () => {
  // Clean up bookings
  if (createdBookingIds.length > 0) {
    await db
      .delete(lessonBookings)
      .where(inArray(lessonBookings.id, createdBookingIds));
  }

  // Clean up calendar events
  const cal = getCalendarClient(DUMMY_PRO_EMAIL);
  for (const eventId of createdCalendarEventIds) {
    try {
      await cal.events.delete({ calendarId: "primary", eventId });
    } catch {
      // Event may already be deleted by the test
    }
  }
}, 30000);

// ─── Tests: Booking confirmation email ───────────────

describe("booking confirmation email", () => {
  it("sends confirmation email with ICS to booker", async () => {
    const timestamp = Date.now();
    const proName = "Dummy Pro";
    const dateFormatted = formatDateNl(testDate);

    // Create a test booking
    const [booking] = await db
      .insert(lessonBookings)
      .values({
        proProfileId: DUMMY_PRO_PROFILE_ID,
        bookedById: CLAUDE_USER_ID,
        proLocationId: DUMMY_PRO_LOCATION_ID,
        date: testDate,
        startTime: testStartTime,
        endTime: testEndTime,
        participantCount: 1,
        notes: "[TEST] Email integration test — will be cleaned up",
        manageToken: `test-email-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      })
      .returning({ id: lessonBookings.id });

    createdBookingIds.push(booking.id);
    testBookingId = booking.id;

    // Build and send confirmation email (replicate what createBooking does)
    const icsContent = buildIcs({
      date: testDate,
      startTime: testStartTime,
      endTime: testEndTime,
      summary: `Golfles met ${proName}`,
      location: proLocationName,
      description: `Golfles bij ${proName}\\nLocatie: ${proLocationName}\\nDeelnemers: 1`,
      bookingId: booking.id,
    });

    const htmlBody = `
      <h2 style="font-family:Georgia,'Times New Roman',serif;">Je golfles is bevestigd</h2>
      <p>[TEST] Bevestiging golfles met ${proName} op ${dateFormatted}</p>
    `;

    const result = await sendEmail({
      to: CLAUDE_EMAIL,
      subject: `[TEST] Bevestiging: golfles met ${proName} op ${dateFormatted}`,
      html: (unsubscribeUrl) => emailLayout(htmlBody, unsubscribeUrl),
      userId: CLAUDE_USER_ID,
      attachments: [
        {
          filename: "golfles.ics",
          content: icsContent,
          contentType: "text/calendar; method=REQUEST",
        },
      ],
    });

    expect(result.error).toBeUndefined();

    // Verify email arrived
    const email = await waitForEmail(CLAUDE_EMAIL, "[TEST] Bevestiging", timestamp);
    expect(email).not.toBeNull();
    expect(email!.subject).toContain("Bevestiging");
    expect(email!.subject).toContain(proName);

    // Cleanup email
    await deleteEmail(CLAUDE_EMAIL, email!.id);
  }, 30000);
});

// ─── Tests: Pro notification email ───────────────────

describe("pro notification email", () => {
  it("sends booking notification to pro", async () => {
    const timestamp = Date.now();
    const dateFormatted = formatDateNl(testDate);

    const htmlBody = `
      <h2 style="font-family:Georgia,'Times New Roman',serif;">Nieuwe lesboeking</h2>
      <p>[TEST] Claude Code heeft een golfles bij je geboekt op ${dateFormatted}</p>
    `;

    const result = await sendEmail({
      to: DUMMY_PRO_EMAIL,
      subject: `[TEST] Nieuwe lesboeking: Claude Code op ${dateFormatted}`,
      html: (unsubscribeUrl) => emailLayout(htmlBody, unsubscribeUrl),
    });

    expect(result.error).toBeUndefined();

    // Verify email arrived at dummy pro
    const email = await waitForEmail(DUMMY_PRO_EMAIL, "[TEST] Nieuwe lesboeking", timestamp);
    expect(email).not.toBeNull();
    expect(email!.subject).toContain("Nieuwe lesboeking");

    // Cleanup
    await deleteEmail(DUMMY_PRO_EMAIL, email!.id);
  }, 30000);

  it("sends cancellation notification to pro", async () => {
    const timestamp = Date.now();
    const dateFormatted = formatDateNl(testDate);

    const htmlBody = `
      <h2 style="font-family:Georgia,'Times New Roman',serif;">Lesboeking geannuleerd</h2>
      <p>[TEST] Claude Code heeft de golfles van ${dateFormatted} geannuleerd.</p>
      <p><strong>Reden:</strong> Testreden</p>
    `;

    const result = await sendEmail({
      to: DUMMY_PRO_EMAIL,
      subject: `[TEST] Geannuleerd: golfles Claude Code op ${dateFormatted}`,
      html: (unsubscribeUrl) => emailLayout(htmlBody, unsubscribeUrl),
    });

    expect(result.error).toBeUndefined();

    const email = await waitForEmail(DUMMY_PRO_EMAIL, "[TEST] Geannuleerd", timestamp);
    expect(email).not.toBeNull();
    expect(email!.subject).toContain("Geannuleerd");

    await deleteEmail(DUMMY_PRO_EMAIL, email!.id);
  }, 30000);
});

// ─── Tests: Cancellation email with ICS ──────────────

describe("cancellation email with ICS", () => {
  it("sends cancel ICS email to booker", async () => {
    const timestamp = Date.now();
    const proName = "Dummy Pro";
    const dateFormatted = formatDateNl(testDate);

    const icsContent = buildCancelIcs({
      date: testDate,
      startTime: testStartTime,
      endTime: testEndTime,
      summary: `Golfles met ${proName}`,
      location: proLocationName,
      description: `Geannuleerd: golfles bij ${proName}`,
      bookingId: testBookingId,
    });

    const htmlBody = `
      <h2 style="font-family:Georgia,'Times New Roman',serif;">Je golfles is geannuleerd</h2>
      <p>[TEST] Annulering golfles met ${proName} op ${dateFormatted}</p>
    `;

    const result = await sendEmail({
      to: CLAUDE_EMAIL,
      subject: `[TEST] Geannuleerd: golfles met ${proName} op ${dateFormatted}`,
      html: (unsubscribeUrl) => emailLayout(htmlBody, unsubscribeUrl),
      userId: CLAUDE_USER_ID,
      attachments: [
        {
          filename: "golfles-annulering.ics",
          content: icsContent,
          contentType: "text/calendar; method=CANCEL",
        },
      ],
    });

    expect(result.error).toBeUndefined();

    const email = await waitForEmail(CLAUDE_EMAIL, "[TEST] Geannuleerd", timestamp);
    expect(email).not.toBeNull();
    expect(email!.subject).toContain("Geannuleerd");

    await deleteEmail(CLAUDE_EMAIL, email!.id);
  }, 30000);
});

// ─── Tests: Google Calendar event lifecycle ──────────

describe("Google Calendar event lifecycle", () => {
  let calendarEventId: string;

  it("creates a calendar event on pro's calendar", async () => {
    const cal = getCalendarClient(DUMMY_PRO_EMAIL);
    const bookerName = "Claude Code";

    const res = await cal.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: `[TEST] Golfles: ${bookerName}`,
        location: proLocationName,
        description: `[TEST] Golfles met ${bookerName}\nDeelnemers: 1`,
        start: {
          dateTime: `${testDate}T${testStartTime}:00`,
          timeZone: "Europe/Brussels",
        },
        end: {
          dateTime: `${testDate}T${testEndTime}:00`,
          timeZone: "Europe/Brussels",
        },
      },
    });

    expect(res.data.id).toBeDefined();
    calendarEventId = res.data.id!;
    createdCalendarEventIds.push(calendarEventId);

    // Verify the event exists
    const event = await cal.events.get({
      calendarId: "primary",
      eventId: calendarEventId,
    });
    expect(event.data.summary).toContain("[TEST] Golfles");
    expect(event.data.status).toBe("confirmed");
  }, 15000);

  it("stores googleEventId on booking row", async () => {
    expect(calendarEventId).toBeDefined();
    expect(testBookingId).toBeDefined();

    // Simulate what notifyProNewBooking does
    await db
      .update(lessonBookings)
      .set({ googleEventId: calendarEventId })
      .where(eq(lessonBookings.id, testBookingId));

    const [booking] = await db
      .select({ googleEventId: lessonBookings.googleEventId })
      .from(lessonBookings)
      .where(eq(lessonBookings.id, testBookingId))
      .limit(1);

    expect(booking.googleEventId).toBe(calendarEventId);
  }, 10000);

  it("deletes calendar event on cancellation", async () => {
    expect(calendarEventId).toBeDefined();
    const cal = getCalendarClient(DUMMY_PRO_EMAIL);

    await cal.events.delete({
      calendarId: "primary",
      eventId: calendarEventId,
    });

    // Remove from cleanup list since we already deleted it
    const idx = createdCalendarEventIds.indexOf(calendarEventId);
    if (idx !== -1) createdCalendarEventIds.splice(idx, 1);

    // Verify event is gone (should 404 or show as cancelled)
    try {
      const res = await cal.events.get({
        calendarId: "primary",
        eventId: calendarEventId,
      });
      // If we get here, the event should be marked cancelled
      expect(res.data.status).toBe("cancelled");
    } catch (err: unknown) {
      // 404 or 410 means successfully deleted
      const error = err as { code?: number; response?: { status?: number } };
      const status = error.code ?? error.response?.status;
      expect([404, 410]).toContain(status);
    }
  }, 15000);
});

// ─── Tests: Full round-trip ──────────────────────────

describe("full booking → notification → cancel round-trip", () => {
  let roundTripBookingId: number;
  let roundTripEventId: string;

  it("book → pro email + calendar → cancel → pro cancel email + calendar delete", async () => {
    const timestamp = Date.now();
    const dateFormatted = formatDateNl(testDate);
    const bookerName = "Claude Code";

    // 1. Create booking
    const [booking] = await db
      .insert(lessonBookings)
      .values({
        proProfileId: DUMMY_PRO_PROFILE_ID,
        bookedById: CLAUDE_USER_ID,
        proLocationId: DUMMY_PRO_LOCATION_ID,
        date: testDate,
        startTime: testStartTime,
        endTime: testEndTime,
        participantCount: 2,
        notes: "[TEST] Full round-trip test",
        manageToken: `test-rt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      })
      .returning({ id: lessonBookings.id });

    roundTripBookingId = booking.id;
    createdBookingIds.push(roundTripBookingId);

    // 2. Send pro notification email
    const emailResult = await sendEmail({
      to: DUMMY_PRO_EMAIL,
      subject: `[TEST-RT] Nieuwe lesboeking: ${bookerName} op ${dateFormatted}`,
      html: emailLayout(`<p>[TEST-RT] Nieuwe boeking</p>`),
    });
    expect(emailResult.error).toBeUndefined();

    // 3. Create calendar event
    const cal = getCalendarClient(DUMMY_PRO_EMAIL);
    const calRes = await cal.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: `[TEST-RT] Golfles: ${bookerName}`,
        location: proLocationName,
        description: "[TEST-RT] Round-trip test",
        start: {
          dateTime: `${testDate}T${testStartTime}:00`,
          timeZone: "Europe/Brussels",
        },
        end: {
          dateTime: `${testDate}T${testEndTime}:00`,
          timeZone: "Europe/Brussels",
        },
      },
    });
    roundTripEventId = calRes.data.id!;
    createdCalendarEventIds.push(roundTripEventId);

    // Store event ID on booking
    await db
      .update(lessonBookings)
      .set({ googleEventId: roundTripEventId })
      .where(eq(lessonBookings.id, roundTripBookingId));

    // 4. Verify pro received booking email
    const bookingEmail = await waitForEmail(DUMMY_PRO_EMAIL, "[TEST-RT] Nieuwe lesboeking", timestamp);
    expect(bookingEmail).not.toBeNull();
    await deleteEmail(DUMMY_PRO_EMAIL, bookingEmail!.id);

    // 5. Cancel the booking
    const cancelTimestamp = Date.now();
    await db
      .update(lessonBookings)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancellationReason: "[TEST] Round-trip cancellation",
      })
      .where(eq(lessonBookings.id, roundTripBookingId));

    // 6. Send pro cancellation email
    const cancelEmailResult = await sendEmail({
      to: DUMMY_PRO_EMAIL,
      subject: `[TEST-RT] Geannuleerd: golfles ${bookerName} op ${dateFormatted}`,
      html: emailLayout(`<p>[TEST-RT] Boeking geannuleerd</p>`),
    });
    expect(cancelEmailResult.error).toBeUndefined();

    // 7. Delete calendar event
    await cal.events.delete({
      calendarId: "primary",
      eventId: roundTripEventId,
    });
    const idx = createdCalendarEventIds.indexOf(roundTripEventId);
    if (idx !== -1) createdCalendarEventIds.splice(idx, 1);

    // 8. Verify pro received cancellation email
    const cancelEmail = await waitForEmail(DUMMY_PRO_EMAIL, "[TEST-RT] Geannuleerd", cancelTimestamp);
    expect(cancelEmail).not.toBeNull();
    await deleteEmail(DUMMY_PRO_EMAIL, cancelEmail!.id);

    // 9. Verify calendar event is gone or cancelled
    try {
      const res = await cal.events.get({ calendarId: "primary", eventId: roundTripEventId });
      expect(res.data.status).toBe("cancelled");
    } catch (err: unknown) {
      const error = err as { code?: number; response?: { status?: number } };
      const status = error.code ?? error.response?.status;
      expect([404, 410]).toContain(status);
    }

    // 10. Verify booking status in DB
    const [cancelled] = await db
      .select({ status: lessonBookings.status, cancelledAt: lessonBookings.cancelledAt })
      .from(lessonBookings)
      .where(eq(lessonBookings.id, roundTripBookingId))
      .limit(1);

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelledAt).not.toBeNull();
  }, 60000);
});
