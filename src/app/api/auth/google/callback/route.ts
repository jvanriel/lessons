import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { users, userEmails, proStudents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { setSessionCookie, parseRoles } from "@/lib/auth";
import { logEvent } from "@/lib/events";

function getRedirectUri(requestUrl: string) {
  const url = new URL(requestUrl);
  return `${url.origin}/api/auth/google/callback`;
}

export async function GET(request: Request) {
  const redirectUri = getRedirectUri(request.url);
  const client = new OAuth2Client(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri
  );
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/login?error=google_denied", request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/login?error=google_missing", request.url));
  }

  // Verify CSRF state
  const jar = await cookies();
  const stored = jar.get("google-oauth-state")?.value;
  jar.delete("google-oauth-state");

  if (!stored) {
    return NextResponse.redirect(new URL("/login?error=google_state", request.url));
  }

  let parsedState: { state: string; from: string };
  try {
    parsedState = JSON.parse(stored);
  } catch {
    return NextResponse.redirect(new URL("/login?error=google_state", request.url));
  }

  if (parsedState.state !== state) {
    return NextResponse.redirect(new URL("/login?error=google_state", request.url));
  }

  // Exchange code for tokens
  let idToken: string;
  try {
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) {
      return NextResponse.redirect(new URL("/login?error=google_token", request.url));
    }
    idToken = tokens.id_token;
  } catch {
    return NextResponse.redirect(new URL("/login?error=google_token", request.url));
  }

  // Verify and decode the ID token
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload?.email || !payload.email_verified) {
    return NextResponse.redirect(new URL("/login?error=google_email", request.url));
  }

  const googleEmail = payload.email.toLowerCase();

  // Find user by primary email or alias
  let result = await db
    .select()
    .from(users)
    .where(eq(users.email, googleEmail))
    .limit(1);

  if (result.length === 0) {
    const [alias] = await db
      .select({ userId: userEmails.userId })
      .from(userEmails)
      .where(eq(userEmails.email, googleEmail))
      .limit(1);

    if (alias) {
      result = await db
        .select()
        .from(users)
        .where(eq(users.id, alias.userId))
        .limit(1);
    }
  }

  if (result.length === 0) {
    // No account found — redirect to login with message
    await logEvent({
      type: "auth.oauth.no_account",
      level: "warn",
      payload: { email: googleEmail },
    });
    return NextResponse.redirect(
      new URL("/login?error=google_no_account", request.url)
    );
  }

  const user = result[0];

  // Update last login
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  // Mark email as verified if not already (Google verified it)
  if (!user.emailVerifiedAt) {
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, user.id));
  }

  // Activate pending pro-student relationships
  await db
    .update(proStudents)
    .set({ status: "active" })
    .where(
      and(
        eq(proStudents.userId, user.id),
        eq(proStudents.status, "pending")
      )
    );

  // Create session
  await setSessionCookie({
    userId: user.id,
    email: user.email,
    roles: parseRoles(user.roles),
  });

  await logEvent({
    type: "auth.login",
    actorId: user.id,
    payload: { method: "google" },
  });

  // Redirect based on `from` param or role
  if (parsedState.from) {
    return NextResponse.redirect(new URL(parsedState.from, request.url));
  }

  const roles = parseRoles(user.roles);
  if (roles.includes("pro")) {
    return NextResponse.redirect(new URL("/pro/dashboard", request.url));
  } else if (roles.includes("admin") || roles.includes("dev")) {
    return NextResponse.redirect(new URL("/admin", request.url));
  } else {
    return NextResponse.redirect(new URL("/member/dashboard", request.url));
  }
}
