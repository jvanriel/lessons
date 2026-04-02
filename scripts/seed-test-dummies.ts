import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("POSTGRES_URL not set");
    process.exit(1);
  }

  const db = drizzle(neon(url), { schema });
  const password = await hash("changeme123", 12);

  // ─── Dummy Pro ────────────────────────────────────
  await db
    .insert(schema.users)
    .values({
      firstName: "Dummy",
      lastName: "Pro",
      email: "dummy.pro@golflessons.be",
      password,
      roles: "pro",
      preferredLocale: "en",
    })
    .onConflictDoUpdate({
      target: schema.users.email,
      set: { roles: "pro" },
    });
  console.log("  User: dummy.pro@golflessons.be (pro)");

  const [proUser] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "dummy.pro@golflessons.be"))
    .limit(1);

  // Pro profile (unpublished — test only)
  await db
    .insert(schema.proProfiles)
    .values({
      userId: proUser.id,
      slug: "dummy-pro",
      displayName: "Dummy Pro",
      bio: "Test pro account for automated testing.",
      specialties: "Testing",
      lessonDurations: [30, 60],
      maxGroupSize: 4,
      bookingEnabled: true,
      bookingNotice: 24,
      bookingHorizon: 60,
      cancellationHours: 24,
      published: false,
    })
    .onConflictDoUpdate({
      target: schema.proProfiles.userId,
      set: {
        displayName: "Dummy Pro",
        published: false,
      },
    });

  const [proProfile] = await db
    .select({ id: schema.proProfiles.id })
    .from(schema.proProfiles)
    .where(eq(schema.proProfiles.userId, proUser.id))
    .limit(1);

  console.log(`  Pro profile: dummy-pro (id=${proProfile.id}, unpublished)`);

  // Test location
  let locationId: number;
  const [existingLoc] = await db
    .select({ id: schema.locations.id })
    .from(schema.locations)
    .where(eq(schema.locations.name, "Test Golf Club"))
    .limit(1);

  if (existingLoc) {
    locationId = existingLoc.id;
  } else {
    const [inserted] = await db
      .insert(schema.locations)
      .values({ name: "Test Golf Club", city: "Testville", country: "Belgium" })
      .returning({ id: schema.locations.id });
    locationId = inserted.id;
  }
  console.log(`  Location: Test Golf Club (id=${locationId})`);

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

  // ─── Dummy Student ────────────────────────────────
  await db
    .insert(schema.users)
    .values({
      firstName: "Dummy",
      lastName: "Student",
      email: "dummy.student@golflessons.be",
      password,
      roles: "member",
      preferredLocale: "en",
    })
    .onConflictDoUpdate({
      target: schema.users.email,
      set: { roles: "member" },
    });

  const [studentUser] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "dummy.student@golflessons.be"))
    .limit(1);

  console.log(`  User: dummy.student@golflessons.be (member, id=${studentUser.id})`);

  // ─── Email aliases ────────────────────────────────
  await db.insert(schema.userEmails).values({ userId: proUser.id, email: "dummy.pro@golflessons.be", label: "primary", isPrimary: true }).onConflictDoNothing();
  await db.insert(schema.userEmails).values({ userId: studentUser.id, email: "dummy.student@golflessons.be", label: "primary", isPrimary: true }).onConflictDoNothing();

  console.log("\nTest IDs for vitest:");
  console.log(`  DUMMY_PRO_PROFILE_ID = ${proProfile.id}`);
  console.log(`  DUMMY_PRO_LOCATION_ID = ${proLocationId}`);
  console.log(`  DUMMY_STUDENT_USER_ID = ${studentUser.id}`);
  console.log("\nDone!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
