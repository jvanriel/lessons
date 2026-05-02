import { db } from "@/lib/db";
import { locations, proLocations, proProfiles } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Resolve the IANA timezone for a `pro_locations` row. Every wall-clock
 * time we store on lessons / availability / overrides is in this TZ;
 * slot computation, notice thresholds, cancellation deadlines and
 * calendar rendering all need it. The `locations.timezone` column is
 * NOT NULL with a Brussels DB default. Today (2026-05) every existing
 * row has the default value because the onboarding wizard + locations
 * editor don't yet ask for a TZ — that's pass 2 of this work. Once
 * those forms ship + the existing rows are backfilled, the default
 * stops mattering. Until then, a missing row here is a real lookup
 * error (bad `proLocationId`); we throw instead of silently returning
 * Brussels because that fallback masked non-Brussels pros' bugs in
 * the slot engine and ICS generation (gaps.md §0).
 */
export async function getProLocationTimezone(
  proLocationId: number,
): Promise<string> {
  const [row] = await db
    .select({ tz: locations.timezone })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(proLocations.id, proLocationId))
    .limit(1);
  if (!row?.tz) {
    throw new Error(
      `getProLocationTimezone: pro_location ${proLocationId} not found or has empty timezone`,
    );
  }
  return row.tz;
}

/**
 * True when the given email is a reserved test account and the app is
 * running on a non-production deploy. Preview-only test accounts
 * (dummy-pro@, dummy.student@, etc.) get affordances real users don't
 * — e.g. their pro profile auto-publishes on signup so we can test
 * the end-to-end student-books-a-lesson flow without going through the
 * full "set availability + prices + toggle published" dance.
 *
 * NEVER returns true on VERCEL_ENV=production.
 */
export function isPreviewTestAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  if (process.env.VERCEL_ENV === "production") return false;
  const e = email.toLowerCase();
  return (
    (e.startsWith("dummy-") || e.startsWith("dummy.")) &&
    e.endsWith("@golflessons.be")
  );
}

export async function requireProProfile() {
  const session = await getSession();
  if (!session || (!hasRole(session, "pro") && !hasRole(session, "admin"))) {
    redirect("/login");
  }

  const [profile] = await db
    .select()
    .from(proProfiles)
    .where(and(eq(proProfiles.userId, session.userId), isNull(proProfiles.deletedAt)))
    .limit(1);

  return { session, profile: profile ?? null };
}

/**
 * Create a pro_profiles shell row for the given user if one doesn't already
 * exist. Used by both the self-service /pro/register flow and admin user
 * create/update — anywhere a user's roles include "pro" we need a profile,
 * otherwise every /pro/* page bounces them to /login via requireProProfile.
 */
export async function ensureProProfile(opts: {
  userId: number;
  firstName: string;
  lastName: string;
  /**
   * Optional — when a dummy-*@golflessons.be email is passed on a
   * non-production deploy, the profile is auto-published so the test
   * pro is immediately visible in the public directory. Safe on
   * production: isPreviewTestAccount short-circuits there.
   */
  email?: string;
}): Promise<void> {
  const [existing] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, opts.userId))
    .limit(1);
  if (existing) return;

  // Default the public display name to just the first name — students
  // see pros by their coaching persona rather than their legal full
  // name. The pro can change it later in the onboarding wizard or on
  // /pro/profile.
  const displayName = opts.firstName.trim() || "Pro";
  const autoPublish = isPreviewTestAccount(opts.email);
  await db.insert(proProfiles).values({
    userId: opts.userId,
    displayName,
    published: autoPublish,
  });
}

/**
 * Normalize a comma-separated roles string. Currently: a pro is also always
 * a member (so pros can book lessons with other pros for their own training).
 * Returns the input string with "member" added if "pro" is present and
 * "member" is missing. Order preserved, no duplicates.
 */
export function normalizeRoles(roles: string): string {
  const list = roles
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  if (list.includes("pro") && !list.includes("member")) {
    list.push("member");
  }
  return Array.from(new Set(list)).join(",");
}
