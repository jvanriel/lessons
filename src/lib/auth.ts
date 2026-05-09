import { SignJWT, jwtVerify } from "jose";
import { hash, compare } from "bcryptjs";
import { cookies } from "next/headers";
import { cache } from "react";
import { and, eq, isNull } from "drizzle-orm";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const SESSION_COOKIE = "user-session";
const IMPERSONATOR_COOKIE = "impersonator-session";

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

export type UserRole = "member" | "admin" | "dev" | "pro";

export interface SessionPayload {
  userId: number;
  email: string;
  roles: UserRole[];
}

// --- Password helpers ---

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hashed: string
): Promise<boolean> {
  return compare(password, hashed);
}

// --- JWT helpers ---

export async function createSessionToken(
  payload: SessionPayload
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// --- Cookie helpers ---

export async function setSessionCookie(payload: SessionPayload) {
  const token = await createSessionToken(payload);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

/**
 * Per-request cache: confirms the user the JWT claims to be is
 * still present (and not soft-deleted) in the DB. Without this a
 * cookie issued before a hard-delete (or before deleted_at was
 * set) would keep authenticating for the cookie's full 7-day TTL.
 * Wrapping in React's `cache()` dedupes the lookup when multiple
 * Server Components in a single render call `getSession()`.
 */
const userIsLive = cache(async (userId: number): Promise<boolean> => {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  return !!row;
});

export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  // JWT signature is fine, but the user may have been deleted
  // since the cookie was issued — fail closed.
  if (!(await userIsLive(payload.userId))) return null;
  // Attach user context to Sentry so errors are attributed to this user
  Sentry.setUser({ id: String(payload.userId), email: payload.email });
  return payload;
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

// --- Impersonation helpers ---

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function startImpersonation(targetPayload: SessionPayload) {
  const currentSession = await getSession();
  if (!currentSession) throw new Error("Not logged in");

  const isDev = currentSession.roles.includes("dev");
  const isAdmin = currentSession.roles.includes("admin");

  if (!isDev && !isAdmin) throw new Error("Unauthorized");

  const targetRoles = targetPayload.roles;
  if (isAdmin && !isDev) {
    if (targetRoles.includes("admin") || targetRoles.includes("dev")) {
      throw new Error("Admin can only impersonate pro and member accounts");
    }
  }

  const currentToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (currentToken) {
    (await cookies()).set(IMPERSONATOR_COOKIE, currentToken, {
      ...COOKIE_OPTS,
      maxAge: 60 * 60 * 4,
    });
  }

  await setSessionCookie(targetPayload);
}

export async function stopImpersonation(): Promise<boolean> {
  const jar = await cookies();
  const impersonatorToken = jar.get(IMPERSONATOR_COOKIE)?.value;
  if (!impersonatorToken) return false;

  jar.set(SESSION_COOKIE, impersonatorToken, {
    ...COOKIE_OPTS,
    maxAge: 60 * 60 * 24 * 7,
  });
  jar.delete(IMPERSONATOR_COOKIE);
  return true;
}

export async function getImpersonatorSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(IMPERSONATOR_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// --- Role helpers ---

export function parseRoles(rolesStr: string | null | undefined): UserRole[] {
  if (!rolesStr) return [];
  return rolesStr
    .split(",")
    .map((r) => r.trim())
    .filter((r): r is UserRole =>
      ["member", "admin", "dev", "pro"].includes(r)
    );
}

export function hasRole(
  session: SessionPayload | null,
  role: UserRole
): boolean {
  if (!session) return false;
  return session.roles.includes(role);
}
