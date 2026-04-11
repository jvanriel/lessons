import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { cookies } from "next/headers";
import crypto from "crypto";

function getRedirectUri(requestUrl: string) {
  const url = new URL(requestUrl);
  return `${url.origin}/api/auth/google/callback`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || "";

  const redirectUri = getRedirectUri(request.url);
  const client = new OAuth2Client(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri
  );

  // CSRF protection: store state in a cookie
  const state = crypto.randomBytes(32).toString("hex");
  const jar = await cookies();
  jar.set("google-oauth-state", JSON.stringify({ state, from }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  });

  const authorizeUrl = client.generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });

  return NextResponse.redirect(authorizeUrl);
}
