import { NextRequest, NextResponse } from "next/server";
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

    if (!hasAccess) {
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

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!site-access|login|register|api|_next|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf)).*)",
  ],
};
