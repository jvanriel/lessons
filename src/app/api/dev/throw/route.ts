import { NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";

/**
 * Dev-only: throws an error on purpose so we can verify Sentry catches it.
 * Hit with GET /api/dev/throw — you should see the error in Sentry within seconds.
 */
export async function GET() {
  const session = await getSession();
  if (!session || !hasRole(session, "dev")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  throw new Error(
    `Test error from /api/dev/throw at ${new Date().toISOString()}`
  );
}
