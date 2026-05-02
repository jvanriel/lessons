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
 * True when `err` is the Postgres `unique_violation` (23505) raised by
 * the partial unique index `lesson_bookings_slot_confirmed_idx`. Used
 * by the booking actions to translate the duplicate-key error into a
 * user-facing "slot just got taken" message instead of crashing.
 *
 * The neon-http driver surfaces PG errors with `.code` on the thrown
 * object (and a `.constraint` field for the index name). We check both
 * to avoid swallowing other 23505s (e.g. the manage-token unique).
 */
export function isSlotConflictError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; constraint?: string; constraint_name?: string; message?: string };
  if (e.code !== "23505") return false;
  const constraint = e.constraint ?? e.constraint_name ?? "";
  if (constraint === "lesson_bookings_slot_confirmed_idx") return true;
  // Neon HTTP sometimes packs the constraint into the message instead.
  return typeof e.message === "string" && e.message.includes("lesson_bookings_slot_confirmed_idx");
}
