import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { lt } from "drizzle-orm";

export type EventLevel = "info" | "warn" | "error";

export interface LogEventOpts {
  type: string;
  level?: EventLevel;
  actorId?: number | null;
  targetId?: number | null;
  payload?: Record<string, unknown>;
}

/**
 * Log a business event to the `events` table.
 *
 * Fire-and-forget: failures are logged to console.error but never thrown, so
 * adding logEvent to a path will never break the caller.
 *
 * Use this for meaningful events — bookings, signups, pushes, errors — NOT
 * high-volume page views or keystroke-level activity.
 */
export async function logEvent(opts: LogEventOpts): Promise<void> {
  try {
    await db.insert(events).values({
      type: opts.type,
      level: opts.level ?? "info",
      actorId: opts.actorId ?? null,
      targetId: opts.targetId ?? null,
      payload: opts.payload ?? null,
    });
  } catch (err) {
    console.error("logEvent failed:", err, opts);
  }
}

/**
 * Delete events older than the given retention window (default 90 days).
 * Called from the daily backup cron.
 */
export async function purgeOldEvents(days: number = 90): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(events)
    .where(lt(events.createdAt, cutoff))
    .returning({ id: events.id });
  return deleted.length;
}
