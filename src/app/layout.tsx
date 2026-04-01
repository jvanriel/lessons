import type { Metadata } from "next";
import { Cormorant_Garamond, Outfit } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CmsProvider } from "@/components/cms/CmsProvider";
import { ToolboxProvider } from "@/components/toolbox/ToolboxProvider";
import AdminToolbox from "@/components/toolbox/AdminToolbox";
import PreLaunchBanner from "@/components/PreLaunchBanner";
import { getSession, hasRole } from "@/lib/auth";

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

  return (
    <html lang="en">
      <body
        className={`${cormorant.variable} ${outfit.variable} font-sans antialiased`}
      >
        <CmsProvider>
          {showToolbox ? (
            <ToolboxProvider>
              <div className="flex">
                <div className="flex min-w-0 flex-1 flex-col">
                  <PreLaunchBanner />
                  <Header />
                  <main className="min-h-screen">{children}</main>
                  <Footer />
                </div>
                <AdminToolbox />
              </div>
            </ToolboxProvider>
          ) : (
            <>
              <PreLaunchBanner />
              <Header />
              <main className="min-h-screen">{children}</main>
              <Footer />
            </>
          )}
        </CmsProvider>
      </body>
    </html>
  );
}
