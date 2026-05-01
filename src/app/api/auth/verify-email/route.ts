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
 *
 * Verifies the email and redirects to a standalone confirmation page.
 * The confirmation page is intentionally session-agnostic — the link is
 * often clicked on a different device/tab from where the user is logged
 * in (or while logged in as a different account), so anchoring success
 * messaging to /account would be misleading.
 */
export async function GET(request: NextRequest) {
  const target = (status: "success" | "error", email?: string) => {
    const url = new URL("/email-verified", request.url);
    url.searchParams.set("status", status);
    if (email) url.searchParams.set("email", email);
    return NextResponse.redirect(url);
  };

  const token = request.nextUrl.searchParams.get("token");
  if (!token) return target("error");

  try {
    const { payload } = await jwtVerify(token, getSecret());

    if (payload.purpose !== "email-verify" || !payload.userId) {
      throw new Error("Invalid token");
    }

    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, payload.userId as number));

    const email = typeof payload.email === "string" ? payload.email : undefined;
    return target("success", email);
  } catch {
    return target("error");
  }
}
