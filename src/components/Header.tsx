import Link from "next/link";
import HeaderNav from "./HeaderNav";
import Logo from "./Logo";
import { getSession, hasRole, getImpersonatorSession, parseRoles } from "@/lib/auth";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, ne } from "drizzle-orm";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

export default async function Header() {
  const session = await getSession();
  const locale = await getLocale();

  const baseLinks = [
    { href: "/", label: t("nav.home", locale) },
    { href: "/for-students", label: t("nav.forStudents", locale) },
    { href: "/for-pros", label: t("nav.forPros", locale) },
    { href: "/pros", label: t("nav.browsePros", locale) },
    { href: "/contact", label: t("nav.contact", locale) },
  ];

  const links = [...baseLinks];

  if (session && hasRole(session, "member")) {
    links.push({ href: "/member/dashboard", label: t("nav.member", locale) });
  }

  const proLinks =
    session && hasRole(session, "pro")
      ? [
          { href: "/pro/dashboard", label: "Dashboard" },
          { href: "/pro/students", label: "Students" },
          { href: "/pro/profile", label: "Profile" },
          { href: "/pro/locations", label: "Locations" },
          { href: "/pro/availability", label: "Availability" },
          { href: "/pro/bookings", label: "Bookings" },
          // Pages + Mailings parked pre-launch — see docs/pro-pages.md,
          // docs/pro-mailings.md. Routes still compile.
        ]
      : [];

  const adminLinks =
    session && hasRole(session, "admin")
      ? [
          { href: "/admin/users", label: "Users" },
          { href: "/admin/tasks", label: "Tasks" },
          { href: "/admin/cms", label: "CMS" },
          { href: "/admin/payouts", label: "Payouts" },
        ]
      : [];

  const devLinks =
    session && hasRole(session, "dev")
      ? [
          { href: "/dev/database", label: "Database" },
          { href: "/dev/blob", label: "Blob Store" },
          { href: "/dev/logs", label: "Logs" },
        ]
      : [];

  const showNotifications =
    !!session &&
    (hasRole(session, "admin") ||
      hasRole(session, "pro") ||
      hasRole(session, "dev"));
  let sessionToken: string | undefined;
  if (showNotifications) {
    sessionToken = (await cookies()).get("user-session")?.value;
  }

  let firstName: string | null = null;
  if (session) {
    const [user] = await db
      .select({ firstName: users.firstName })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    firstName = user?.firstName ?? null;
  }

  // Impersonation state
  const impersonator = await getImpersonatorSession();
  let impersonatorName: string | null = null;
  if (impersonator) {
    const [imp] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, impersonator.userId))
      .limit(1);
    impersonatorName =
      [imp?.firstName, imp?.lastName].filter(Boolean).join(" ") ||
      impersonator.email;
  }

  // Build list of impersonable users
  let canImpersonate = false;
  let impersonableUsers: {
    id: number;
    name: string;
    email: string;
    roles: string;
  }[] = [];
  const realSession = impersonator || session;
  if (realSession && !impersonator) {
    const isRealDev = realSession.roles.includes("dev");
    const isRealAdmin = realSession.roles.includes("admin");
    if (isRealDev || isRealAdmin) {
      canImpersonate = true;
      const allUsers = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          roles: users.roles,
        })
        .from(users)
        .where(ne(users.id, realSession.userId));

      impersonableUsers = allUsers
        .filter((u) => {
          const r = parseRoles(u.roles);
          if (isRealDev) return true;
          return !r.includes("admin") && !r.includes("dev");
        })
        .map((u) => ({
          id: u.id,
          name:
            [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
          email: u.email,
          roles: u.roles || "",
        }));
    }
  }

  return (
    <header className="border-b border-gold-500/10 bg-green-950">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-3 px-6 py-5">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-display text-xl font-medium tracking-tight text-gold-200"
        >
          <Logo size={28} variant="cream" />
          Golf Lessons
        </Link>

        <HeaderNav
          links={links}
          proLinks={proLinks}
          adminLinks={adminLinks}
          devLinks={devLinks}
          loggedIn={!!session}
          firstName={firstName}
          impersonating={!!impersonator}
          impersonatorName={impersonatorName}
          canImpersonate={canImpersonate}
          impersonableUsers={impersonableUsers}
          showNotifications={showNotifications}
          sessionToken={sessionToken}
          labels={{
            login: t("auth.login", locale),
            logout: t("auth.logout", locale),
            register: t("auth.register", locale),
            account: t("auth.account", locale),
            menuOpen: t("menu.open", locale),
            menuClose: t("menu.close", locale),
            impersonateAs: t("impersonate.as", locale),
            impersonateBy: t("impersonate.by", locale),
            impersonateStop: t("impersonate.stop", locale),
            impersonateLoginAs: t("impersonate.loginAs", locale),
            impersonateSearch: t("impersonate.search", locale),
            impersonateNoUsers: t("impersonate.noUsers", locale),
            impersonateCancel: t("impersonate.cancel", locale),
            stopImpersonating: t("impersonate.stopImpersonating", locale),
            logoutReturn: t("impersonate.logoutReturn", locale),
          }}
          locale={locale}
        />
      </nav>
    </header>
  );
}
