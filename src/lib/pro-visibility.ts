import { sql, type SQL } from "drizzle-orm";
import { proProfiles, users } from "./db/schema";

/**
 * SQL fragment that hides `dummy*@golflessons.be` test pros from any
 * public-facing pro lookup when running on production. Defense-in-depth:
 * the seed script never targets production, but if a dummy row ever
 * leaks into the prod DB the live UI must not surface it.
 *
 * On preview and local dev returns `true` so the Claude/Nadine test
 * pros stay visible — that's where they're meant to live.
 *
 * Use it inside the same `and(...)` block that already filters by
 * `published = true` and `deletedAt is null`. Requires the surrounding
 * query to be on `proProfiles` (we filter via `proProfiles.userId`).
 */
export function excludeDummiesOnProduction(): SQL {
  if (process.env.VERCEL_ENV !== "production") {
    return sql`true`;
  }
  return sql`${proProfiles.userId} NOT IN (
    SELECT ${users.id} FROM ${users}
    WHERE LOWER(${users.email}) LIKE 'dummy%@golflessons.be'
  )`;
}
