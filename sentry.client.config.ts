import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Low sample rate for performance traces
  tracesSampleRate: 0.1,

  // Session replay — disabled for now (enable later if needed)
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  sendDefaultPii: true,

  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
