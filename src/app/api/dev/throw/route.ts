import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getSession, hasRole } from "@/lib/auth";

/**
 * Dev-only: captures a test error with a unique fingerprint so Sentry treats
 * every hit as a new issue (and fires the issue.created webhook).
 *
 * Hit with GET /api/dev/throw — you should see:
 *   - a new issue in Sentry within seconds
 *   - a POST to /api/sentry/webhook from Sentry
 *   - an internal notification on bell + push + ntfy
 */
export async function GET() {
  const session = await getSession();
  if (!session || !hasRole(session, "dev")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const err = new Error(`Test error from /api/dev/throw · ${nonce}`);

  // Force a unique fingerprint so this always creates a new issue
  Sentry.withScope((scope) => {
    scope.setFingerprint([`dev-throw-${nonce}`]);
    scope.setTag("test_error", "true");
    scope.setTag("nonce", nonce);
    Sentry.captureException(err);
  });

  // Flush ensures the event is sent before the serverless function terminates
  await Sentry.flush(2000);

  return NextResponse.json(
    {
      ok: true,
      message: "Test error captured with unique fingerprint",
      nonce,
      note:
        "Sentry should now fire issue.created webhook → notification + ntfy",
    },
    { status: 500 }
  );
}
