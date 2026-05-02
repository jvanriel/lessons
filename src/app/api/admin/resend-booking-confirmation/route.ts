import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lessonBookings, proProfiles, users, proLocations, locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { buildIcs } from "@/lib/lesson-slots";
import { sendEmail } from "@/lib/mail";
import {
  buildStudentBookingConfirmationEmail,
  getStudentBookingConfirmationSubject,
} from "@/lib/email-templates";
import { resolveLocale } from "@/lib/i18n";

/**
 * GET /api/admin/resend-booking-confirmation?id=<bookingId>
 *
 * Admin-only escape hatch to re-send the booking confirmation email
 * (with attached .ics) to the student of an existing booking. Used
 * after fixing bugs in the email/ics pipeline so prior bookings can
 * receive a corrected version without manual SMTP gymnastics.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !(hasRole(session, "admin") || hasRole(session, "dev"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const idStr = request.nextUrl.searchParams.get("id");
  const id = idStr ? Number.parseInt(idStr, 10) : NaN;
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const [row] = await db
    .select({
      id: lessonBookings.id,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      priceCents: lessonBookings.priceCents,
      notes: lessonBookings.notes,
      paymentStatus: lessonBookings.paymentStatus,
      proName: proProfiles.displayName,
      proPhone: proProfiles.contactPhone,
      proAllowCash: proProfiles.allowBookingWithoutPayment,
      proUserId: proProfiles.userId,
      studentFirstName: users.firstName,
      studentLastName: users.lastName,
      studentEmail: users.email,
      studentLocale: users.preferredLocale,
      locationName: locations.name,
      locationTz: locations.timezone,
    })
    .from(lessonBookings)
    .innerJoin(proProfiles, eq(lessonBookings.proProfileId, proProfiles.id))
    .innerJoin(users, eq(lessonBookings.bookedById, users.id))
    .innerJoin(proLocations, eq(lessonBookings.proLocationId, proLocations.id))
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(lessonBookings.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [proUser] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, row.proUserId))
    .limit(1);

  const [sh, sm] = row.startTime.split(":").map(Number);
  const [eh, em] = row.endTime.split(":").map(Number);
  const duration = eh * 60 + em - (sh * 60 + sm);
  const cashOnly = row.proAllowCash === true;
  const studentLocale = resolveLocale(row.studentLocale);

  const ics = buildIcs({
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    summary: `Golf lesson with ${row.proName}`,
    location: row.locationName,
    description: `Booked via golflessons.be — ${row.studentFirstName} ${row.studentLastName}${row.notes ? ` — Notes: ${row.notes}` : ""}`,
    bookingId: row.id,
    tz: row.locationTz,
  });

  const result = await sendEmail({
    to: row.studentEmail,
    subject: getStudentBookingConfirmationSubject(row.proName, studentLocale),
    html: buildStudentBookingConfirmationEmail({
      firstName: row.studentFirstName,
      proName: row.proName,
      proEmail: proUser?.email ?? "",
      proPhone: row.proPhone,
      locationName: row.locationName,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      duration,
      priceCents: row.priceCents,
      cashOnly,
      locale: studentLocale,
    }),
    attachments: [
      {
        filename: "lesson.ics",
        contentType: "text/calendar",
        content: ics,
        method: "PUBLISH",
      },
    ],
  });

  return NextResponse.json({
    bookingId: id,
    sentTo: row.studentEmail,
    error: result.error ?? null,
    messageId: result.messageId ?? null,
  });
}
