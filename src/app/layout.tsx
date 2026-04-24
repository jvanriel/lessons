import type { Metadata } from "next";
import { Cormorant_Garamond, Outfit } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CmsProvider } from "@/components/cms/CmsProvider";
import DeploymentChecker from "@/components/DeploymentChecker";
import { getSession, hasRole, getImpersonatorSession, parseRoles } from "@/lib/auth";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, ne } from "drizzle-orm";
import { getLocale } from "@/lib/locale";
import type { Locale } from "@/lib/i18n";
import AppLayout from "@/components/app/AppLayout";
import InstallBanner from "@/components/app/InstallBanner";
import Script from "next/script";

const cormorant = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const outfit = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Golf Lessons",
  description: "Book golf lessons with certified professionals",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Golf Lessons",
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  // App-mode chrome (sidebar / top-bar / bottom-nav) should only show for
  // users who are actually set up: pros/admins/devs unconditionally, and
  // members only once they've completed onboarding. A half-onboarded
  // student who just booked via the public flow is signed in but should
  // still see the public website chrome — anything else is disorienting.
  let isAppMode = false;

  // Gather app-mode props when logged in
  let appProps:
    | {
        roles: string[];
        firstName: string | null;
        showNotifications: boolean;
        sessionToken?: string;
        locale: Locale;
        impersonating: boolean;
        impersonatorName: string | null;
        canImpersonate: boolean;
        impersonableUsers: { id: number; name: string; email: string; roles: string }[];
      }
    | null = null;

  if (session) {
    // Must fetch before deciding isAppMode — we need to know whether a
    // member has completed onboarding.
    //
    // Wrapped in try/catch so a DB outage (Neon 402, network blip)
    // doesn't nuke every route including public marketing pages that
    // don't actually need the DB. On failure we fall through to
    // "public website" chrome — the user loses the authenticated
    // shell but the homepage / /for-students / /contact still load.
    try {
      const [user] = await db
        .select({
          firstName: users.firstName,
          onboardingCompletedAt: users.onboardingCompletedAt,
        })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);

      const isPrivileged =
        session.roles.includes("pro") ||
        session.roles.includes("admin") ||
        session.roles.includes("dev");
      const memberOnboarded =
        session.roles.includes("member") && !!user?.onboardingCompletedAt;
      isAppMode = isPrivileged || memberOnboarded;
    } catch (err) {
      console.error("[layout] session user lookup failed:", err);
      isAppMode = false;
    }
  }

  if (isAppMode && session) {
    const locale = await getLocale();
    // All authenticated users get notifications
    const showNotifications = true;

    let sessionToken: string | undefined;
    if (showNotifications) {
      sessionToken = (await cookies()).get("user-session")?.value;
    }

    let firstName: string | null = null;
    try {
      const [user] = await db
        .select({ firstName: users.firstName })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);
      firstName = user?.firstName ?? null;
    } catch (err) {
      console.error("[layout] firstName lookup failed:", err);
    }

    // Impersonation state — optional, never block the layout on it.
    let impersonator: Awaited<ReturnType<typeof getImpersonatorSession>> = null;
    try {
      impersonator = await getImpersonatorSession();
    } catch (err) {
      console.error("[layout] getImpersonatorSession failed:", err);
    }

    let impersonatorName: string | null = null;
    if (impersonator) {
      try {
        const [imp] = await db
          .select({ firstName: users.firstName, lastName: users.lastName })
          .from(users)
          .where(eq(users.id, impersonator.userId))
          .limit(1);
        impersonatorName =
          [imp?.firstName, imp?.lastName].filter(Boolean).join(" ") ||
          impersonator.email;
      } catch (err) {
        console.error("[layout] impersonator name lookup failed:", err);
        impersonatorName = impersonator.email;
      }
    }

    let canImpersonate = false;
    let impersonableUsers: { id: number; name: string; email: string; roles: string }[] = [];
    const realSession = impersonator || session;
    if (realSession && !impersonator) {
      const isRealDev = realSession.roles.includes("dev");
      const isRealAdmin = realSession.roles.includes("admin");
      if (isRealDev || isRealAdmin) {
        canImpersonate = true;
        try {
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
            name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
            email: u.email,
            roles: u.roles || "",
          }));
        } catch (err) {
          console.error("[layout] impersonation query error:", err);
          canImpersonate = false;
        }
      }
    }

    appProps = {
      roles: session.roles as string[],
      firstName,
      showNotifications,
      sessionToken,
      locale,
      impersonating: !!impersonator,
      impersonatorName,
      canImpersonate,
      impersonableUsers,
    };
  }

  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#091a12" />
      </head>
      <body
        className={`${cormorant.variable} ${outfit.variable} font-sans antialiased`}
      >
        <CmsProvider>
          {isAppMode && appProps ? (
            <AppLayout {...appProps}>{children}</AppLayout>
          ) : (
            /* Website mode — not logged in */
            <>
              <Header />
              <main className="min-h-screen">{children}</main>
              <Footer />
            </>
          )}
        </CmsProvider>
        <InstallBanner />
        <DeploymentChecker />
        <Script id="pwa-bootstrap" strategy="afterInteractive">
          {`if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js')}
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__deferredInstallPrompt=e;window.dispatchEvent(new Event('pwa-install-available'));});
window.addEventListener('appinstalled',function(){window.__deferredInstallPrompt=null;try{localStorage.setItem('pwa-installed','true')}catch(e){}window.dispatchEvent(new Event('pwa-installed'));});
try{if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone){localStorage.setItem('pwa-installed','true')}}catch(e){}`}
        </Script>
      </body>
    </html>
  );
}
