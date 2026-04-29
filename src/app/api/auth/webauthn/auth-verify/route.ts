import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { users, webauthnCredentials } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { setSessionCookie } from "@/lib/auth";
import {
  consumeChallengeCookie,
  getExpectedOrigin,
  getRpId,
} from "@/lib/webauthn";
import { logEvent } from "@/lib/events";

export async function POST(req: NextRequest) {
  const challenge = await consumeChallengeCookie("auth");
  if (!challenge) {
    return NextResponse.json(
      { error: "Challenge expired — please try again." },
      { status: 400 },
    );
  }

  const body = (await req.json()) as { response: AuthenticationResponseJSON };
  if (!body?.response?.id) {
    return NextResponse.json({ error: "Missing response" }, { status: 400 });
  }

  // Look up the credential row + the user it belongs to. Match on
  // `credentialId` exactly — the authenticator returns the same id we
  // stored at registration. Skip soft-deleted users.
  const [hit] = await db
    .select({
      credentialId: webauthnCredentials.credentialId,
      publicKey: webauthnCredentials.publicKey,
      counter: webauthnCredentials.counter,
      transports: webauthnCredentials.transports,
      userId: webauthnCredentials.userId,
      userEmail: users.email,
      userRoles: users.roles,
    })
    .from(webauthnCredentials)
    .innerJoin(users, eq(users.id, webauthnCredentials.userId))
    .where(
      and(
        eq(webauthnCredentials.credentialId, body.response.id),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);

  if (!hit) {
    return NextResponse.json(
      { error: "Unknown credential" },
      { status: 401 },
    );
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: getExpectedOrigin(),
      expectedRPID: getRpId(),
      credential: {
        id: hit.credentialId,
        publicKey: Buffer.from(hit.publicKey, "base64url"),
        counter: hit.counter,
        transports: (hit.transports ?? undefined) as
          | AuthenticatorTransportFuture[]
          | undefined,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verification failed" },
      { status: 400 },
    );
  }

  if (!verification.verified || !verification.authenticationInfo) {
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 401 },
    );
  }

  // Bump the counter so a cloned authenticator can't replay an older
  // assertion. Also touch lastUsedAt for the account UI.
  await db
    .update(webauthnCredentials)
    .set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    })
    .where(eq(webauthnCredentials.credentialId, hit.credentialId));

  // Mint the session cookie — same shape as password login.
  const roles = (hit.userRoles ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean) as ("member" | "pro" | "admin" | "dev")[];

  await setSessionCookie({
    userId: hit.userId,
    email: hit.userEmail,
    roles,
  });

  await logEvent({
    type: "auth.passkey.login",
    actorId: hit.userId,
    payload: { credentialId: hit.credentialId },
  }).catch(() => {});

  return NextResponse.json({
    success: true,
    user: { id: hit.userId, email: hit.userEmail, roles },
  });
}

type AuthenticatorTransportFuture =
  | "ble"
  | "cable"
  | "hybrid"
  | "internal"
  | "nfc"
  | "smart-card"
  | "usb";
