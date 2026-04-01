import { NextRequest, NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { updateComment, deleteComment } from "@/lib/comments";
import { db } from "@/lib/db";
import { comments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

export async function PATCH(
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

  // Toggle pin (admin only)
  if (body.pinned !== undefined) {
    if (!hasRole(session, "admin")) {
      return NextResponse.json(
        { error: "Only admins can pin comments" },
        { status: 403 }
      );
    }
    await db
      .update(comments)
      .set({ pinned: body.pinned, updatedAt: new Date() })
      .where(eq(comments.id, commentId));
    return NextResponse.json({ success: true });
  }

  // Edit content
  if (body.content !== undefined) {
    const result = await updateComment(
      commentId,
      body.content.trim(),
      session.userId
    );
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
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
  const isAdmin = hasRole(session, "admin");

  const result = await deleteComment(commentId, session.userId, isAdmin);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
