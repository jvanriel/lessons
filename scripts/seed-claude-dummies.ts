/**
 * Seed script for Claude test accounts.
 *
 * Creates:
 *   - dummy-pro-claude@golflessons.be   (pro user + profile + location + availability)
 *   - Ensures dummy-student-claude@golflessons.be does NOT exist (clean slate for booking tests)
 *
 * Both emails are Google Workspace aliases routing to `it.admin`.
 *
 * Usage: POSTGRES_URL_PREVIEW="..." npx tsx scripts/seed-claude-dummies.ts
 *   or:  pnpm seed:claude-dummies  (with .env.local sourced)
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { hash } from "bcryptjs";
import { eq, and } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const PRO_EMAIL = "dummy-pro-claude@golflessons.be";
const STUDENT_EMAIL = "dummy-student-claude@golflessons.be";

async function main() {
  // Hard refusal: this seed creates a published pro with a `dummy*`
  // email. We never want it in the production DB, so don't fall back
  // to POSTGRES_URL — the preview URL must be set explicitly.
  const url = process.env.POSTGRES_URL_PREVIEW;
  if (!url) {
    console.error(
      "POSTGRES_URL_PREVIEW must be set. Refusing to fall back to POSTGRES_URL — this script seeds a `dummy*@golflessons.be` pro and must never touch production.",
    );
    process.exit(1);
  }
  if (process.env.VERCEL_ENV === "production") {
    console.error("VERCEL_ENV=production detected. Refusing to seed.");
    process.exit(1);
  }

  const db = drizzle(neon(url), { schema });
  const password = await hash("changeme123", 12);

  console.log("─── Setting up Claude test accounts ───\n");

  // ═══════════════════════════════════════════════════
  // 1. Dummy Pro
  // ═══════════════════════════════════════════════════
  const [existingPro] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, PRO_EMAIL))
    .limit(1);

  if (existingPro) {
    await db
      .update(schema.users)
      .set({ roles: "pro,member", emailVerifiedAt: new Date() })
      .where(eq(schema.users.id, existingPro.id));
  } else {
    await db.insert(schema.users).values({
      firstName: "Claude",
      lastName: "Pro",
      email: PRO_EMAIL,
      password,
      roles: "pro,member",
      preferredLocale: "en",
      emailVerifiedAt: new Date(),
    });
  }

  const [proUser] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, PRO_EMAIL))
    .limit(1);

  console.log(`  User: ${PRO_EMAIL} (id=${proUser.id})`);

  // Pro profile — published, booking enabled, two durations
  await db
    .insert(schema.proProfiles)
    .values({
      userId: proUser.id,
      displayName: "Claude Test Pro",
      bio: "Automated testing pro. Do not book real lessons here.",
      specialties: "Testing, QA",
      lessonDurations: [30, 60],
      lessonPricing: { "30": 3500, "60": 6500 },
      maxGroupSize: 4,
      bookingEnabled: true,
      bookingNotice: 1, // 1 hour notice (easy for testing)
      bookingHorizon: 60,
      cancellationHours: 24,
      allowBookingWithoutPayment: true,
      published: true,
    })
    .onConflictDoUpdate({
      target: schema.proProfiles.userId,
      set: {
        displayName: "Claude Test Pro",
        lessonDurations: [30, 60],
        lessonPricing: { "30": 3500, "60": 6500 },
        bookingEnabled: true,
        bookingNotice: 1,
        allowBookingWithoutPayment: true,
        published: true,
      },
    });

  const [proProfile] = await db
    .select({ id: schema.proProfiles.id })
    .from(schema.proProfiles)
    .where(eq(schema.proProfiles.userId, proUser.id))
    .limit(1);

  console.log(
    `  Pro profile: claude-test-pro (id=${proProfile.id}, published)`
  );

  // Location — reuse "Test Golf Club" if it exists, otherwise create
  let locationId: number;
  const [existingLoc] = await db
    .select({ id: schema.locations.id })
    .from(schema.locations)
    .where(eq(schema.locations.name, "Claude Test Club"))
    .limit(1);

  if (existingLoc) {
    locationId = existingLoc.id;
  } else {
    const [inserted] = await db
      .insert(schema.locations)
      .values({
        name: "Claude Test Club",
        city: "Testville",
        country: "Belgium",
      })
      .returning({ id: schema.locations.id });
    locationId = inserted.id;
  }
  console.log(`  Location: Claude Test Club (id=${locationId})`);

  // Pro-location link
  const [existingLink] = await db
    .select({ id: schema.proLocations.id })
    .from(schema.proLocations)
    .where(eq(schema.proLocations.proProfileId, proProfile.id))
    .limit(1);

  let proLocationId: number;
  if (existingLink) {
    proLocationId = existingLink.id;
  } else {
    const [inserted] = await db
      .insert(schema.proLocations)
      .values({ proProfileId: proProfile.id, locationId })
      .returning({ id: schema.proLocations.id });
    proLocationId = inserted.id;
  }
  console.log(`  Pro-location link (id=${proLocationId})`);

  // Availability — Mon-Sat, morning + afternoon blocks
  // Delete old availability for this profile first
  await db
    .delete(schema.proAvailability)
    .where(eq(schema.proAvailability.proProfileId, proProfile.id));

  const slots = [
    { day: 0, start: "09:00", end: "13:00" }, // Monday
    { day: 1, start: "09:00", end: "13:00" }, // Tuesday
    { day: 1, start: "14:00", end: "18:00" },
    { day: 2, start: "09:00", end: "13:00" }, // Wednesday
    { day: 2, start: "14:00", end: "18:00" },
    { day: 3, start: "09:00", end: "13:00" }, // Thursday
    { day: 3, start: "14:00", end: "18:00" },
    { day: 4, start: "09:00", end: "13:00" }, // Friday
    { day: 5, start: "09:00", end: "12:00" }, // Saturday
  ];

  for (const s of slots) {
    await db.insert(schema.proAvailability).values({
      proProfileId: proProfile.id,
      proLocationId,
      dayOfWeek: s.day,
      startTime: s.start,
      endTime: s.end,
    });
  }
  console.log(`  Availability (Claude Test Club): ${slots.length} weekly blocks`);

  // ─── Second location: Royal Golf Club ─────────────
  let location2Id: number;
  const [existingLoc2] = await db
    .select({ id: schema.locations.id })
    .from(schema.locations)
    .where(eq(schema.locations.name, "Royal Golf Club"))
    .limit(1);

  if (existingLoc2) {
    location2Id = existingLoc2.id;
  } else {
    const [inserted] = await db
      .insert(schema.locations)
      .values({
        name: "Royal Golf Club",
        city: "Brussels",
        country: "Belgium",
      })
      .returning({ id: schema.locations.id });
    location2Id = inserted.id;
  }

  const [existingLink2] = await db
    .select({ id: schema.proLocations.id })
    .from(schema.proLocations)
    .where(
      and(
        eq(schema.proLocations.proProfileId, proProfile.id),
        eq(schema.proLocations.locationId, location2Id)
      )
    )
    .limit(1);

  let proLocation2Id: number;
  if (existingLink2) {
    proLocation2Id = existingLink2.id;
  } else {
    const [inserted] = await db
      .insert(schema.proLocations)
      .values({ proProfileId: proProfile.id, locationId: location2Id })
      .returning({ id: schema.proLocations.id });
    proLocation2Id = inserted.id;
  }

  const slots2 = [
    { day: 1, start: "09:00", end: "12:00" }, // Tuesday
    { day: 3, start: "14:00", end: "18:00" }, // Thursday afternoon
    { day: 4, start: "09:00", end: "13:00" }, // Friday
  ];

  for (const s of slots2) {
    await db.insert(schema.proAvailability).values({
      proProfileId: proProfile.id,
      proLocationId: proLocation2Id,
      dayOfWeek: s.day,
      startTime: s.start,
      endTime: s.end,
    });
  }
  console.log(
    `  Location 2: Royal Golf Club, Brussels (id=${proLocation2Id})`
  );
  console.log(`  Availability (Royal Golf Club): ${slots2.length} weekly blocks`);

  // Email alias row
  const [existingEmail] = await db
    .select({ id: schema.userEmails.id })
    .from(schema.userEmails)
    .where(eq(schema.userEmails.userId, proUser.id))
    .limit(1);

  if (!existingEmail) {
    await db.insert(schema.userEmails).values({
      userId: proUser.id,
      email: PRO_EMAIL,
      label: "primary",
      isPrimary: true,
    });
  }

  // ═══════════════════════════════════════════════════
  // 2. Clean up student — must NOT exist for Phase 1
  // ═══════════════════════════════════════════════════
  const [existingStudent] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, STUDENT_EMAIL))
    .limit(1);

  if (existingStudent) {
    // Delete related records first
    await db
      .delete(schema.proStudents)
      .where(eq(schema.proStudents.userId, existingStudent.id));
    // Delete bookings by this user
    const bookings = await db
      .select({ id: schema.lessonBookings.id })
      .from(schema.lessonBookings)
      .where(eq(schema.lessonBookings.bookedById, existingStudent.id));
    for (const b of bookings) {
      await db
        .delete(schema.lessonParticipants)
        .where(eq(schema.lessonParticipants.bookingId, b.id));
    }
    await db
      .delete(schema.lessonBookings)
      .where(eq(schema.lessonBookings.bookedById, existingStudent.id));
    await db
      .delete(schema.userEmails)
      .where(eq(schema.userEmails.userId, existingStudent.id));
    await db.delete(schema.users).where(eq(schema.users.id, existingStudent.id));
    console.log(
      `\n  Cleaned up existing student ${STUDENT_EMAIL} (id=${existingStudent.id})`
    );
  } else {
    console.log(`\n  Student ${STUDENT_EMAIL} does not exist (clean slate ✓)`);
  }

  console.log("\n─── Summary ───");
  console.log(`  Pro:     ${PRO_EMAIL}`);
  console.log(`  Profile: /book/${proProfile.id}`);
  console.log(`  Student: ${STUDENT_EMAIL} (does NOT exist — ready for Phase 1)`);
  console.log(`  Inbox:   it.admin (both emails alias here)`);
  console.log("\nDone!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
