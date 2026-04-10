"use server";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

/**
 * Generate a short-lived (5 min) QR login token from the current session.
 */
export async function generateQRToken(): Promise<string | null> {
  const jar = await cookies();
  const sessionToken = jar.get("user-session")?.value;
  if (!sessionToken) return null;

  try {
    const { payload } = await jwtVerify(sessionToken, getSecret());

    return new SignJWT({
      userId: payload.userId,
      email: payload.email,
      roles: payload.roles,
      purpose: "qr-login",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(getSecret());
  } catch {
    return null;
  }
}
