/**
 * Integration tests for the public booking + claim flow.
 *
 * Uses the Claude test accounts seeded by `scripts/seed-claude-dummies.ts`:
 *   - Pro:     dummy-pro-claude@golflessons.be  (→ it.admin inbox)
 *   - Student: dummy-student-claude@golflessons.be (→ same inbox)
 *
 * Tests the full lifecycle:
 *   Phase 1 — New student books a lesson (account created implicitly)
 *   Phase 2 — Verified student books again (different email template)
 *   Phase 3 — Unverified returning student (re-verify flow)
 *   Phase 4 — Edge cases (honeypot, double-booking, invalid data)
 *
 * Emails are verified by reading the it.admin Gmail inbox via the
 * Google service account.
 *
 * Run: pnpm vitest run src/lib/__tests__/public-booking-flow.test.ts
 *
 * Note: Email delivery + Gmail API reads need time, so email tests
 * have a 30s timeout.
 */
import { describe, it, expect, afterAll, beforeAll, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, ne, gte, lte, inArray } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { addDays, format } from "date-fns";
import { gmail as gmailClient } from "@googleapis/gmail";
import { JWT } from "google-auth-library";
import {
  users,
  proProfiles,
  proAvailability,
  proAvailabilityOverrides,
  proLocations,
  locations,
  lessonBookings,
  lessonParticipants,
  proStudents,
  userEmails,
} from "@/lib/db/schema";
import {
  computeAvailableSlots,
  type AvailabilityTemplate,
  type AvailabilityOverride,
  type ExistingBooking,
} from "@/lib/lesson-slots";
import { sendEmail } from "@/lib/mail";
import {
  buildClaimAndVerifyBookingEmail,
  buildNewBookingOnAccountEmail,
  getClaimBookingSubject,
  buildProBookingNotificationEmail,
  getProBookingNotificationSubject,
} from "@/lib/email-templates";
import type { Locale } from "@/lib/i18n";
import { updateBookingPreferences } from "@/lib/booking-preferences";

// ─── Config ──────────────────────────────────────────

const PRO_EMAIL = process.env.DUMMY_PRO || "dummy-pro-claude@golflessons.be";
const STUDENT_EMAIL =
  process.env.DUMMY_STUDENT || "dummy-student-claude@golflessons.be";
const INBOX_USER = "it.admin@golflessons.be";

const dbUrl = process.env.POSTGRES_URL_PREVIEW || process.env.POSTGRES_URL!;
const db = drizzle(neon(dbUrl));

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
  );
}

// ─── Gmail helpers ───────────────────────────────────

function getGmailClient() {
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    subject: INBOX_USER,
  });
  return gmailClient({ version: "v1", auth });
}

/**
 * Search the it.admin inbox for emails matching a query, sent after a
 * given timestamp. Retries a few times to allow for delivery delay.
 */
async function findEmails(
  query: string,
  afterTimestamp: number,
  maxRetries = 5,
  delayMs = 3000
): Promise<
  Array<{
    subject: string;
    from: string;
    to: string;
    date: string;
    bodyHtml: string;
    bodyText: string;
  }>
> {
  const gmail = getGmailClient();
  const afterEpoch = Math.floor(afterTimestamp / 1000);
  const fullQuery = `${query} after:${afterEpoch}`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }

    const res = await gmail.users.messages.list({
      userId: "me",
      q: fullQuery,
      maxResults: 10,
    });

    const messages = res.data.messages || [];
    if (messages.length === 0) continue;

    const results = [];
    for (const msg of messages) {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "full",
      });

      const headers = detail.data.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
          ?.value || "";

      // Extract body (handle multipart)
      let bodyHtml = "";
      let bodyText = "";
      const payload = detail.data.payload;

      if (payload?.parts) {
        for (const part of payload.parts) {
          if (
            part.mimeType === "text/html" &&
            part.body?.data
          ) {
            bodyHtml = Buffer.from(part.body.data, "base64url").toString(
              "utf-8"
            );
          }
          if (
            part.mimeType === "text/plain" &&
            part.body?.data
          ) {
            bodyText = Buffer.from(part.body.data, "base64url").toString(
              "utf-8"
            );
          }
        }
      } else if (payload?.body?.data) {
        const decoded = Buffer.from(payload.body.data, "base64url").toString(
          "utf-8"
        );
        if (payload.mimeType === "text/html") bodyHtml = decoded;
        else bodyText = decoded;
      }

      results.push({
        subject: getHeader("Subject"),
        from: getHeader("From"),
        to: getHeader("To"),
        date: getHeader("Date"),
        bodyHtml,
        bodyText,
      });
    }

    if (results.length > 0) return results;
  }

  return [];
}

// ─── Test state ──────────────────────────────────────

let PRO_USER_ID: number;
let PRO_PROFILE_ID: number;
let PRO_LOCATION_ID: number;

// Track everything we create for cleanup
const createdBookingIds: number[] = [];
let createdStudentUserId: number | null = null;

// ─── Availability helpers (reused from existing tests) ─

async function getAvailableSlots(
  proProfileId: number,
  proLocationId: number,
  date: string,
  duration: number
) {
  const [profile] = await db
    .select({ bookingNotice: proProfiles.bookingNotice })
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
          eq(proAvailability.proLocationId, proLocationId)
        )
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
          eq(proAvailabilityOverrides.date, date)
        )
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
          ne(lessonBookings.status, "cancelled")
        )
      ),
  ]);

  const dayOverrides = (overrides as AvailabilityOverride[]).filter(
    (o) => o.proLocationId === proLocationId || o.proLocationId === null
  );
  return computeAvailableSlots(
    date,
    templates as AvailabilityTemplate[],
    dayOverrides,
    bookings as ExistingBooking[],
    profile.bookingNotice,
    duration,
    undefined,
    "Europe/Brussels",
  );
}

async function getNextAvailableDate(
  proProfileId: number,
  proLocationId: number,
  minDuration: number
): Promise<string> {
  const [profile] = await db
    .select({
      bookingNotice: proProfiles.bookingNotice,
      bookingHorizon: proProfiles.bookingHorizon,
      lessonDurations: proProfiles.lessonDurations,
    })
    .from(proProfiles)
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);

  const today = new Date();
  const endDate = addDays(today, profile.bookingHorizon);
  let cursor = addDays(today, 1); // start tomorrow to avoid booking-notice issues

  while (cursor <= endDate) {
    const dateStr = format(cursor, "yyyy-MM-dd");
    const slots = await getAvailableSlots(
      proProfileId,
      proLocationId,
      dateStr,
      minDuration
    );
    if (slots.length > 0) return dateStr;
    cursor = addDays(cursor, 1);
  }

  throw new Error("No available dates found for test pro");
}

// ─── Core booking function (mirrors createPublicBooking) ─

async function createBookingDirect(opts: {
  proId: number;
  proLocationId: number;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes?: string;
  honeypot?: string;
  locale?: Locale;
}) {
  const uiLocale: Locale = opts.locale || "en";

  // Honeypot check
  if (opts.honeypot) {
    return { success: true as const, bookingId: 0 };
  }

  // Validate required fields
  if (
    !opts.proId ||
    !opts.proLocationId ||
    !opts.date ||
    !opts.startTime ||
    !opts.endTime ||
    !opts.duration ||
    !opts.firstName ||
    !opts.lastName ||
    !opts.email ||
    !opts.phone
  ) {
    return { error: "All fields are required" };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(opts.email)) {
    return { error: "Invalid email" };
  }
  if (!/^\+[1-9]\d{7,14}$/.test(opts.phone)) {
    return { error: "Invalid phone" };
  }

  // Load pro
  const [pro] = await db
    .select({
      id: proProfiles.id,
      displayName: proProfiles.displayName,
      lessonDurations: proProfiles.lessonDurations,
      lessonPricing: proProfiles.lessonPricing,
      bookingEnabled: proProfiles.bookingEnabled,
      published: proProfiles.published,
      bookingNotice: proProfiles.bookingNotice,
      bookingHorizon: proProfiles.bookingHorizon,
    })
    .from(proProfiles)
    .where(
      and(
        eq(proProfiles.id, opts.proId),
        eq(proProfiles.published, true),
        eq(proProfiles.bookingEnabled, true)
      )
    )
    .limit(1);

  if (!pro) return { error: "Pro not found" };

  // Verify slot
  const slots = await getAvailableSlots(
    pro.id,
    opts.proLocationId,
    opts.date,
    opts.duration
  );
  if (
    !slots.some(
      (s) => s.startTime === opts.startTime && s.endTime === opts.endTime
    )
  ) {
    return { error: "Slot unavailable" };
  }

  // Price snapshot
  const pricing = pro.lessonPricing as Record<string, number> | null;
  const perLessonCents = pricing?.[String(opts.duration)];
  const priceCents =
    typeof perLessonCents === "number" && perLessonCents > 0
      ? perLessonCents
      : null;

  // Three-branch user lookup — gated on password (task 65). A row with a
  // verified email but no password is still a stub, not a real account.
  const email = opts.email.trim().toLowerCase();
  const existing = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
      preferredLocale: users.preferredLocale,
      password: users.password,
      roles: users.roles,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  let userId: number;
  let branch: "new" | "unverified" | "verified";
  let recipientLocale: Locale = uiLocale;

  if (existing.length === 0) {
    const [inserted] = await db
      .insert(users)
      .values({
        firstName: opts.firstName,
        lastName: opts.lastName,
        email,
        phone: opts.phone,
        roles: "member",
        preferredLocale: uiLocale,
      })
      .returning({ id: users.id });
    userId = inserted.id;
    branch = "new";
    recipientLocale = uiLocale;
  } else if (!existing[0].password) {
    userId = existing[0].id;
    await db
      .update(users)
      .set({
        firstName: opts.firstName,
        lastName: opts.lastName,
        phone: opts.phone,
      })
      .where(eq(users.id, userId));
    branch = "unverified";
    recipientLocale =
      (existing[0].preferredLocale as Locale) || uiLocale;
  } else {
    userId = existing[0].id;
    branch = "verified";
    recipientLocale =
      (existing[0].preferredLocale as Locale) || uiLocale;
  }

  // Insert booking
  const manageToken = randomBytes(32).toString("hex");
  const [booking] = await db
    .insert(lessonBookings)
    .values({
      proProfileId: pro.id,
      bookedById: userId,
      proLocationId: opts.proLocationId,
      date: opts.date,
      startTime: opts.startTime,
      endTime: opts.endTime,
      participantCount: 1,
      status: "confirmed",
      notes: opts.notes || null,
      manageToken,
      priceCents,
      platformFeeCents: null,
      paymentStatus: "manual",
    })
    .returning({ id: lessonBookings.id });

  await db.insert(lessonParticipants).values({
    bookingId: booking.id,
    firstName: opts.firstName,
    lastName: opts.lastName,
    email,
    phone: opts.phone,
  });

  // Upsert pro↔student
  const [existingRelation] = await db
    .select({ id: proStudents.id })
    .from(proStudents)
    .where(
      and(
        eq(proStudents.proProfileId, pro.id),
        eq(proStudents.userId, userId)
      )
    )
    .limit(1);

  if (!existingRelation) {
    await db.insert(proStudents).values({
      proProfileId: pro.id,
      userId,
      source: "self",
      status: "active",
    });
  }

  // Location name for emails
  const [loc] = await db
    .select({ name: locations.name, city: locations.city })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(proLocations.id, opts.proLocationId))
    .limit(1);
  const locationName = loc
    ? loc.city
      ? `${loc.name}, ${loc.city}`
      : loc.name
    : "";

  // Pro user info for emails
  const [proUser] = await db
    .select({
      userId: proProfiles.userId,
      displayName: proProfiles.displayName,
      proFirstName: users.firstName,
      proEmail: users.email,
      proLocale: users.preferredLocale,
    })
    .from(proProfiles)
    .innerJoin(users, eq(proProfiles.userId, users.id))
    .where(eq(proProfiles.id, pro.id))
    .limit(1);

  // Student email
  if (branch === "new" || branch === "unverified") {
    const token = await new SignJWT({
      userId,
      purpose: "claim-booking",
      bookingId: booking.id,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(getSecret());
    const claimUrl = `${getBaseUrl()}/api/auth/claim-booking?token=${token}`;
    const registerUrl =
      `${getBaseUrl()}/register?firstName=${encodeURIComponent(opts.firstName)}` +
      `&lastName=${encodeURIComponent(opts.lastName)}` +
      `&email=${encodeURIComponent(email)}` +
      `&phone=${encodeURIComponent(opts.phone)}` +
      `&pro=${pro.id}`;

    await sendEmail({
      to: email,
      subject: getClaimBookingSubject(
        proUser?.displayName ?? "",
        recipientLocale
      ),
      html: buildClaimAndVerifyBookingEmail({
        firstName: opts.firstName,
        proName: proUser?.displayName ?? "",
        locationName,
        date: opts.date,
        startTime: opts.startTime,
        endTime: opts.endTime,
        duration: opts.duration,
        claimUrl,
        registerUrl,
        locale: recipientLocale,
      }),
    });
  } else {
    await sendEmail({
      to: email,
      subject: getClaimBookingSubject(
        proUser?.displayName ?? "",
        recipientLocale
      ),
      html: buildNewBookingOnAccountEmail({
        firstName: opts.firstName,
        proName: proUser?.displayName ?? "",
        locationName,
        date: opts.date,
        startTime: opts.startTime,
        endTime: opts.endTime,
        duration: opts.duration,
        loginUrl: `${getBaseUrl()}/login?email=${encodeURIComponent(email)}`,
        locale: recipientLocale,
      }),
    });
  }

  // Pro notification email
  if (proUser) {
    const proLocale = (proUser.proLocale as Locale) || "en";
    await sendEmail({
      to: proUser.proEmail,
      subject: getProBookingNotificationSubject(
        `${opts.firstName} ${opts.lastName}`,
        proLocale
      ),
      html: buildProBookingNotificationEmail({
        proFirstName: proUser.proFirstName,
        studentFirstName: opts.firstName,
        studentLastName: opts.lastName,
        studentEmail: email,
        studentPhone: opts.phone,
        locationName,
        date: opts.date,
        startTime: opts.startTime,
        endTime: opts.endTime,
        duration: opts.duration,
        participantCount: 1,
        notes: opts.notes || null,
        locale: proLocale,
        emailUnverified: branch !== "verified",
      }),
    });
  }

  // Preferences (fire-and-forget)
  updateBookingPreferences(
    userId,
    pro.id,
    opts.proLocationId,
    opts.duration,
    opts.date,
    opts.startTime
  ).catch(() => {});

  return { success: true as const, bookingId: booking.id, branch, userId };
}

// ─── Setup & Cleanup ─────────────────────────────────

beforeAll(async () => {
  // Verify pro account exists
  const [proUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, PRO_EMAIL))
    .limit(1);

  if (!proUser) {
    throw new Error(
      `Pro account ${PRO_EMAIL} not found. Run: npx tsx scripts/seed-claude-dummies.ts`
    );
  }
  PRO_USER_ID = proUser.id;

  const [profile] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, PRO_USER_ID))
    .limit(1);

  if (!profile) {
    throw new Error("Pro profile not found");
  }
  PRO_PROFILE_ID = profile.id;

  const [proLoc] = await db
    .select({ id: proLocations.id })
    .from(proLocations)
    .where(eq(proLocations.proProfileId, PRO_PROFILE_ID))
    .limit(1);

  if (!proLoc) {
    throw new Error("Pro location not found");
  }
  PRO_LOCATION_ID = proLoc.id;

  // Ensure student does NOT exist (clean slate)
  const [existingStudent] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, STUDENT_EMAIL))
    .limit(1);

  if (existingStudent) {
    await cleanupStudent(existingStudent.id);
  }
});

async function cleanupStudent(userId: number) {
  // Delete bookings and related records
  const bookings = await db
    .select({ id: lessonBookings.id })
    .from(lessonBookings)
    .where(eq(lessonBookings.bookedById, userId));

  for (const b of bookings) {
    await db
      .delete(lessonParticipants)
      .where(eq(lessonParticipants.bookingId, b.id));
  }
  if (bookings.length > 0) {
    await db
      .delete(lessonBookings)
      .where(
        inArray(
          lessonBookings.id,
          bookings.map((b) => b.id)
        )
      );
  }

  await db.delete(proStudents).where(eq(proStudents.userId, userId));
  await db.delete(userEmails).where(eq(userEmails.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

afterAll(async () => {
  // Clean up any bookings we created
  if (createdBookingIds.length > 0) {
    for (const id of createdBookingIds) {
      await db
        .delete(lessonParticipants)
        .where(eq(lessonParticipants.bookingId, id));
    }
    await db
      .delete(lessonBookings)
      .where(inArray(lessonBookings.id, createdBookingIds));
  }

  // Clean up student user if created
  if (createdStudentUserId) {
    await cleanupStudent(createdStudentUserId);
  }
});

// ═══════════════════════════════════════════════════════
// Phase 1: New Student Booking
// ═══════════════════════════════════════════════════════

describe("Phase 1: New student booking (branch=new)", () => {
  let bookingId: number;
  let bookingDate: string;
  let bookingStartTime: string;
  let bookingEndTime: string;
  let emailSentAt: number;

  it("pro has available slots", async () => {
    bookingDate = await getNextAvailableDate(
      PRO_PROFILE_ID,
      PRO_LOCATION_ID,
      60
    );
    expect(bookingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const slots = await getAvailableSlots(
      PRO_PROFILE_ID,
      PRO_LOCATION_ID,
      bookingDate,
      60
    );
    expect(slots.length).toBeGreaterThan(0);
    bookingStartTime = slots[0].startTime;
    bookingEndTime = slots[0].endTime;
  });

  it("student email does NOT exist in users table", async () => {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, STUDENT_EMAIL))
      .limit(1);
    expect(existing).toBeUndefined();
  });

  it("creates booking successfully", async () => {
    emailSentAt = Date.now();
    const result = await createBookingDirect({
      proId: PRO_PROFILE_ID,
      proLocationId: PRO_LOCATION_ID,
      date: bookingDate,
      startTime: bookingStartTime,
      endTime: bookingEndTime,
      duration: 60,
      firstName: "Dummy",
      lastName: "Student",
      email: STUDENT_EMAIL,
      phone: "+32471000000",
      notes: "[TEST] Phase 1 — new student booking",
    });

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("branch", "new");
    bookingId = (result as { bookingId: number }).bookingId;
    createdBookingIds.push(bookingId);
    createdStudentUserId = (result as { userId: number }).userId;
    expect(bookingId).toBeGreaterThan(0);
  });

  it("creates unverified user in DB", async () => {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        roles: users.roles,
        emailVerifiedAt: users.emailVerifiedAt,
        preferredLocale: users.preferredLocale,
      })
      .from(users)
      .where(eq(users.email, STUDENT_EMAIL))
      .limit(1);

    expect(user).toBeDefined();
    expect(user.firstName).toBe("Dummy");
    expect(user.lastName).toBe("Student");
    expect(user.roles).toBe("member");
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.preferredLocale).toBe("en");
  });

  it("creates booking record with correct fields", async () => {
    const [booking] = await db
      .select({
        id: lessonBookings.id,
        proProfileId: lessonBookings.proProfileId,
        proLocationId: lessonBookings.proLocationId,
        date: lessonBookings.date,
        startTime: lessonBookings.startTime,
        endTime: lessonBookings.endTime,
        status: lessonBookings.status,
        paymentStatus: lessonBookings.paymentStatus,
        priceCents: lessonBookings.priceCents,
        manageToken: lessonBookings.manageToken,
      })
      .from(lessonBookings)
      .where(eq(lessonBookings.id, bookingId))
      .limit(1);

    expect(booking.proProfileId).toBe(PRO_PROFILE_ID);
    expect(booking.proLocationId).toBe(PRO_LOCATION_ID);
    expect(booking.date).toBe(bookingDate);
    expect(booking.startTime).toBe(bookingStartTime);
    expect(booking.endTime).toBe(bookingEndTime);
    expect(booking.status).toBe("confirmed");
    expect(booking.paymentStatus).toBe("manual");
    expect(booking.priceCents).toBe(6500); // 60 min = €65
    expect(booking.manageToken).toHaveLength(64);
  });

  it("creates participant record", async () => {
    const participants = await db
      .select()
      .from(lessonParticipants)
      .where(eq(lessonParticipants.bookingId, bookingId));

    expect(participants).toHaveLength(1);
    expect(participants[0].firstName).toBe("Dummy");
    expect(participants[0].lastName).toBe("Student");
    expect(participants[0].email).toBe(STUDENT_EMAIL);
    expect(participants[0].phone).toBe("+32471000000");
  });

  it("creates pro↔student relationship", async () => {
    const [relation] = await db
      .select({
        source: proStudents.source,
        status: proStudents.status,
      })
      .from(proStudents)
      .where(
        and(
          eq(proStudents.proProfileId, PRO_PROFILE_ID),
          eq(proStudents.userId, createdStudentUserId!)
        )
      )
      .limit(1);

    expect(relation).toBeDefined();
    expect(relation.source).toBe("self");
    expect(relation.status).toBe("active");
  });

  it("slot is no longer available", async () => {
    const slots = await getAvailableSlots(
      PRO_PROFILE_ID,
      PRO_LOCATION_ID,
      bookingDate,
      60
    );
    const taken = slots.find(
      (s) =>
        s.startTime === bookingStartTime && s.endTime === bookingEndTime
    );
    expect(taken).toBeUndefined();
  });

  it("sent claim-and-verify email to student", async () => {
    const emails = await findEmails(
      `to:${STUDENT_EMAIL} subject:"Claude Test Pro"`,
      emailSentAt
    );

    expect(emails.length).toBeGreaterThan(0);
    const studentEmail = emails[0];
    expect(studentEmail.to).toContain(STUDENT_EMAIL);
    // Should contain the claim link
    expect(studentEmail.bodyHtml).toContain("/api/auth/claim-booking?token=");
    // Should contain registration upsell link
    expect(studentEmail.bodyHtml).toContain("/register?");
  }, 30_000);

  it("sent notification email to pro", async () => {
    const emails = await findEmails(
      `to:${PRO_EMAIL} from:noreply@golflessons.be "Dummy Student"`,
      emailSentAt
    );

    expect(emails.length).toBeGreaterThan(0);
    const proEmail = emails[0];
    expect(proEmail.to).toContain(PRO_EMAIL);
    // Should contain student details
    expect(proEmail.bodyHtml).toContain("Dummy");
    expect(proEmail.bodyHtml).toContain("Student");
    expect(proEmail.bodyHtml).toContain(STUDENT_EMAIL);
  }, 30_000);

  it("claim link JWT is valid and contains correct data", async () => {
    const emails = await findEmails(
      `to:${STUDENT_EMAIL} subject:"Claude Test Pro"`,
      emailSentAt
    );

    const html = emails[0].bodyHtml;
    const tokenMatch = html.match(
      /\/api\/auth\/claim-booking\?token=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/
    );
    expect(tokenMatch).not.toBeNull();

    const token = tokenMatch![1];
    const { payload } = await jwtVerify(token, getSecret());
    expect(payload.purpose).toBe("claim-booking");
    expect(payload.userId).toBe(createdStudentUserId);
    expect(payload.bookingId).toBe(bookingId);
  }, 30_000);
});

// ═══════════════════════════════════════════════════════
// Phase 2: Verified Student Rebooking
// ═══════════════════════════════════════════════════════

describe("Phase 2: Verified student rebooking (branch=verified)", () => {
  let bookingId2: number;
  let bookingDate2: string;
  let bookingStartTime2: string;
  let bookingEndTime2: string;
  let emailSentAt2: number;

  it("mark student as a fully registered account (simulating claim + register)", async () => {
    expect(createdStudentUserId).not.toBeNull();
    // Phase 2 covers a returning student with a real account. Under the
    // task-65 rule that's gated on `password` being set, not just on
    // emailVerifiedAt — so we set both here.
    await db
      .update(users)
      .set({
        emailVerifiedAt: new Date(),
        password: "$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKL.fake",
      })
      .where(eq(users.id, createdStudentUserId!));

    const [user] = await db
      .select({
        emailVerifiedAt: users.emailVerifiedAt,
        password: users.password,
      })
      .from(users)
      .where(eq(users.id, createdStudentUserId!))
      .limit(1);
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.password).not.toBeNull();
  });

  it("books again as verified student", async () => {
    bookingDate2 = await getNextAvailableDate(
      PRO_PROFILE_ID,
      PRO_LOCATION_ID,
      60
    );
    const slots = await getAvailableSlots(
      PRO_PROFILE_ID,
      PRO_LOCATION_ID,
      bookingDate2,
      60
    );
    // Pick a different slot than Phase 1 if same date
    const slot = slots[slots.length > 1 ? 1 : 0];
    bookingStartTime2 = slot.startTime;
    bookingEndTime2 = slot.endTime;

    emailSentAt2 = Date.now();
    const result = await createBookingDirect({
      proId: PRO_PROFILE_ID,
      proLocationId: PRO_LOCATION_ID,
      date: bookingDate2,
      startTime: bookingStartTime2,
      endTime: bookingEndTime2,
      duration: 60,
      firstName: "Dummy",
      lastName: "Student",
      email: STUDENT_EMAIL,
      phone: "+32471000000",
      notes: "[TEST] Phase 2 — verified rebooking",
    });

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("branch", "verified");
    bookingId2 = (result as { bookingId: number }).bookingId;
    createdBookingIds.push(bookingId2);
  });

  it("did NOT create a new user (reused existing)", async () => {
    const allWithEmail = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, STUDENT_EMAIL));
    expect(allWithEmail).toHaveLength(1);
    expect(allWithEmail[0].id).toBe(createdStudentUserId);
  });

  it("sent login-link email (not claim-verify)", async () => {
    const emails = await findEmails(
      `to:${STUDENT_EMAIL} subject:"Claude Test Pro"`,
      emailSentAt2
    );

    expect(emails.length).toBeGreaterThan(0);
    const email = emails[0];
    // Should NOT contain claim link
    expect(email.bodyHtml).not.toContain("/api/auth/claim-booking?token=");
    // Should contain login link
    expect(email.bodyHtml).toContain("/login?email=");
    // Should NOT contain registration upsell
    expect(email.bodyHtml).not.toContain("/register?");
  }, 30_000);

  it("pro email does NOT have unverified badge", async () => {
    const emails = await findEmails(
      `to:${PRO_EMAIL} from:noreply@golflessons.be "Dummy Student"`,
      emailSentAt2
    );

    expect(emails.length).toBeGreaterThan(0);
    // The "email not yet verified" badge should be absent
    // Check for the typical unverified warning text
    const html = emails[0].bodyHtml.toLowerCase();
    expect(html).not.toContain("not yet verified");
    expect(html).not.toContain("not verified");
  }, 30_000);
});

// ═══════════════════════════════════════════════════════
// Phase 3: Unverified Returning Student
// ═══════════════════════════════════════════════════════

describe("Phase 3: Unverified returning student (branch=unverified)", () => {
  let bookingId3: number;
  let emailSentAt3: number;

  it("reset student to unverified stub (no password, email not verified)", async () => {
    // Under task-65's "no password = no account" rule, just clearing
    // emailVerifiedAt isn't enough — the password set in Phase 2 still
    // marks this row as a real account. To re-create the "unverified
    // returning student" scenario, clear both.
    await db
      .update(users)
      .set({ emailVerifiedAt: null, password: null })
      .where(eq(users.id, createdStudentUserId!));

    const [user] = await db
      .select({
        emailVerifiedAt: users.emailVerifiedAt,
        password: users.password,
      })
      .from(users)
      .where(eq(users.id, createdStudentUserId!))
      .limit(1);
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.password).toBeNull();
  });

  it("books with updated name/phone", async () => {
    const date = await getNextAvailableDate(
      PRO_PROFILE_ID,
      PRO_LOCATION_ID,
      30
    );
    const slots = await getAvailableSlots(
      PRO_PROFILE_ID,
      PRO_LOCATION_ID,
      date,
      30
    );
    const slot = slots[slots.length - 1]; // pick last slot to avoid conflicts

    emailSentAt3 = Date.now();
    const result = await createBookingDirect({
      proId: PRO_PROFILE_ID,
      proLocationId: PRO_LOCATION_ID,
      date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      duration: 30,
      firstName: "Updated",
      lastName: "Name",
      email: STUDENT_EMAIL,
      phone: "+32471999999",
      notes: "[TEST] Phase 3 — unverified returning",
    });

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("branch", "unverified");
    bookingId3 = (result as { bookingId: number }).bookingId;
    createdBookingIds.push(bookingId3);
  });

  it("updated name and phone on existing user row", async () => {
    const [user] = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        preferredLocale: users.preferredLocale,
      })
      .from(users)
      .where(eq(users.id, createdStudentUserId!))
      .limit(1);

    expect(user.firstName).toBe("Updated");
    expect(user.lastName).toBe("Name");
    expect(user.phone).toBe("+32471999999");
    // Locale should be preserved (not overwritten)
    expect(user.preferredLocale).toBe("en");
  });

  it("30-min booking has correct price", async () => {
    const [booking] = await db
      .select({ priceCents: lessonBookings.priceCents })
      .from(lessonBookings)
      .where(eq(lessonBookings.id, bookingId3))
      .limit(1);

    expect(booking.priceCents).toBe(3500); // 30 min = €35
  });

  it("sent claim-verify email (not login link)", async () => {
    const emails = await findEmails(
      `to:${STUDENT_EMAIL} subject:"Claude Test Pro"`,
      emailSentAt3
    );

    expect(emails.length).toBeGreaterThan(0);
    expect(emails[0].bodyHtml).toContain("/api/auth/claim-booking?token=");
  }, 30_000);
});

// ═══════════════════════════════════════════════════════
// Phase 4: Edge Cases
// ═══════════════════════════════════════════════════════

describe("Phase 4: Edge cases", () => {
  it("honeypot triggers silent discard", async () => {
    const result = await createBookingDirect({
      proId: PRO_PROFILE_ID,
      proLocationId: PRO_LOCATION_ID,
      date: "2026-05-01",
      startTime: "10:00",
      endTime: "11:00",
      duration: 60,
      firstName: "Bot",
      lastName: "Spam",
      email: "bot@spam.com",
      phone: "+12025551234",
      honeypot: "http://spam.com",
    });

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("bookingId", 0);

    // No booking should exist from this
    const bookings = await db
      .select({ id: lessonBookings.id })
      .from(lessonBookings)
      .where(eq(lessonBookings.notes, "[HONEYPOT]"))
      .limit(1);
    expect(bookings).toHaveLength(0);
  });

  it("rejects booking with missing required fields", async () => {
    const result = await createBookingDirect({
      proId: PRO_PROFILE_ID,
      proLocationId: PRO_LOCATION_ID,
      date: "2026-05-01",
      startTime: "10:00",
      endTime: "11:00",
      duration: 60,
      firstName: "",
      lastName: "Student",
      email: STUDENT_EMAIL,
      phone: "+32471000000",
    });

    expect(result).toHaveProperty("error");
  });

  it("rejects booking with invalid email format", async () => {
    const result = await createBookingDirect({
      proId: PRO_PROFILE_ID,
      proLocationId: PRO_LOCATION_ID,
      date: "2026-05-01",
      startTime: "10:00",
      endTime: "11:00",
      duration: 60,
      firstName: "Bad",
      lastName: "Email",
      email: "not-an-email",
      phone: "+32471000000",
    });

    expect(result).toHaveProperty("error");
  });

  it("rejects booking with invalid phone format", async () => {
    const result = await createBookingDirect({
      proId: PRO_PROFILE_ID,
      proLocationId: PRO_LOCATION_ID,
      date: "2026-05-01",
      startTime: "10:00",
      endTime: "11:00",
      duration: 60,
      firstName: "Bad",
      lastName: "Phone",
      email: "valid@email.com",
      phone: "0471000000", // not E.164
    });

    expect(result).toHaveProperty("error");
  });

  it("rejects booking for non-existent pro id", async () => {
    const result = await createBookingDirect({
      proId: 999999, // never assigned
      proLocationId: PRO_LOCATION_ID,
      date: "2026-05-01",
      startTime: "10:00",
      endTime: "11:00",
      duration: 60,
      firstName: "Test",
      lastName: "User",
      email: "test@example.com",
      phone: "+32471000000",
    });

    expect(result).toHaveProperty("error", "Pro not found");
  });

  it("rejects double-booking the same slot", async () => {
    // First, re-verify student so we don't hit email issues
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, createdStudentUserId!));

    const date = await getNextAvailableDate(
      PRO_PROFILE_ID,
      PRO_LOCATION_ID,
      60
    );
    const slots = await getAvailableSlots(
      PRO_PROFILE_ID,
      PRO_LOCATION_ID,
      date,
      60
    );
    const slot = slots[0];

    // Book it once
    const result1 = await createBookingDirect({
      proId: PRO_PROFILE_ID,
      proLocationId: PRO_LOCATION_ID,
      date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      duration: 60,
      firstName: "Dummy",
      lastName: "Student",
      email: STUDENT_EMAIL,
      phone: "+32471000000",
      notes: "[TEST] Double booking — first",
    });
    expect(result1).toHaveProperty("success", true);
    createdBookingIds.push((result1 as { bookingId: number }).bookingId);

    // Try to book the same slot again
    const result2 = await createBookingDirect({
      proId: PRO_PROFILE_ID,
      proLocationId: PRO_LOCATION_ID,
      date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      duration: 60,
      firstName: "Another",
      lastName: "Student",
      email: "another-student@example.com",
      phone: "+32471111111",
      notes: "[TEST] Double booking — second (should fail)",
    });

    expect(result2).toHaveProperty("error", "Slot unavailable");
  });
});

// ═══════════════════════════════════════════════════════
// Phase 5: Booking Preferences
// ═══════════════════════════════════════════════════════

describe("Phase 5: Booking preferences are learned", () => {
  it("preferences are saved on pro_students row", async () => {
    // Give the fire-and-forget a moment
    await new Promise((r) => setTimeout(r, 2000));

    const [relation] = await db
      .select({
        preferredLocationId: proStudents.preferredLocationId,
        preferredDuration: proStudents.preferredDuration,
        preferredDayOfWeek: proStudents.preferredDayOfWeek,
        preferredTime: proStudents.preferredTime,
      })
      .from(proStudents)
      .where(
        and(
          eq(proStudents.proProfileId, PRO_PROFILE_ID),
          eq(proStudents.userId, createdStudentUserId!)
        )
      )
      .limit(1);

    expect(relation).toBeDefined();
    // At minimum, location and duration should be set
    expect(relation.preferredLocationId).toBe(PRO_LOCATION_ID);
    expect(relation.preferredDuration).toBeTypeOf("number");
  });
});
