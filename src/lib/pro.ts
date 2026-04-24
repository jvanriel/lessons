import { db } from "@/lib/db";
import { locations, proLocations, proProfiles } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Resolve the IANA timezone for a `pro_locations` row. Slot computation,
 * availability windows and calendar rendering need this so that a pro
 * teaching outside Europe/Brussels gets correct day boundaries and
 * notice thresholds. Falls back to Europe/Brussels when the row is
 * missing — matches the historical default before multi-TZ support.
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
  return row?.tz ?? "Europe/Brussels";
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
