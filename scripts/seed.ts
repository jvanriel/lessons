import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { hash } from "bcryptjs";
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
    console.log(`  Seeded: ${user.email} (${user.roles})`);
  }

  console.log("Done!");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
