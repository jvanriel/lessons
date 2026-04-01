import { NextResponse } from "next/server";

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "unknown";

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
