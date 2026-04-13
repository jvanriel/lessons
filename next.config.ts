import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  turbopack: {
    root: ".",
  },
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "dev",
  },
  async headers() {
    return [
      {
        // Always revalidate the service worker so clients pick up new
        // versions quickly. Push handlers are critical.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Be loud whenever we have an auth token (i.e. we're actually trying to
  // upload source maps — Vercel builds, CI). Stay silent in local dev where
  // there's no token. Previously gated on CI, which would silently swallow
  // upload failures if Vercel ever didn't set CI=1.
  silent: !process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring", // avoid ad-blockers eating Sentry requests
});
