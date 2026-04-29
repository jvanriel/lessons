import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webauthnCredentials } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/events";

/** Rename a passkey (nickname-only). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id: idStr } = await params;
  const id = Number.parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json()) as { nickname?: string };
  const nickname = body.nickname?.trim()?.slice(0, 100) || null;

  const result = await db
    .update(webauthnCredentials)
    .set({ nickname })
    .where(
      and(
        eq(webauthnCredentials.id, id),
        eq(webauthnCredentials.userId, session.userId),
      ),
    )
    .returning({ id: webauthnCredentials.id });
  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

/** Remove a passkey from the user's account. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id: idStr } = await params;
  const id = Number.parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const result = await db
    .delete(webauthnCredentials)
    .where(
      and(
        eq(webauthnCredentials.id, id),
        eq(webauthnCredentials.userId, session.userId),
      ),
    )
    .returning({
      id: webauthnCredentials.id,
      credentialId: webauthnCredentials.credentialId,
    });
  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await logEvent({
    type: "auth.passkey.removed",
    actorId: session.userId,
    targetId: session.userId,
    payload: { credentialId: result[0].credentialId },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
