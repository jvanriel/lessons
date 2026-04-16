"use server";

import { db } from "@/lib/db";
import {
  proProfiles,
  proLocations,
  locations,
  proAvailability,
  proAvailabilityOverrides,
  lessonBookings,
  lessonParticipants,
  proStudents,
  users,
} from "@/lib/db/schema";
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";
import {
  computeAvailableSlots,
  buildIcs,
  type AvailabilityTemplate,
  type AvailabilityOverride,
  type ExistingBooking,
} from "@/lib/lesson-slots";
import crypto from "node:crypto";
import { SignJWT } from "jose";
// Lightweight server-side shape check for phone numbers. The real
// validation runs on the client (PhoneField uses libphonenumber-js/min).
// We don't pull that metadata bundle into the server graph because it
// blows up Turbopack dev compile times on /book (~20s longer cold
// compile). Server-side we only need to catch obvious garbage and
// empty-string submissions — bad but parseable numbers get normalised
// to null by the client before posting.
function looksLikeE164(phone: string): boolean {
  // E.164: + followed by 8-15 digits. The client already guarantees this
  // shape; this is defence-in-depth against direct form-post abuse.
  return /^\+[1-9]\d{7,14}$/.test(phone);
}
import { sendEmail } from "@/lib/mail";
import {
  buildClaimAndVerifyBookingEmail,
  buildNewBookingOnAccountEmail,
  getClaimBookingSubject,
  buildProBookingNotificationEmail,
  getProBookingNotificationSubject,
} from "@/lib/email-templates";
import { resolveLocale, type Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { getLocale } from "@/lib/locale";
import { updateBookingPreferences } from "@/lib/booking-preferences";

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

// ─── Public queries (no auth) ──────────────────────────

/**
 * Return every published, bookable pro with their active locations
 * pre-joined — used by /book (no slug) to render the pro picker as
 * the first step of the wizard without a round-trip.
 */
export async function getAllBookablePros() {
  const pros = await db
    .select({
      id: proProfiles.id,
      slug: proProfiles.slug,
      displayName: proProfiles.displayName,
      photoUrl: proProfiles.photoUrl,
      bio: proProfiles.bio,
      specialties: proProfiles.specialties,
      lessonDurations: proProfiles.lessonDurations,
      lessonPricing: proProfiles.lessonPricing,
      maxGroupSize: proProfiles.maxGroupSize,
      bookingHorizon: proProfiles.bookingHorizon,
      bookingNotice: proProfiles.bookingNotice,
    })
    .from(proProfiles)
    .where(
      and(
        eq(proProfiles.published, true),
        eq(proProfiles.bookingEnabled, true),
        isNull(proProfiles.deletedAt)
      )
    )
    .orderBy(proProfiles.displayName);

  if (pros.length === 0) return [];

  // Fetch every active location for these pros in one go.
  const proIds = pros.map((p) => p.id);
  const locs = await db
    .select({
      proProfileId: proLocations.proProfileId,
      id: proLocations.id,
      name: locations.name,
      city: locations.city,
      address: locations.address,
      priceIndication: proLocations.priceIndication,
      lessonDuration: proLocations.lessonDuration,
      sortOrder: proLocations.sortOrder,
    })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(
      and(
        eq(proLocations.active, true),
        inArray(proLocations.proProfileId, proIds)
      )
    )
    .orderBy(proLocations.sortOrder);

  const byPro = new Map<number, typeof locs>();
  for (const l of locs) {
    const arr = byPro.get(l.proProfileId) ?? [];
    arr.push(l);
    byPro.set(l.proProfileId, arr);
  }

  return pros
    .map((p) => ({
      ...p,
      locations: (byPro.get(p.id) ?? []).map(
        ({ proProfileId: _omit, sortOrder: _omit2, ...rest }) => {
          void _omit;
          void _omit2;
          return rest;
        }
      ),
    }))
    .filter((p) => p.locations.length > 0);
}

export async function getPublicPro(slug: string) {
  const [pro] = await db
    .select({
      id: proProfiles.id,
      slug: proProfiles.slug,
      displayName: proProfiles.displayName,
      photoUrl: proProfiles.photoUrl,
      bio: proProfiles.bio,
      specialties: proProfiles.specialties,
      lessonDurations: proProfiles.lessonDurations,
      lessonPricing: proProfiles.lessonPricing,
      maxGroupSize: proProfiles.maxGroupSize,
      bookingEnabled: proProfiles.bookingEnabled,
      bookingHorizon: proProfiles.bookingHorizon,
      bookingNotice: proProfiles.bookingNotice,
    })
    .from(proProfiles)
    .where(
      and(
        eq(proProfiles.slug, slug),
        eq(proProfiles.published, true),
        eq(proProfiles.bookingEnabled, true),
        isNull(proProfiles.deletedAt)
      )
    )
    .limit(1);
  return pro ?? null;
}

export async function getPublicLocations(proProfileId: number) {
  return db
    .select({
      id: proLocations.id,
      name: locations.name,
      city: locations.city,
      address: locations.address,
      priceIndication: proLocations.priceIndication,
      lessonDuration: proLocations.lessonDuration,
    })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(
      and(
        eq(proLocations.proProfileId, proProfileId),
        eq(proLocations.active, true)
      )
    )
    .orderBy(proLocations.sortOrder);
}

export async function getPublicSlots(
  proProfileId: number,
  locationId: number,
  date: string,
  duration: number
) {
  const [pro] = await db
    .select({ bookingNotice: proProfiles.bookingNotice })
    .from(proProfiles)
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);
  if (!pro) return [];

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
          eq(proAvailability.proLocationId, locationId)
        )
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
          eq(lessonBookings.proLocationId, locationId),
          eq(lessonBookings.date, date),
          eq(lessonBookings.status, "confirmed")
        )
      ),
  ]);

  const dateOverrides = overrides.filter(
    (o) =>
      o.date === date &&
      (o.proLocationId === null || o.proLocationId === locationId)
  );

  return computeAvailableSlots(
    date,
    templates as AvailabilityTemplate[],
    dateOverrides as AvailabilityOverride[],
    bookings as ExistingBooking[],
    pro.bookingNotice,
    duration
  );
}

export async function getPublicAvailableDates(
  proProfileId: number,
  locationId: number,
  duration: number
) {
  const [pro] = await db
    .select({
      bookingHorizon: proProfiles.bookingHorizon,
      bookingNotice: proProfiles.bookingNotice,
    })
    .from(proProfiles)
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);
  if (!pro) return [];

  const now = new Date();
  const horizonEnd = new Date(now);
  horizonEnd.setDate(horizonEnd.getDate() + pro.bookingHorizon);
  const todayStr = now.toISOString().split("T")[0];
  const horizonStr = horizonEnd.toISOString().split("T")[0];

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
          eq(proAvailability.proLocationId, locationId)
        )
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
          gte(proAvailabilityOverrides.date, todayStr),
          lte(proAvailabilityOverrides.date, horizonStr)
        )
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
          eq(lessonBookings.proLocationId, locationId),
          eq(lessonBookings.status, "confirmed"),
          gte(lessonBookings.date, todayStr),
          lte(lessonBookings.date, horizonStr)
        )
      ),
  ]);

  const out: string[] = [];
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= horizonEnd) {
    const dateStr = cursor.toISOString().split("T")[0];
    const dateOverrides = overrides.filter(
      (o) =>
        o.date === dateStr &&
        (o.proLocationId === null || o.proLocationId === locationId)
    );
    const dateBookings = bookings.filter((b) => b.date === dateStr);
    const slots = computeAvailableSlots(
      dateStr,
      templates as AvailabilityTemplate[],
      dateOverrides as AvailabilityOverride[],
      dateBookings as ExistingBooking[],
      pro.bookingNotice,
      duration,
      now
    );
    if (slots.length > 0) out.push(dateStr);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

// ─── Public booking create (no auth, pay-later only) ───

/**
 * Create a booking from the public flow. No login required; the student's
 * account is created lazily and the first email they receive is a
 * claim-and-verify magic link.
 *
 * Three user-lookup branches (same HTTP response either way — the difference
 * happens in the email that gets sent, so this can't be used as an email-
 * enumeration oracle):
 *
 *  1. No row for this email → create unverified user, send claim+verify link.
 *  2. Row exists, unverified → reuse row, send claim+verify link (idempotent).
 *  3. Row exists, verified → reuse row, send "new booking on your account"
 *     notice with a login link — NOT a verify link, since email is already
 *     verified.
 */
export async function createPublicBooking(formData: FormData) {
  const uiLocale = await getLocale();

  const slug = (formData.get("slug") as string) || "";
  const proLocationId = Number(formData.get("proLocationId"));
  const date = formData.get("date") as string;
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const duration = Number(formData.get("duration"));
  const participantCount = Number(formData.get("participantCount") || 1);
  const notes = (formData.get("notes") as string) || null;
  const firstName = ((formData.get("firstName") as string) || "").trim();
  const lastName = ((formData.get("lastName") as string) || "").trim();
  const email = ((formData.get("email") as string) || "")
    .trim()
    .toLowerCase();
  const phone = ((formData.get("phone") as string) || "").trim();
  const honeypot = (formData.get("website") as string) || "";

  // Honeypot — legitimate browsers leave this hidden field empty.
  if (honeypot) {
    return { success: true, bookingId: 0 };
  }

  if (
    !slug ||
    !proLocationId ||
    !date ||
    !startTime ||
    !endTime ||
    !duration ||
    !firstName ||
    !lastName ||
    !email ||
    !phone
  ) {
    return { error: t("publicBook.err.fillRequired", uiLocale) };
  }

  if (!firstName || !lastName) {
    return { error: t("publicBook.err.nameRequired", uiLocale) };
  }

  // Very light email shape check — real validation happens when the user
  // clicks the claim-and-verify link.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: t("publicBook.err.invalidEmail", uiLocale) };
  }

  // Phone must look like E.164. Full libphonenumber-js validation runs
  // on the client — this is just a shape gate at the server boundary.
  if (!looksLikeE164(phone)) {
    return { error: t("publicBook.err.invalidPhone", uiLocale) };
  }

  // Load pro (public view — same guards as getPublicPro).
  const pro = await getPublicPro(slug);
  if (!pro) return { error: t("publicBook.err.proNotFound", uiLocale) };

  // Verify slot is still free. This is the same integrity check the
  // authenticated flow does.
  const slots = await getPublicSlots(
    pro.id,
    proLocationId,
    date,
    duration
  );
  if (!slots.some((s) => s.startTime === startTime && s.endTime === endTime)) {
    return { error: t("publicBook.err.slotUnavailable", uiLocale) };
  }

  // Price snapshot — informational only on this flow (no charge). We still
  // record it so later "retroactively pay for this lesson" flows have an
  // authoritative number.
  const perLessonCents = (
    pro.lessonPricing as Record<string, number> | null
  )?.[String(duration)];
  const priceCents =
    typeof perLessonCents === "number" && perLessonCents > 0
      ? perLessonCents * participantCount
      : null;

  // ─── User lookup: three-branch logic ──────────────────
  const existing = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
      preferredLocale: users.preferredLocale,
      emailVerifiedAt: users.emailVerifiedAt,
      roles: users.roles,
    })
    .from(users)
    .where(sql`LOWER(${users.email}) = ${email}`)
    .limit(1);

  let userId: number;
  let branch: "new" | "unverified" | "verified";
  let recipientLocale: Locale;

  if (existing.length === 0) {
    const [inserted] = await db
      .insert(users)
      .values({
        firstName,
        lastName,
        email,
        phone,
        roles: "member",
        preferredLocale: uiLocale,
      })
      .returning({ id: users.id });
    userId = inserted.id;
    branch = "new";
    recipientLocale = uiLocale;
  } else if (existing[0].emailVerifiedAt == null) {
    userId = existing[0].id;
    // Refresh name/phone in case the student typed corrections. Keep the
    // stored locale — it was set when the row was first created and is
    // more reliable than the current UI cookie.
    await db
      .update(users)
      .set({ firstName, lastName, phone })
      .where(eq(users.id, userId));
    branch = "unverified";
    recipientLocale = resolveLocale(existing[0].preferredLocale);
  } else {
    userId = existing[0].id;
    branch = "verified";
    recipientLocale = resolveLocale(existing[0].preferredLocale);
  }

  // ─── Insert the booking ──────────────────────────────
  const manageToken = crypto.randomBytes(32).toString("hex");

  const [booking] = await db
    .insert(lessonBookings)
    .values({
      proProfileId: pro.id,
      bookedById: userId,
      proLocationId,
      date,
      startTime,
      endTime,
      participantCount,
      status: "confirmed",
      notes,
      manageToken,
      priceCents,
      platformFeeCents: null, // Phase A: pay-later only, no commission snapshot.
      paymentStatus: "manual",
    })
    .returning({ id: lessonBookings.id });

  await db.insert(lessonParticipants).values({
    bookingId: booking.id,
    firstName,
    lastName,
    email,
    phone,
  });

  // Upsert the pro↔student relationship so the booking shows up in the
  // pro's student list.
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

  // ─── Emails ──────────────────────────────────────────
  // Look up pro user for the notification.
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

  const [loc] = await db
    .select({ name: locations.name, city: locations.city })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(proLocations.id, proLocationId))
    .limit(1);
  const locationName = loc
    ? loc.city
      ? `${loc.name}, ${loc.city}`
      : loc.name
    : "";

  // Build the student-facing email.
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
      `${getBaseUrl()}/register?firstName=${encodeURIComponent(firstName)}` +
      `&lastName=${encodeURIComponent(lastName)}` +
      `&email=${encodeURIComponent(email)}` +
      `&phone=${encodeURIComponent(phone)}` +
      `&pro=${pro.id}`;

    sendEmail({
      to: email,
      subject: getClaimBookingSubject(
        proUser?.displayName ?? "",
        recipientLocale
      ),
      html: buildClaimAndVerifyBookingEmail({
        firstName,
        proName: proUser?.displayName ?? "",
        locationName,
        date,
        startTime,
        endTime,
        duration,
        claimUrl,
        registerUrl,
        locale: recipientLocale,
      }),
    }).catch(() => {});
  } else {
    // Verified: short notice + login link. Don't re-verify.
    sendEmail({
      to: email,
      subject: getClaimBookingSubject(
        proUser?.displayName ?? "",
        recipientLocale
      ),
      html: buildNewBookingOnAccountEmail({
        firstName,
        proName: proUser?.displayName ?? "",
        locationName,
        date,
        startTime,
        endTime,
        duration,
        loginUrl: `${getBaseUrl()}/login?email=${encodeURIComponent(email)}`,
        locale: recipientLocale,
      }),
    }).catch(() => {});
  }

  // Notify the pro (in-app + email). The email body includes an
  // "unverified" badge when branch !== "verified" so the pro knows to
  // follow up if needed.
  if (proUser) {
    const proLocale = resolveLocale(proUser.proLocale);
    const ics = buildIcs({
      date,
      startTime,
      endTime,
      summary: `Golf lesson with ${proUser.displayName}`,
      location: locationName,
      description: `Booked via golflessons.be — ${firstName} ${lastName}${notes ? ` — Notes: ${notes}` : ""}`,
      bookingId: booking.id,
    });
    const icsAttachment = {
      filename: "lesson.ics",
      contentType: "text/calendar",
      content: ics,
      method: "REQUEST" as const,
    };

    await createNotification({
      type: "new_booking",
      priority: "high",
      targetUserId: proUser.userId,
      title: "New lesson booking",
      message: `${firstName} ${lastName} booked a lesson on ${date} at ${startTime}.${branch !== "verified" ? " (email not yet verified)" : ""}`,
      actionUrl: "/pro/bookings",
      actionLabel: "View bookings",
    });

    sendEmail({
      to: proUser.proEmail,
      subject: getProBookingNotificationSubject(
        `${firstName} ${lastName}`,
        proLocale
      ),
      html: buildProBookingNotificationEmail({
        proFirstName: proUser.proFirstName,
        studentFirstName: firstName,
        studentLastName: lastName,
        studentEmail: email,
        studentPhone: phone,
        locationName,
        date,
        startTime,
        endTime,
        duration,
        participantCount,
        notes,
        locale: proLocale,
        emailUnverified: branch !== "verified",
      }),
      attachments: [icsAttachment],
    }).catch(() => {});
  }

  // Silently learn scheduling preferences on the pro_students row so
  // the student never has to fill out an explicit "scheduling" step —
  // quick-rebook and dashboard suggestions pick these up automatically.
  // Fire-and-forget: a failure here must not fail the booking.
  updateBookingPreferences(
    userId,
    pro.id,
    proLocationId,
    duration,
    date,
    startTime
  ).catch(() => {});

  return { success: true, bookingId: booking.id, branch };
}
