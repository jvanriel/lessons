import { NextRequest, NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { getComments, addComment } from "@/lib/comments";

async function requireAuth() {
  const session = await getSession();
  if (
    !session ||
    !(
      hasRole(session, "admin") ||
      hasRole(session, "pro") ||
      hasRole(session, "dev") ||
      hasRole(session, "member")
    )
  ) {
    return null;
  }
  return session;
}

export async function GET(request: NextRequest) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contextType = searchParams.get("contextType");
  const contextId = searchParams.get("contextId");
  const after = searchParams.get("after");
  const limit = searchParams.get("limit");

  if (!contextType || !contextId) {
    return NextResponse.json(
      { error: "contextType and contextId are required" },
      { status: 400 }
    );
  }

  const comments = await getComments(contextType, parseInt(contextId), {
    after: after ? parseInt(after) : undefined,
    limit: limit ? parseInt(limit) : undefined,
  });

  return NextResponse.json(comments);
}

export async function POST(request: NextRequest) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { contextType, contextId, content, type, replyToId, attachments } = body;

  if (!contextType || !contextId || !content?.trim()) {
    return NextResponse.json(
      { error: "contextType, contextId, and content are required" },
      { status: 400 }
    );
  }

  const comment = await addComment(
    contextType,
    parseInt(contextId),
    session.userId,
    content.trim(),
    type || "comment",
    {
      replyToId: replyToId ? parseInt(replyToId) : undefined,
      attachments: attachments ?? undefined,
    }
  );

  return NextResponse.json(comment, { status: 201 });
}
