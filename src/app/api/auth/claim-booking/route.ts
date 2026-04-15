import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseRoles, setSessionCookie } from "@/lib/auth";

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

/**
 * GET /api/auth/claim-booking?token=...
 *
 * Single-purpose link sent to the student in their booking confirmation
 * email. Verifies the JWT, marks the email as verified, issues a session
 * cookie for the user, and redirects to the booking detail page.
 *
 * The link replaces traditional registration — there is no password to
 * set. The student can add one later from /member/profile if they want.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(
      new URL("/login?claim=error", request.url)
    );
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      payload.purpose !== "claim-booking" ||
      typeof payload.userId !== "number"
    ) {
      throw new Error("Invalid token");
    }

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        roles: users.roles,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) throw new Error("User not found");

    if (!user.emailVerifiedAt) {
      await db
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.id, user.id));
    }

    await setSessionCookie({
      userId: user.id,
      email: user.email,
      roles: parseRoles(user.roles),
    });

    const bookingId = typeof payload.bookingId === "number"
      ? payload.bookingId
      : null;
    // Land on the standalone confirmation page rather than /member/*.
    // The latter triggers the middleware onboarding guard and forces
    // the student into the full registration wizard — which is exactly
    // what the public flow is trying to avoid.
    const redirectTo = bookingId ? `/booked/${bookingId}` : "/booked";

    return NextResponse.redirect(new URL(redirectTo, request.url));
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "claim-booking" } });
    return NextResponse.redirect(new URL("/login?claim=error", request.url));
  }
}
