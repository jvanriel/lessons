import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifySessionToken, type UserRole } from "@/lib/auth";

const ROLE_ROUTES: { prefix: string; roles: UserRole[] }[] = [
  { prefix: "/member", roles: ["member", "admin", "dev"] },
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/dev", roles: ["dev"] },
  { prefix: "/pro/", roles: ["pro", "admin", "dev"] },
];

const SITE_PASSWORD = "prolessons";
const SITE_PASSWORD_COOKIE = "site-access";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hostname = request.headers.get("host") ?? "";

  // ─── Canonical domain 308 ─────────────────────────────
  // A Vercel deploy is reachable via three hosts: the raw
  // lessons-xxx.vercel.app deploy URL, the lessons-xxx-zachte-g.vercel.app
  // alias, and our custom golflessons.be / preview.golflessons.be
  // aliases. Only the last ones should leak into shared links (QR
  // codes, email verify/claim URLs, redirects after signup). Force
  // every other vercel.app request over to the canonical host with
  // a 308 so the browser replaces its address bar too.
  const canonicalHost =
    process.env.VERCEL_ENV === "production"
      ? "golflessons.be"
      : process.env.VERCEL_ENV === "preview"
        ? "preview.golflessons.be"
        : null;
  if (canonicalHost && hostname.endsWith(".vercel.app")) {
    const target = new URL(request.nextUrl);
    target.protocol = "https:";
    target.host = canonicalHost;
    return NextResponse.redirect(target, 308);
  }

  // ─── Pre-launch password gate (preview/dev only) ─────
  // Production is open to the public so selected pros can start
  // receiving bookings; preview stays gated.
  if (
    process.env.VERCEL_ENV !== "production" &&
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

  const isProSignupRoute =
    pathname === "/pro/register" ||
    pathname.startsWith("/pro/register/") ||
    pathname === "/pro/onboarding" ||
    pathname.startsWith("/pro/onboarding/");

  // ─── Closed-beta block on pro signup (production only) ─
  // During the closed beta we only onboard hand-picked pros. Send
  // unauthenticated signup attempts to the /for-pros waitlist dialog
  // instead. Authenticated users (e.g. a pro resuming their own
  // onboarding) still pass through.
  if (
    process.env.VERCEL_ENV === "production" &&
    isProSignupRoute &&
    !request.cookies.get("user-session")?.value
  ) {
    const target = new URL("/for-pros", request.url);
    target.searchParams.set("waitlist", "1");
    return NextResponse.redirect(target);
  }

  // ─── Public bypass: pro self-service signup is under /pro/ but
  //     unauthenticated. /pro/register redirects into /pro/onboarding
  //     which is the new single-flow wizard (step 0 = signup); both
  //     need to be reachable without a session.
  if (isProSignupRoute) {
    return NextResponse.next();
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
    // `sw.js` and `manifest.webmanifest` are intentionally excluded:
    // both are fetched by the browser at PWA install / launch time
    // *before* the user has any chance to enter the site password,
    // and a redirect-to-/site-access on either kills the install
    // (the SW response wouldn't be JS, the manifest wouldn't be JSON).
    "/((?!site-access|login|register|forgot-password|reset-password|api|_next|sw\\.js|manifest\\.webmanifest|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf)).*)",
  ],
};
