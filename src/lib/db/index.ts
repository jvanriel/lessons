import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Production uses POSTGRES_URL. Preview deployments require POSTGRES_URL_PREVIEW
// to prevent accidental writes to the production database.
// Local dev uses POSTGRES_URL_PREVIEW if available, otherwise POSTGRES_URL.
const vercelEnv = process.env.VERCEL_ENV; // "production" | "preview" | undefined (local)

let databaseUrl: string;
if (vercelEnv === "production") {
  if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL is not set for production");
  databaseUrl = process.env.POSTGRES_URL;
} else if (vercelEnv === "preview") {
  if (!process.env.POSTGRES_URL_PREVIEW) throw new Error("POSTGRES_URL_PREVIEW is not set for preview — refusing to fall back to production DB");
  databaseUrl = process.env.POSTGRES_URL_PREVIEW;
} else {
  // Local development
  databaseUrl = process.env.POSTGRES_URL_PREVIEW || process.env.POSTGRES_URL || "";
  if (!databaseUrl) throw new Error("No database URL configured. Set POSTGRES_URL_PREVIEW or POSTGRES_URL in .env.local");
}
const sql = neon(databaseUrl);
export const db = drizzle(sql, { schema });

/**
 * True when `err` is the Postgres `unique_violation` (23505) raised
 * by the partial unique index `lesson_bookings_slot_confirmed_idx`.
 * Used by the booking actions to translate the duplicate-key error
 * into a user-facing "slot just got taken" message instead of
 * crashing.
 *
 * Two layers to unwrap:
 *
 *   1. Drizzle wraps the underlying `NeonDbError` in its own
 *      `DrizzleQueryError` and stores the original on `.cause`. The
 *      raw neon driver, when called directly via the `sql` template
 *      tag, throws the `NeonDbError` un-wrapped.
 *   2. Both error shapes carry PG's `.code` ("23505") and the
 *      `.constraint` field with the index name.
 *
 * We check both the top-level error AND `err.cause` so the catch
 * works whether the action is called via drizzle (the production
 * path) or against the raw driver (some integration tests). Any
 * other 23505 (e.g. the `manage_token` unique) deliberately returns
 * false so the action surfaces the original error rather than
 * silently mis-translating.
 */
export function isSlotConflictError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const SLOT_INDEX = "lesson_bookings_slot_confirmed_idx";

  function matches(candidate: unknown): boolean {
    if (!candidate || typeof candidate !== "object") return false;
    const c = candidate as {
      code?: string;
      constraint?: string;
      constraint_name?: string;
      message?: string;
    };
    if (c.code !== "23505") return false;
    const constraint = c.constraint ?? c.constraint_name ?? "";
    if (constraint === SLOT_INDEX) return true;
    return typeof c.message === "string" && c.message.includes(SLOT_INDEX);
  }

  // Direct shape (raw neon driver throws here).
  if (matches(err)) return true;
  // Drizzle wraps the original in `.cause`.
  const wrapper = err as { cause?: unknown };
  return matches(wrapper.cause);
}
