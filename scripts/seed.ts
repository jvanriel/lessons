import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

async function seed() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("POSTGRES_URL not set");
    process.exit(1);
  }

  const sql = neon(url);
  const db = drizzle(sql, { schema });

  const password = await hash("changeme123", 12);

  // ─── Users ────────────────────────────────────────────
  const seedUsers = [
    {
      firstName: "Jan",
      lastName: "Van Riel",
      email: "jan.vanriel@golflessons.be",
      password,
      roles: "member,pro,admin,dev",
      preferredLocale: "en",
    },
    {
      firstName: "Claude",
      lastName: "Code",
      email: "claude.code@golflessons.be",
      password,
      roles: "dev",
      preferredLocale: "en",
    },
  ];

  for (const user of seedUsers) {
    await db
      .insert(schema.users)
      .values(user)
      .onConflictDoUpdate({
        target: schema.users.email,
        set: {
          firstName: user.firstName,
          lastName: user.lastName,
          password: user.password,
          roles: user.roles,
        },
      });
    console.log(`  User: ${user.email} (${user.roles})`);
  }

  // ─── Pro Profile (test only — not published) ──────────
  const [jan] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "jan.vanriel@golflessons.be"))
    .limit(1);

  if (jan) {
    await db
      .insert(schema.proProfiles)
      .values({
        userId: jan.id,
        displayName: "Jan Van Riel",
        bio: "Test pro account for development purposes. Not a real golf professional.",
        specialties: "Platform testing",
        published: false, // Test account — not shown on public browse page
      })
      .onConflictDoUpdate({
        target: schema.proProfiles.userId,
        set: {
          displayName: "Jan Van Riel",
          bio: "Test pro account for development purposes. Not a real golf professional.",
          published: false,
        },
      });
    console.log("  Pro profile: jan-van-riel (test, unpublished)");
  }

  console.log("Done!");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
