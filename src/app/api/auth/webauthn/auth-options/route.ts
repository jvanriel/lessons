import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getRpId, setChallengeCookie } from "@/lib/webauthn";

/**
 * Generates an authentication challenge for username-less ("discoverable")
 * passkey login. The browser shows a Face ID / Touch ID / Windows Hello
 * prompt; the authenticator returns the credential it has for this RP
 * and we look up the user from `credentialId` in `auth-verify`.
 *
 * `allowCredentials: []` is what makes it discoverable — without it the
 * browser would need to know which specific credentials to present.
 */
export async function POST() {
  const options = await generateAuthenticationOptions({
    rpID: getRpId(),
    userVerification: "preferred",
    // Empty array → discoverable (resident-key) flow. The authenticator
    // picks which credential to present, and the user picks which
    // account from the OS prompt if multiple are stored.
    allowCredentials: [],
  });

  await setChallengeCookie({
    challenge: options.challenge,
    purpose: "auth",
  });

  return NextResponse.json(options);
}
