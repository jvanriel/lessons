import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, type UserRole } from "@/lib/auth";

const ROLE_ROUTES: { prefix: string; roles: UserRole[] }[] = [
  { prefix: "/member", roles: ["member"] },
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/dev", roles: ["dev"] },
  { prefix: "/pro", roles: ["pro", "admin"] },
];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

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
    "/((?!login|register|api|_next|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf)).*)",
  ],
};
