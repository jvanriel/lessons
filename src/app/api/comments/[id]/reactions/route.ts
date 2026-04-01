import { NextRequest, NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { addReaction, removeReaction } from "@/lib/comments";

async function requireAuth() {
  const session = await getSession();
  if (
    !session ||
    !(
      hasRole(session, "admin") ||
      hasRole(session, "pro") ||
      hasRole(session, "dev")
    )
  ) {
    return null;
  }
  return session;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const commentId = parseInt(id);
  const body = await request.json();

  if (!body.emoji) {
    return NextResponse.json({ error: "emoji is required" }, { status: 400 });
  }

  await addReaction(commentId, session.userId, body.emoji);
  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const commentId = parseInt(id);
  const { searchParams } = new URL(request.url);
  const emoji = searchParams.get("emoji");

  if (!emoji) {
    return NextResponse.json(
      { error: "emoji query param is required" },
      { status: 400 }
    );
  }

  await removeReaction(commentId, session.userId, emoji);
  return NextResponse.json({ success: true });
}
