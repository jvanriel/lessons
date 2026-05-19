/**
 * Sliding-session refresh helpers — extracted from middleware so
 * they're unit-testable in isolation. The middleware composes
 * `readIat` + `maybeRefreshSession` on every protected-route visit
 * to mint a fresh 7-day token when the existing one is more than a
 * day old. (task #157)
 */

import type { NextResponse } from "next/server";
import { createSessionToken, type SessionPayload } from "@/lib/auth";

/** Refresh the cookie when the existing JWT is older than this. */
export const SESSION_REFRESH_AFTER_SECONDS = 24 * 60 * 60;

/** New cookie TTL applied on refresh. Mirrors `setSessionCookie`. */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/**
 * Decode the JWT `iat` (issued-at) claim without re-verifying the
 * signature. Callers have typically just verified the token via
 * `verifySessionToken`, so re-doing the signature check would be
 * wasteful — we only need the timestamp.
 *
 * Returns null when the token doesn't have a parseable payload, in
 * which case the caller should skip the refresh. Falling back to
 * a fresh refresh would be wrong: a tampered token shouldn't trigger
 * a renewal of itself.
 */
export function readIat(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = JSON.parse(atob(parts[1])) as { iat?: number };
    return typeof json.iat === "number" ? json.iat : null;
  } catch {
    return null;
  }
}

/**
 * Mint a fresh session token + write the cookie back on `response`
 * IF the existing token is older than `SESSION_REFRESH_AFTER_SECONDS`.
 * No-op otherwise — including when the token's `iat` can't be read
 * (defensive). Best-effort: an error during the mint/cookie-set
 * leaves the original cookie in place and lets the request through.
 */
export async function maybeRefreshSession(
  rawToken: string,
  session: SessionPayload,
  response: NextResponse,
  /** Override the "now" reference, in seconds since epoch. Pure test seam. */
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const iat = readIat(rawToken);
  if (iat === null) return false;
  const ageSeconds = nowSeconds - iat;
  if (ageSeconds < SESSION_REFRESH_AFTER_SECONDS) return false;
  try {
    const fresh = await createSessionToken({
      userId: session.userId,
      email: session.email,
      roles: session.roles,
    });
    response.cookies.set("user-session", fresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });
    return true;
  } catch {
    return false;
  }
}
