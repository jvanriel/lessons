import { NextResponse } from "next/server";
import { runHealthChecks } from "@/lib/health";

/**
 * Health endpoint — public, no auth. Returns 200 if everything is healthy,
 * 503 if any check fails. External monitors (Uptime Kuma on Hetzner) poll
 * this to alert on DB/Stripe/Blob outages and missing env vars.
 *
 * Query params:
 *   ?deep=1   also check Stripe + Blob (heavier calls, use sparingly)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const deep = url.searchParams.get("deep") === "1";

  const result = await runHealthChecks({ deep });
  const status = result.status === "ok" ? 200 : 503;

  return NextResponse.json(result, {
    status,
    headers: {
      // Never cache the health endpoint
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
