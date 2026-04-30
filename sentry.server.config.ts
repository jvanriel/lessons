import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Low traces sample rate — we don't need APM, just errors
  tracesSampleRate: 0.1,

  // Send PII (user id/email) so we can attribute errors
  sendDefaultPii: true,

  // Environment tag based on Vercel
  environment: process.env.VERCEL_ENV || "development",

  // Only report from Vercel deployments — local dev errors stay in the terminal
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN && !!process.env.VERCEL_ENV,

  // Release = git commit SHA from Vercel
  release: process.env.VERCEL_GIT_COMMIT_SHA,
});
