import { db } from "@/lib/db";
import { proProfiles } from "@/lib/db/schema";
import { eq, and, isNull, like } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";

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
 * Lowercase, strip diacritics, replace non-alphanumerics with dashes.
 * Used for pro profile slugs in the public URL (/pros/[slug]).
 */
export function slugifyProName(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Find a unique slug for a new pro profile, given a base. Adds -2, -3, ...
 * suffixes on collision; falls back to a timestamp suffix after 1000 tries.
 */
export async function pickUniqueProSlug(base: string): Promise<string> {
  const cleanBase = slugifyProName(base) || "pro";
  const existing = await db
    .select({ slug: proProfiles.slug })
    .from(proProfiles)
    .where(like(proProfiles.slug, `${cleanBase}%`));
  const taken = new Set(existing.map((r) => r.slug));
  if (!taken.has(cleanBase)) return cleanBase;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${cleanBase}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${cleanBase}-${Date.now()}`;
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
}): Promise<void> {
  const [existing] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, opts.userId))
    .limit(1);
  if (existing) return;

  const displayName = `${opts.firstName} ${opts.lastName}`.trim() || "Pro";
  const slug = await pickUniqueProSlug(displayName);
  await db.insert(proProfiles).values({
    userId: opts.userId,
    slug,
    displayName,
    published: false,
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
