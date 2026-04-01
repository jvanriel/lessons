import { NextResponse } from "next/server";
import { clearSessionCookie, stopImpersonation } from "@/lib/auth";

export async function POST() {
  const restored = await stopImpersonation();
  if (restored) {
    return NextResponse.json({ restored: true });
  }
  await clearSessionCookie();
  return NextResponse.json({ restored: false });
}
