import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

/**
 * WebAuthn helpers — Face ID / Touch ID / Windows Hello / hardware keys
 * via passkeys.
 *
 * Relying-Party (RP) ID is the eTLD+1 the user sees in the address bar.
 * It must NOT include a port, scheme, or path. Browsers refuse to
 * register a credential whose RP ID isn't a registrable suffix of the
 * current origin's hostname, which is what gives passkeys their
 * phishing resistance. The expected origin we pass to verification
 * helpers is the full URL incl. scheme + (optional) port.
 */

const PROD_HOST = "golflessons.be";
const PREVIEW_HOST = "preview.golflessons.be";

// Defensive: env vars set via the Vercel UI sometimes carry trailing
// whitespace (a stray space at the end of the value pasted into the
// dashboard). WebAuthn verification fails strict-equality on the
// origin, so a single space breaks Face ID / Touch ID registration
// with a confusing "expected '...<space>'" error.
function cleanEnv(v: string | undefined): string | undefined {
  return v?.trim() || undefined;
}

export function getRpId(): string {
  // Use the public app URL when set (production / preview deploys).
  // For local dev fall back to "localhost" — that's what Safari and
  // Chrome accept on http://localhost during testing.
  const appUrl = cleanEnv(process.env.NEXT_PUBLIC_APP_URL);
  if (appUrl) {
    try {
      return new URL(appUrl).hostname;
    } catch {
      // fall through
    }
  }
  if (process.env.VERCEL_ENV === "production") return PROD_HOST;
  if (process.env.VERCEL_ENV === "preview") return PREVIEW_HOST;
  return "localhost";
}

export function getRpName(): string {
  return "Golf Lessons";
}

export function getExpectedOrigin(): string | string[] {
  const appUrl = cleanEnv(process.env.NEXT_PUBLIC_APP_URL);
  if (appUrl) return appUrl.replace(/\/$/, "");
  if (process.env.VERCEL_ENV === "production") return `https://${PROD_HOST}`;
  if (process.env.VERCEL_ENV === "preview") return `https://${PREVIEW_HOST}`;
  // Dev: accept the common local-dev origins.
  return ["http://localhost:3000", "http://127.0.0.1:3000"];
}

// ─── Challenge cookie ─────────────────────────────────────────────
//
// The challenge bytes the server hands to the browser have to come back
// in the assertion/attestation response unchanged, and the verify
// endpoint needs them to call `verifyAuthenticationResponse` /
// `verifyRegistrationResponse`. We stash them in a short-lived signed
// cookie (5 min) so the verify route doesn't need a server-side store.
// Two purposes: "register" (binds to a userId) and "auth" (no userId
// — discoverable login).

const CHALLENGE_COOKIE = "wa-challenge";

interface ChallengePayload {
  challenge: string;
  purpose: "register" | "auth";
  userId?: number;
}

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me",
  );
}

export async function setChallengeCookie(payload: ChallengePayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(getSecret());
  (await cookies()).set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 5,
    path: "/",
  });
}

export async function consumeChallengeCookie(
  expectedPurpose: "register" | "auth",
): Promise<ChallengePayload | null> {
  const jar = await cookies();
  const token = jar.get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;
  // One-shot — clear regardless of validity so a stolen challenge can't
  // be replayed by a second verify call.
  jar.delete(CHALLENGE_COOKIE);
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.purpose !== expectedPurpose) return null;
    return payload as unknown as ChallengePayload;
  } catch {
    return null;
  }
}
