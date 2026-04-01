import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("POSTGRES_URL not set");
    process.exit(1);
  }

  const db = drizzle(neon(url), { schema });

  // Get all users
  const allUsers = await db
    .select({ id: schema.users.id, email: schema.users.email, firstName: schema.users.firstName, lastName: schema.users.lastName })
    .from(schema.users);

  const aliases: { userId: number; email: string; label: string; isPrimary: boolean }[] = [];

  for (const u of allUsers) {
    // Primary email as first entry
    aliases.push({ userId: u.id, email: u.email, label: "primary", isPrimary: true });

    // Add known aliases
    if (u.email === "jan.vanriel@golflessons.be") {
      aliases.push({ userId: u.id, email: "jan.vanriel@silverswing.golf", label: "silverswing", isPrimary: false });
      aliases.push({ userId: u.id, email: "jvanriel@telenet.be", label: "private", isPrimary: false });
    }
    if (u.email === "claude.code@golflessons.be") {
      aliases.push({ userId: u.id, email: "claude.code@silverswing.golf", label: "silverswing", isPrimary: false });
    }
    if (u.email === "tinne.wellens@silverswing.golf") {
      aliases.push({ userId: u.id, email: "tinne.wellens@golflessons.be", label: "golflessons", isPrimary: false });
    }
    if (u.email === "nadine.dickens@silverswing.golf") {
      aliases.push({ userId: u.id, email: "nadine.dickens@golflessons.be", label: "golflessons", isPrimary: false });
    }
    if (u.email === "olivier.philips@golflessons.be") {
      aliases.push({ userId: u.id, email: "olivier.philips@silverswing.golf", label: "silverswing", isPrimary: false });
    }
  }

  for (const a of aliases) {
    await db
      .insert(schema.userEmails)
      .values(a)
      .onConflictDoNothing();
    console.log(`  ${a.isPrimary ? "*" : " "} ${a.email} (${a.label})`);
  }

  console.log(`Done! ${aliases.length} email entries.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
