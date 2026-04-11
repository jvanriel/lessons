import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifySessionToken, type UserRole } from "@/lib/auth";

const ROLE_ROUTES: { prefix: string; roles: UserRole[] }[] = [
  { prefix: "/member", roles: ["member"] },
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/dev", roles: ["dev"] },
  { prefix: "/pro/", roles: ["pro", "admin"] },
];

const SITE_PASSWORD = "prolessons";
const SITE_PASSWORD_COOKIE = "site-access";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hostname = request.headers.get("host") ?? "";

  // ─── Pre-launch password gate (non-localhost only) ────
  if (
    !hostname.startsWith("localhost") &&
    !hostname.startsWith("127.0.0.1")
  ) {
    const hasAccess = request.cookies.get(SITE_PASSWORD_COOKIE)?.value === "granted";
    const hasSession = !!request.cookies.get("user-session")?.value;

    if (!hasAccess && !hasSession) {
      // Check if password is being submitted
      if (pathname === "/site-access" && request.method === "POST") {
        // Handled by the API route below — let it through
      } else if (pathname !== "/site-access") {
        return NextResponse.redirect(new URL("/site-access", request.url));
      }
    }
  }

  // ─── Role-based route protection ──────────────────────
  const routeConfig = ROLE_ROUTES.find((r) => pathname.startsWith(r.prefix));
  if (routeConfig) {
    const sessionToken = request.cookies.get("user-session")?.value;
    const session = sessionToken
      ? await verifySessionToken(sessionToken)
      : null;

    if (!session || !routeConfig.roles.some((r) => session.roles.includes(r))) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Onboarding guard for members: redirect to onboarding if not completed
    if (
      pathname.startsWith("/member") &&
      !pathname.startsWith("/member/onboarding") &&
      !pathname.startsWith("/register") &&
      session.roles.includes("member") &&
      !session.roles.includes("pro") &&
      !session.roles.includes("admin")
    ) {
      const dbUrl =
        process.env.POSTGRES_URL_PREVIEW || process.env.POSTGRES_URL;
      if (dbUrl) {
        const sql = neon(dbUrl);
        const rows = await sql`SELECT onboarding_completed_at FROM users WHERE id = ${session.userId} LIMIT 1`;
        if (rows.length > 0 && !rows[0].onboarding_completed_at) {
          return NextResponse.redirect(
            new URL("/register", request.url)
          );
        }
      }
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!site-access|login|register|forgot-password|reset-password|api|_next|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf)).*)",
  ],
};
