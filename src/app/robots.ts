import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://golflessons.be";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/pros",
          "/pros/",
          "/for-students",
          "/for-pros",
          "/contact",
          "/terms",
          "/privacy",
        ],
        disallow: [
          "/admin",
          "/dev",
          "/member",
          "/pro/",
          "/api",
          "/register",
          "/login",
          "/forgot-password",
          "/reset-password",
          "/site-access",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
