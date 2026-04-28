import { NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { proProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isValidIban, normalizeIban } from "@/lib/iban";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !hasRole(session, "pro")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { accountHolder, iban, bic } = body as {
    accountHolder: string;
    iban: string;
    bic?: string;
  };

  if (!accountHolder?.trim()) {
    return NextResponse.json(
      { error: "Account holder name is required" },
      { status: 400 }
    );
  }

  if (!isValidIban(iban)) {
    return NextResponse.json(
      { error: "Invalid IBAN format" },
      { status: 400 }
    );
  }
  const cleanIban = normalizeIban(iban);

  const [profile] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  await db
    .update(proProfiles)
    .set({
      bankAccountHolder: accountHolder.trim(),
      bankIban: cleanIban,
      bankBic: bic?.trim().toUpperCase() || null,
      updatedAt: new Date(),
    })
    .where(eq(proProfiles.id, profile.id));

  return NextResponse.json({ success: true });
}
