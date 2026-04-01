import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

async function main() {
  // Source: silverswing DB
  const srcUrl = process.env.SRC_DB_URL;
  // Dest: lessons DB
  const dstUrl = process.env.POSTGRES_URL;

  if (!srcUrl || !dstUrl) {
    console.error("Set SRC_DB_URL and POSTGRES_URL");
    process.exit(1);
  }

  const srcSql = neon(srcUrl);
  const dstDb = drizzle(neon(dstUrl), { schema });

  // Fetch from silverswing
  const rows = await srcSql`
    SELECT first_name, last_name, email, password, preferred_locale
    FROM users
    WHERE email IN (
      'tinne.wellens@silverswing.golf',
      'nadine.dickens@silverswing.golf',
      'olivier.philips@silverswing.golf'
    )
  `;

  console.log(`Found ${rows.length} users in silverswing DB`);

  for (const r of rows) {
    // Determine golflessons email and roles
    let email: string;
    let roles: string;

    if (r.email === "olivier.philips@silverswing.golf") {
      email = "olivier.philips@golflessons.be";
      roles = "admin,pro";
    } else {
      // tinne and nadine keep their silverswing emails as admin
      email = r.email;
      roles = "admin";
    }

    await dstDb
      .insert(schema.users)
      .values({
        firstName: r.first_name,
        lastName: r.last_name,
        email,
        password: r.password,
        roles,
        preferredLocale: r.preferred_locale || "nl",
      })
      .onConflictDoUpdate({
        target: schema.users.email,
        set: {
          firstName: r.first_name,
          lastName: r.last_name,
          password: r.password,
          roles,
        },
      });

    console.log(`  ${email} (${roles})`);

    // Create pro profile for Olivier
    if (r.email === "olivier.philips@silverswing.golf") {
      const [user] = await dstDb
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1);

      if (user) {
        await dstDb
          .insert(schema.proProfiles)
          .values({
            userId: user.id,
            slug: "olivier-philips",
            displayName: `${r.first_name} ${r.last_name}`,
            published: false, // Will publish when profile is filled out
          })
          .onConflictDoUpdate({
            target: schema.proProfiles.userId,
            set: {
              displayName: `${r.first_name} ${r.last_name}`,
            },
          });
        console.log(`  Pro profile: olivier-philips (unpublished)`);
      }
    }
  }

  console.log("Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
