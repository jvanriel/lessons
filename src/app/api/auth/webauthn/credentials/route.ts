import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webauthnCredentials } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth";

/**
 * List the current user's registered passkeys for the management UI on
 * /account. Returns enough info to render a row + a remove button — no
 * raw key material.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const rows = await db
    .select({
      id: webauthnCredentials.id,
      nickname: webauthnCredentials.nickname,
      transports: webauthnCredentials.transports,
      createdAt: webauthnCredentials.createdAt,
      lastUsedAt: webauthnCredentials.lastUsedAt,
    })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, session.userId))
    .orderBy(desc(webauthnCredentials.createdAt));

  return NextResponse.json({
    credentials: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    })),
  });
}
