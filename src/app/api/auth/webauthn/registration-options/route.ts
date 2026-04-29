import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { users, webauthnCredentials } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import {
  getRpId,
  getRpName,
  setChallengeCookie,
} from "@/lib/webauthn";

/**
 * Generates a registration challenge for the currently signed-in user
 * to add a passkey to their account. Server stashes the challenge in a
 * short-lived cookie that `registration-verify` reads back.
 *
 * The browser-side companion calls `startRegistration(json)` from
 * `@simplewebauthn/browser` with the response of this endpoint.
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, firstName: users.firstName })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Don't ask the authenticator to register a credential it already
  // owns for this account — pass excludeCredentials so the browser UI
  // shows "you already have this registered" instead of letting the
  // user create a duplicate.
  const existing = await db
    .select({
      credentialId: webauthnCredentials.credentialId,
      transports: webauthnCredentials.transports,
    })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, user.id));

  const options = await generateRegistrationOptions({
    rpName: getRpName(),
    rpID: getRpId(),
    userID: new TextEncoder().encode(String(user.id)),
    userName: user.email,
    userDisplayName: user.firstName || user.email,
    attestationType: "none",
    authenticatorSelection: {
      // Resident keys / discoverable credentials — required for
      // username-less login (Face ID prompt without typing email).
      residentKey: "preferred",
      userVerification: "preferred",
    },
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: (c.transports ?? undefined) as
        | AuthenticatorTransportFuture[]
        | undefined,
    })),
  });

  await setChallengeCookie({
    challenge: options.challenge,
    purpose: "register",
    userId: user.id,
  });

  return NextResponse.json(options);
}

// Re-imported here so the helper type is in scope above.
type AuthenticatorTransportFuture =
  | "ble"
  | "cable"
  | "hybrid"
  | "internal"
  | "nfc"
  | "smart-card"
  | "usb";
