import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";
import { users, lessonBookings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

/**
 * GET /api/auth/claim-booking?token=...
 *
 * Single-purpose link sent to the student in their booking confirmation
 * email. Verifies the JWT and marks the email as verified.
 *
 * Does NOT create a session — the student must register (set a password)
 * before they can log in and manage bookings. Redirects to the token-based
 * read-only booking page at /booked/t/[manageToken] with a ?verified=1
 * banner so the student knows their email was confirmed.
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

    // Look up the manage token for the booking so we can redirect to
    // the public read-only confirmation page.
    const bookingId =
      typeof payload.bookingId === "number" ? payload.bookingId : null;

    if (bookingId) {
      const [booking] = await db
        .select({ manageToken: lessonBookings.manageToken })
        .from(lessonBookings)
        .where(eq(lessonBookings.id, bookingId))
        .limit(1);

      if (booking?.manageToken) {
        return NextResponse.redirect(
          new URL(`/booked/t/${booking.manageToken}?verified=1`, request.url)
        );
      }
    }

    // Fallback: no booking found — send to home page
    return NextResponse.redirect(new URL("/?verified=1", request.url));
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "claim-booking" } });
    return NextResponse.redirect(new URL("/login?claim=error", request.url));
  }
}
