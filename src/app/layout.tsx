import type { Metadata } from "next";
import { Cormorant_Garamond, Outfit } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CmsProvider } from "@/components/cms/CmsProvider";
import { ToolboxProvider } from "@/components/toolbox/ToolboxProvider";
import AdminToolbox from "@/components/toolbox/AdminToolbox";
import PreLaunchBanner from "@/components/PreLaunchBanner";
import DeploymentChecker from "@/components/DeploymentChecker";
import { getSession, hasRole } from "@/lib/auth";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getLocale } from "@/lib/locale";
import AppLayout from "@/components/app/AppLayout";

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
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const showToolbox =
    session &&
    (hasRole(session, "admin") || hasRole(session, "dev"));

  // Determine if this is an app-mode session (logged in user)
  const isAppMode = !!session;

  // Gather app-mode props when logged in
  let appProps:
    | {
        roles: string[];
        firstName: string | null;
        showNotifications: boolean;
        sessionToken?: string;
        locale: string;
      }
    | null = null;

  if (isAppMode && session) {
    const locale = await getLocale();
    const showNotifications =
      hasRole(session, "admin") ||
      hasRole(session, "pro") ||
      hasRole(session, "dev");

    let sessionToken: string | undefined;
    if (showNotifications) {
      sessionToken = (await cookies()).get("user-session")?.value;
    }

    let firstName: string | null = null;
    const [user] = await db
      .select({ firstName: users.firstName })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    firstName = user?.firstName ?? null;

    appProps = {
      roles: session.roles as string[],
      firstName,
      showNotifications,
      sessionToken,
      locale,
    };
  }

  return (
    <html lang="en">
      <body
        className={`${cormorant.variable} ${outfit.variable} font-sans antialiased`}
      >
        <CmsProvider>
          {isAppMode && appProps ? (
            showToolbox ? (
              <ToolboxProvider>
                <div className="flex h-dvh">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <PreLaunchBanner />
                    <AppLayout {...appProps}>{children}</AppLayout>
                  </div>
                  <AdminToolbox />
                </div>
              </ToolboxProvider>
            ) : (
              <>
                <PreLaunchBanner />
                <AppLayout {...appProps}>{children}</AppLayout>
              </>
            )
          ) : (
            /* Website mode — not logged in */
            <>
              <PreLaunchBanner />
              <Header />
              <main className="min-h-screen">{children}</main>
              <Footer />
            </>
          )}
        </CmsProvider>
        <DeploymentChecker />
      </body>
    </html>
  );
}
