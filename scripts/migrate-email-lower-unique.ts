// One-shot migration: replace the case-sensitive UNIQUE(email) on `users`
// and `user_emails` with a functional UNIQUE INDEX on LOWER(email), and
// normalise any existing rows to lowercase.
//
// Safe to re-run — every step is idempotent. Run with:
//   node --env-file=.env.local --import tsx scripts/migrate-email-lower-unique.ts <prod|preview|both>

import { neon } from "@neondatabase/serverless";

type Target = "prod" | "preview";

function urlFor(target: Target): string {
  if (target === "prod") {
    const u = process.env.DATABASE_URL;
    if (!u) throw new Error("DATABASE_URL is not set");
    return u;
  }
  const u = process.env.POSTGRES_URL_PREVIEW;
  if (!u) throw new Error("POSTGRES_URL_PREVIEW is not set");
  return u;
}

async function migrate(target: Target) {
  console.log(`\n=== ${target.toUpperCase()} ===`);
  const sql = neon(urlFor(target));

  // 1. Pre-flight: any rows with non-lowercase email?
  const mixedUsers = await sql`
    SELECT id, email FROM users WHERE email != LOWER(email)
  `;
  const mixedAliases = await sql`
    SELECT id, email FROM user_emails WHERE email != LOWER(email)
  `;
  console.log(
    `pre-flight: ${mixedUsers.length} mixed-case in users, ${mixedAliases.length} in user_emails`
  );

  // 2. Pre-flight: collisions if we lowercase?
  const usersCollisions = await sql`
    SELECT LOWER(email) AS lower_email, COUNT(*)::int AS n
    FROM users GROUP BY LOWER(email) HAVING COUNT(*) > 1
  `;
  const aliasCollisions = await sql`
    SELECT LOWER(email) AS lower_email, COUNT(*)::int AS n
    FROM user_emails GROUP BY LOWER(email) HAVING COUNT(*) > 1
  `;
  if (usersCollisions.length || aliasCollisions.length) {
    console.error("COLLISION — manual merge required:");
    console.error("users:", usersCollisions);
    console.error("user_emails:", aliasCollisions);
    throw new Error("Aborting: collisions exist");
  }

  // 3. Lowercase any stragglers (no-op on clean data).
  if (mixedUsers.length > 0) {
    await sql`UPDATE users SET email = LOWER(email) WHERE email != LOWER(email)`;
    console.log(`normalised ${mixedUsers.length} users.email rows`);
  }
  if (mixedAliases.length > 0) {
    await sql`UPDATE user_emails SET email = LOWER(email) WHERE email != LOWER(email)`;
    console.log(`normalised ${mixedAliases.length} user_emails.email rows`);
  }

  // 4. Drop the case-sensitive constraints (drizzle's `.unique()` outputs).
  //    Using IF EXISTS so re-runs are safe.
  await sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique`;
  await sql`ALTER TABLE user_emails DROP CONSTRAINT IF EXISTS user_emails_email_unique`;
  console.log("dropped case-sensitive unique constraints");

  // 5. Create functional unique indexes on LOWER(email).
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx
    ON users (LOWER(email))
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS user_emails_email_lower_idx
    ON user_emails (LOWER(email))
  `;
  console.log("created functional unique indexes on LOWER(email)");

  // 6. Verify.
  const verify = await sql`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename IN ('users','user_emails') AND indexname LIKE '%lower%'
    ORDER BY tablename
  `;
  console.log("verify:", verify);
}

async function main() {
  const arg = process.argv[2] as Target | "both" | undefined;
  if (!arg || !["prod", "preview", "both"].includes(arg)) {
    console.error("Usage: pnpm tsx scripts/migrate-email-lower-unique.ts <prod|preview|both>");
    process.exit(1);
  }
  if (arg === "both" || arg === "preview") await migrate("preview");
  if (arg === "both" || arg === "prod") await migrate("prod");
  console.log("\n✓ done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
