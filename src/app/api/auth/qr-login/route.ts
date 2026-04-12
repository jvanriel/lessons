import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

/**
 * GET /api/auth/qr-login?token=...
 * Validates a short-lived QR token, sets a normal session cookie,
 * and redirects to the member dashboard.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());

    if (payload.purpose !== "qr-login") {
      throw new Error("Invalid token purpose");
    }

    // Create a normal 7-day session token
    const sessionToken = await new SignJWT({
      userId: payload.userId,
      email: payload.email,
      roles: payload.roles,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(getSecret());

    const jar = await cookies();
    jar.set("user-session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    const roles = Array.isArray(payload.roles) ? (payload.roles as string[]) : [];
    let target = "/member/dashboard";
    if (roles.includes("pro")) target = "/pro/dashboard";
    else if (roles.includes("admin") || roles.includes("dev")) target = "/admin";

    return NextResponse.redirect(new URL(target, request.url));
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
