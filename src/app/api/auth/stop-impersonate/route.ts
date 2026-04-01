import { NextResponse } from "next/server";
import { stopImpersonation } from "@/lib/auth";

export async function POST() {
  const restored = await stopImpersonation();
  return NextResponse.json({ restored });
}
