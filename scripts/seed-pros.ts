import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import * as schema from "../src/lib/db/schema";

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("POSTGRES_URL not set");
    process.exit(1);
  }

  const db = drizzle(neon(url), { schema });
  const password = await hash("changeme123", 12);

  // ─── Thibaut Leys ────────────────────────────────────

  // Create user if not exists
  await db
    .insert(schema.users)
    .values({
      firstName: "Thibaut",
      lastName: "Leys",
      email: "thibaut.leys@golflessons.be",
      password,
      roles: "pro",
      preferredLocale: "nl",
    })
    .onConflictDoUpdate({
      target: schema.users.email,
      set: { roles: "pro" },
    });
  console.log("  User: thibaut.leys@golflessons.be (pro)");

  const [thibautUser] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "thibaut.leys@golflessons.be"))
    .limit(1);

  // Create pro profile
  await db
    .insert(schema.proProfiles)
    .values({
      userId: thibautUser.id,
      displayName: "Thibaut Leys",
      bio: "Thibaut is a passionate golf professional with years of experience helping players of all levels improve their game. His patient teaching style and deep understanding of swing mechanics make him a favorite among both beginners and experienced golfers looking to take their game to the next level.\n\nWith a focus on building solid fundamentals and developing a repeatable, consistent swing, Thibaut ensures every student leaves each lesson with clear takeaways and a personalized practice plan.",
      specialties: "Swing mechanics, short game, course management",
      photoUrl: "/images/thibault_leys.jpg",
      lessonDurations: [30, 60, 90],
      maxGroupSize: 4,
      pricePerHour: null, // TBD
      bookingEnabled: true,
      bookingNotice: 24,
      bookingHorizon: 60,
      cancellationHours: 24,
      published: true,
    })
    .onConflictDoUpdate({
      target: schema.proProfiles.userId,
      set: {
        displayName: "Thibaut Leys",
        bio: "Thibaut is a passionate golf professional with years of experience helping players of all levels improve their game. His patient teaching style and deep understanding of swing mechanics make him a favorite among both beginners and experienced golfers looking to take their game to the next level.\n\nWith a focus on building solid fundamentals and developing a repeatable, consistent swing, Thibaut ensures every student leaves each lesson with clear takeaways and a personalized practice plan.",
        specialties: "Swing mechanics, short game, course management",
        photoUrl: "/images/thibault_leys.jpg",
        pricePerHour: null, // TBD
        published: true,
      },
    });
  console.log("  Pro: thibaut-leys (published)");

  // ─── Olivier Philips ─────────────────────────────────

  // Update existing user (already created via copy-users.ts)
  const [olivierUser] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "olivier.philips@golflessons.be"))
    .limit(1);

  if (!olivierUser) {
    console.error("  Olivier user not found — run copy-users.ts first");
    process.exit(1);
  }

  // Update pro profile
  await db
    .insert(schema.proProfiles)
    .values({
      userId: olivierUser.id,
      displayName: "Olivier Philips",
      bio: "Olivier grew up with golf — he started at age ten at Drie Eycken in Edegem and knew early on that he wanted to make the game his profession. After a career as teaching professional at The National Golf Brussels, he now works from Kempense Golf in Mol, where he coaches golfers of every level.\n\nOlivier's approach is personal and long-term. He follows each student's development season after season, adapting his coaching to their individual game. No one-off clinics, but an ongoing collaboration that ensures real, lasting improvement.",
      specialties: "Full swing, putting, player development",
      photoUrl: "/images/olivier_philips.jpg",
      lessonDurations: [30, 60, 90],
      maxGroupSize: 4,
      pricePerHour: null, // TBD
      bookingEnabled: true,
      bookingNotice: 24,
      bookingHorizon: 60,
      cancellationHours: 24,
      published: true,
    })
    .onConflictDoUpdate({
      target: schema.proProfiles.userId,
      set: {
        displayName: "Olivier Philips",
        bio: "Olivier grew up with golf — he started at age ten at Drie Eycken in Edegem and knew early on that he wanted to make the game his profession. After a career as teaching professional at The National Golf Brussels, he now works from Kempense Golf in Mol, where he coaches golfers of every level.\n\nOlivier's approach is personal and long-term. He follows each student's development season after season, adapting his coaching to their individual game. No one-off clinics, but an ongoing collaboration that ensures real, lasting improvement.",
        specialties: "Full swing, putting, player development",
        photoUrl: "/images/olivier_philips.jpg",
        pricePerHour: null, // TBD
        published: true,
      },
    });
  console.log("  Pro: olivier-philips (published)");

  // ─── Locations ────────────────────────────────────────

  const locationData = [
    { name: "Kempense Golf", city: "Mol", address: "Balen-Neetweg 100, 2400 Mol", country: "Belgium", timezone: "Europe/Brussels" },
    { name: "The National Golf Brussels", city: "Sterrebeek", address: "Tervuursesteenweg 346, 1933 Sterrebeek", country: "Belgium", timezone: "Europe/Brussels" },
    { name: "Drie Eycken Golf", city: "Edegem", address: "Edegemse Baan 9, 2540 Hove", country: "Belgium", timezone: "Europe/Brussels" },
  ];

  for (const loc of locationData) {
    await db
      .insert(schema.locations)
      .values(loc)
      .onConflictDoNothing();
    console.log(`  Location: ${loc.name}, ${loc.city}`);
  }

  // Fetch location IDs
  const allLocations = await db.select().from(schema.locations);
  const locMap = new Map(allLocations.map((l) => [l.name, l.id]));

  // Fetch profile IDs
  const [thibautProfile] = await db
    .select({ id: schema.proProfiles.id })
    .from(schema.proProfiles)
    .where(eq(schema.proProfiles.userId, thibautUser.id))
    .limit(1);

  const [olivierProfile] = await db
    .select({ id: schema.proProfiles.id })
    .from(schema.proProfiles)
    .where(eq(schema.proProfiles.userId, olivierUser.id))
    .limit(1);

  // ─── Pro-Location Links ───────────────────────────────

  const proLocLinks = [
    // Thibaut teaches at Drie Eycken and The National
    { proProfileId: thibautProfile.id, locationId: locMap.get("Drie Eycken Golf")!, priceIndication: null, sortOrder: 0 },
    { proProfileId: thibautProfile.id, locationId: locMap.get("The National Golf Brussels")!, priceIndication: null, sortOrder: 1 },
    // Olivier teaches at Kempense Golf
    { proProfileId: olivierProfile.id, locationId: locMap.get("Kempense Golf")!, priceIndication: null, sortOrder: 0 },
  ];

  for (const link of proLocLinks) {
    // Check if already exists
    const existing = await db
      .select({ id: schema.proLocations.id })
      .from(schema.proLocations)
      .where(
        eq(schema.proLocations.proProfileId, link.proProfileId)
      )
      .limit(1);

    if (existing.length === 0 || !existing.find(() => true)) {
      await db.insert(schema.proLocations).values(link);
    }
  }
  console.log("  Pro-location links created");

  // ─── Default Profile Pages ────────────────────────────

  const profilePages = [
    {
      proProfileId: thibautProfile.id,
      slug: "profile",
      type: "profile" as const,
      title: "Thibaut Leys — Golf Professional",
      metaDescription: "Book golf lessons with Thibaut Leys. Expert coaching in swing mechanics, short game, and course management.",
      intro: "Welcome! I'm Thibaut, a golf professional dedicated to helping you improve your game. Whether you're picking up a club for the first time or looking to shave strokes off your handicap, I'm here to guide you with personalized coaching tailored to your goals.\n\nI believe in building solid fundamentals and developing a swing you can trust under pressure. Every lesson comes with a clear practice plan so you keep improving between sessions.",
      ctaLabel: "Book a Lesson",
      ctaUrl: `/member/book/${thibautProfile.id}`,
      published: true,
    },
    {
      proProfileId: olivierProfile.id,
      slug: "profile",
      type: "profile" as const,
      title: "Olivier Philips — Golf Professional",
      metaDescription: "Book golf lessons with Olivier Philips at Kempense Golf, Mol. Experienced coaching for all levels.",
      intro: "Golf has been my life since I was ten years old. After years as a teaching professional at The National Golf Brussels, I now coach from Kempense Golf in Mol.\n\nMy approach is simple: I get to know your game, set clear goals, and work with you over time to achieve real, lasting improvement. I combine technical instruction with on-course strategy, and I use video analysis to give you visual feedback on your progress.\n\nI look forward to working with you — whether it's your first lesson or your hundredth.",
      ctaLabel: "Book a Lesson",
      ctaUrl: `/member/book/${olivierProfile.id}`,
      published: true,
    },
  ];

  for (const page of profilePages) {
    await db
      .insert(schema.proPages)
      .values(page)
      .onConflictDoNothing();
    console.log(`  Page: ${page.title}`);
  }

  // ─── Email aliases ────────────────────────────────────

  await db
    .insert(schema.userEmails)
    .values({ userId: thibautUser.id, email: "thibaut.leys@golflessons.be", label: "primary", isPrimary: true })
    .onConflictDoNothing();

  console.log("\nDone!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
