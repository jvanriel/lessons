import { NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { proProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Basic IBAN validation: starts with 2 letters, then 2 digits, then up to 30 alphanumeric
const IBAN_REGEX = /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/;

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

  // Normalize IBAN: remove spaces, uppercase
  const cleanIban = iban?.replace(/\s/g, "").toUpperCase();
  if (!cleanIban || !IBAN_REGEX.test(cleanIban)) {
    return NextResponse.json(
      { error: "Invalid IBAN format" },
      { status: 400 }
    );
  }

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
