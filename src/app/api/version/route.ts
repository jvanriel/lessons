import { NextResponse } from "next/server";

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "unknown";

// Force per-request execution. Without this, Next.js can statically
// optimise the handler at build time and the CDN serves the snapshot
// — which means a client running an old build calls /api/version, hits
// a cached static response and compares its own buildId against… an
// equally old buildId. The toast never fires. force-dynamic guarantees
// every call hits the function and reads the live BUILD_ID env var.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  return NextResponse.json(
    { buildId: BUILD_ID },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
