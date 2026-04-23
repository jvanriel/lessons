import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

/**
 * GET /api/auth/verify-email?token=...
 * Verifies the email and redirects to the account page.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(
      new URL("/account?verified=error", request.url)
    );
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());

    if (payload.purpose !== "email-verify" || !payload.userId) {
      throw new Error("Invalid token");
    }

    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, payload.userId as number));

    return NextResponse.redirect(
      new URL("/account?verified=success", request.url)
    );
  } catch {
    return NextResponse.redirect(
      new URL("/account?verified=error", request.url)
    );
  }
}
