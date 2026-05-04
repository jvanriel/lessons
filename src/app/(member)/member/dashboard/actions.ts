"use server";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { qrLoginTokens } from "@/lib/db/schema";
import { lt } from "drizzle-orm";
import { randomBytes } from "node:crypto";

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

const QR_TTL_MS = 5 * 60 * 1000;

/**
 * URL-safe base62 alphabet (no `0OIl1` to avoid lookalikes when an
 * id is read aloud or copied by hand). 8 chars from this 56-char
 * pool = ~1.5 trillion combinations — well beyond the
 * birthday-collision limit for the 5-minute live window.
 */
const ID_ALPHABET =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ID_LEN = 8;

function generateShortId(): string {
  const bytes = randomBytes(ID_LEN);
  let out = "";
  for (let i = 0; i < ID_LEN; i++) {
    out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return out;
}

/**
 * Generate a short-lived (5 min) QR login id from the current session.
 * The QR code on the dashboard encodes `<origin>/q/<id>` (~30 chars
 * total) — small enough that any default phone camera scanner picks
 * it up reliably. The redeem endpoint at `/q/<id>` resolves to the
 * full session JWT and installs it as the user-session cookie.
 *
 * Returns the short id, or null if the caller doesn't have a valid
 * session.
 */
export async function generateQRToken(): Promise<string | null> {
  const jar = await cookies();
  const sessionToken = jar.get("user-session")?.value;
  if (!sessionToken) return null;

  let payload;
  try {
    ({ payload } = await jwtVerify(sessionToken, getSecret()));
  } catch {
    return null;
  }

  const sessionJwt = await new SignJWT({
    userId: payload.userId,
    email: payload.email,
    roles: payload.roles,
    purpose: "qr-login",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(getSecret());

  // Opportunistic cleanup: drop any rows older than the TTL while
  // we're inserting a new one. Tiny query, runs on every QR generation
  // — keeps the table small without needing a cron.
  await db.delete(qrLoginTokens).where(lt(qrLoginTokens.expiresAt, new Date()));

  // Retry on the off-chance of an id collision (~1 in 1.5 trillion;
  // never expected to fire, but cheap to guard against).
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = generateShortId();
    try {
      await db.insert(qrLoginTokens).values({
        id,
        userId: payload.userId as number,
        sessionJwt,
        expiresAt: new Date(Date.now() + QR_TTL_MS),
      });
      return id;
    } catch {
      // Likely PK collision — try a fresh id.
      continue;
    }
  }
  return null;
}
