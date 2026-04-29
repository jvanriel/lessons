import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { webauthnCredentials } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import {
  consumeChallengeCookie,
  getExpectedOrigin,
  getRpId,
} from "@/lib/webauthn";
import { logEvent } from "@/lib/events";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const challenge = await consumeChallengeCookie("register");
  if (!challenge || challenge.userId !== session.userId) {
    return NextResponse.json(
      { error: "Challenge expired — please try again." },
      { status: 400 },
    );
  }

  const body = (await req.json()) as {
    response: RegistrationResponseJSON;
    nickname?: string;
  };
  if (!body?.response) {
    return NextResponse.json({ error: "Missing response" }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: getExpectedOrigin(),
      expectedRPID: getRpId(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verification failed" },
      { status: 400 },
    );
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 400 },
    );
  }

  const { credential } = verification.registrationInfo;
  const transports = body.response.response.transports as string[] | undefined;
  const nickname = body.nickname?.trim()?.slice(0, 100) || null;

  // `credential.publicKey` is a Uint8Array of COSE bytes; store as
  // base64url so we can round-trip through JSON without lossy encoding.
  const publicKeyB64 = Buffer.from(credential.publicKey).toString("base64url");

  await db
    .insert(webauthnCredentials)
    .values({
      userId: session.userId,
      credentialId: credential.id,
      publicKey: publicKeyB64,
      counter: credential.counter,
      transports: transports ?? null,
      nickname,
    })
    .onConflictDoNothing({ target: webauthnCredentials.credentialId });

  await logEvent({
    type: "auth.passkey.registered",
    actorId: session.userId,
    targetId: session.userId,
    payload: { credentialId: credential.id, nickname, transports },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
