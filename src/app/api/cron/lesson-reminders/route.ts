import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  lessonBookings,
  proProfiles,
  proLocations,
  locations,
  users,
  events,
} from "@/lib/db/schema";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { logEvent } from "@/lib/events";
import { sendEmail } from "@/lib/mail";
import { resolveLocale } from "@/lib/i18n";
import {
  buildLessonReminderEmail,
  getLessonReminderSubject,
} from "@/lib/email-templates";
import { buildIcs } from "@/lib/lesson-slots";
import { fromZonedTime } from "date-fns-tz";
import { addDaysToDateString } from "@/lib/local-date";

/**
 * GET /api/cron/lesson-reminders
 *
 * Sends a 24h-before reminder email to both the student and the pro for any
 * confirmed booking starting in the next 23-25h window. Idempotent via the
 * events table: each (booking, recipient) gets a `lesson.reminder_sent`
 * marker row, and we skip bookings that already have one.
 *
 * Auth: CRON_SECRET bearer token (Vercel Cron) or dev session.
 * Cron schedule: hourly. The 23-25h window catches everything even if a
 * single hourly run misses or fires slightly off-schedule.
 */
export async function GET(request: NextRequest) {
  // Auth
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (authHeader === `Bearer ${cronSecret}` && cronSecret) {
    // OK
  } else {
    const session = await getSession();
    if (!session || !hasRole(session, "dev")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  // Window: 23h to 25h from now (UTC instants). The 2h hourly-cron
  // safety margin catches everything even if a single fire misses
  // or runs slightly off-schedule.
  const winStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const winEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  // Coarse SQL pre-filter on `lesson_bookings.date`. The column stores
  // a wall-clock date in the LOCATION's timezone, so the UTC window
  // can land on different calendar dates depending on the location's
  // offset. Widen by ±1 day from the UTC date strings so any realistic
  // TZ (UTC-12 to UTC+14) is fully covered; the per-booking JS filter
  // below does the precise window check using each booking's location
  // TZ. Joining `locations` here avoids an N+1 lookup later.
  const winStartUtcDate = winStart.toISOString().slice(0, 10);
  const winEndUtcDate = winEnd.toISOString().slice(0, 10);
  const sqlWindowStart = addDaysToDateString(winStartUtcDate, -1);
  const sqlWindowEnd = addDaysToDateString(winEndUtcDate, 1);

  const candidates = await db
    .select({
      id: lessonBookings.id,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      proProfileId: lessonBookings.proProfileId,
      proLocationId: lessonBookings.proLocationId,
      bookedById: lessonBookings.bookedById,
      locationTz: locations.timezone,
    })
    .from(lessonBookings)
    .innerJoin(proLocations, eq(lessonBookings.proLocationId, proLocations.id))
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(
      and(
        eq(lessonBookings.status, "confirmed"),
        gte(lessonBookings.date, sqlWindowStart),
        lte(lessonBookings.date, sqlWindowEnd)
      )
    );

  // Resolve each candidate's lesson start in the LOCATION's TZ — not
  // the server's. The previous version parsed `date+startTime` with a
  // `Z` suffix (treating wall-clock as UTC) and fired Brussels
  // reminders 1–2h early depending on DST; for any non-Brussels pro it
  // was completely wrong. See gaps.md §0.
  const inWindow = candidates.filter((b) => {
    const startsAt = fromZonedTime(`${b.date}T${b.startTime}:00`, b.locationTz);
    return startsAt >= winStart && startsAt <= winEnd;
  });

  if (inWindow.length === 0) {
    return NextResponse.json({
      checked: candidates.length,
      sent: 0,
      skipped: 0,
      reason: "no bookings in window",
    });
  }

  // Find which booking ids already had a reminder sent (idempotency).
  // Use `inArray` rather than raw `sql\`= ANY(${ids})\`` — the Neon
  // HTTP driver serializes a JS array passed via the sql template
  // tag as the bare value when there's only one element (so a
  // single-id array `[14]` ends up as the integer `14`, which
  // Postgres rejects with "malformed array literal: \"14\"").
  const ids = inWindow.map((b) => b.id);
  const sentRows = await db
    .select({ targetId: events.targetId })
    .from(events)
    .where(
      and(
        eq(events.type, "lesson.reminder_sent"),
        inArray(events.targetId, ids)
      )
    );
  const alreadySent = new Set(sentRows.map((r) => r.targetId));

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const booking of inWindow) {
    if (alreadySent.has(booking.id)) {
      skipped++;
      continue;
    }

    // Fetch student
    const [student] = await db
      .select({
        firstName: users.firstName,
        email: users.email,
        preferredLocale: users.preferredLocale,
      })
      .from(users)
      .where(eq(users.id, booking.bookedById))
      .limit(1);

    // Fetch pro + pro user
    const [pro] = await db
      .select({
        displayName: proProfiles.displayName,
        proFirstName: users.firstName,
        proEmail: users.email,
        proLocale: users.preferredLocale,
      })
      .from(proProfiles)
      .innerJoin(users, eq(proProfiles.userId, users.id))
      .where(eq(proProfiles.id, booking.proProfileId))
      .limit(1);

    // Fetch location name
    const [loc] = await db
      .select({ name: locations.name, city: locations.city })
      .from(proLocations)
      .innerJoin(locations, eq(proLocations.locationId, locations.id))
      .where(eq(proLocations.id, booking.proLocationId))
      .limit(1);
    const locationName = loc
      ? loc.city
        ? `${loc.name}, ${loc.city}`
        : loc.name
      : "";

    if (!student || !pro || !pro.proEmail) {
      failed++;
      continue;
    }

    const studentLocale = resolveLocale(student.preferredLocale);

    // Reuse the PUBLISH ics — calendar apps will accept it as an update.
    // `tz` is the location's timezone, already loaded with the candidate
    // row (no extra query).
    const ics = buildIcs({
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      summary: `Golf lesson with ${pro.displayName}`,
      location: locationName,
      description: `Reminder via golflessons.be`,
      bookingId: booking.id,
      tz: booking.locationTz,
    });
    const icsAttachment = {
      filename: "lesson.ics",
      contentType: "text/calendar",
      content: ics,
      method: "PUBLISH",
    };

    const studentName = student.firstName;

    // Reminder to STUDENT only — pros use their dashboard for the day's
    // schedule, no need to nag their inbox. (Cancellation + new-booking
    // emails to pros are unaffected; those are immediate notifications.)
    sendEmail({
      to: student.email,
      subject: getLessonReminderSubject("student", pro.displayName, studentLocale),
      html: buildLessonReminderEmail({
        recipient: "student",
        recipientFirstName: studentName,
        otherPartyName: pro.displayName,
        locationName,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        locale: studentLocale,
      }),
      attachments: [icsAttachment],
    }).catch(() => {});

    // Mark sent (idempotency marker — even if one of the sends failed we
    // mark to avoid spamming on the next run; the email.failed event from
    // mail.ts captures the failure separately for visibility)
    await logEvent({
      type: "lesson.reminder_sent",
      level: "info",
      targetId: booking.id,
      payload: {
        bookingId: booking.id,
        date: booking.date,
        startTime: booking.startTime,
        studentEmail: student.email,
        proEmail: pro.proEmail,
      },
    });

    sent++;
  }

  return NextResponse.json({
    checked: candidates.length,
    inWindow: inWindow.length,
    sent,
    skipped,
    failed,
    timestamp: now.toISOString(),
  });
}
