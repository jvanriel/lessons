import { db } from "@/lib/db";
import {
  comments,
  commentReactions,
  users,
  tasks,
  proStudents,
} from "@/lib/db/schema";
import { createNotification } from "@/lib/notifications";
import { eq, and, sql, desc, gt, isNull, inArray } from "drizzle-orm";

// ─── Types ─────────────────────────────────────────────

export interface CommentWithAuthor {
  id: number;
  contextType: string;
  contextId: number;
  authorId: number | null;
  authorFirstName: string | null;
  authorLastName: string | null;
  content: string;
  type: string;
  pinned: boolean;
  replyToId: number | null;
  attachments: Array<{
    name: string;
    url: string;
    size: number;
    contentType: string;
  }> | null;
  metadata: Record<string, unknown> | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reactions: Array<{ emoji: string; count: number; userIds: number[] }>;
}

// ─── Get Comments ──────────────────────────────────────

export async function getComments(
  contextType: string,
  contextId: number,
  opts?: { after?: number; limit?: number }
): Promise<CommentWithAuthor[]> {
  const conditions = [
    eq(comments.contextType, contextType),
    eq(comments.contextId, contextId),
  ];

  if (opts?.after) {
    conditions.push(gt(comments.id, opts.after));
  }

  const rows = await db
    .select({
      id: comments.id,
      contextType: comments.contextType,
      contextId: comments.contextId,
      authorId: comments.authorId,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
      content: comments.content,
      type: comments.type,
      pinned: comments.pinned,
      replyToId: comments.replyToId,
      attachments: comments.attachments,
      metadata: comments.metadata,
      editedAt: comments.editedAt,
      deletedAt: comments.deletedAt,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
    })
    .from(comments)
    .leftJoin(users, eq(comments.authorId, users.id))
    .where(and(...conditions))
    .orderBy(comments.createdAt)
    .limit(opts?.limit ?? 200);

  // Fetch reactions for these comments
  const commentIds = rows.map((r) => r.id);
  let reactionsMap: Map<
    number,
    Array<{ emoji: string; count: number; userIds: number[] }>
  > = new Map();

  if (commentIds.length > 0) {
    const allReactions = await db
      .select()
      .from(commentReactions)
      .where(inArray(commentReactions.commentId, commentIds));

    // Group by commentId + emoji
    const grouped = new Map<string, { commentId: number; emoji: string; userIds: number[] }>();
    for (const r of allReactions) {
      const key = `${r.commentId}:${r.emoji}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.userIds.push(r.userId);
      } else {
        grouped.set(key, {
          commentId: r.commentId,
          emoji: r.emoji,
          userIds: [r.userId],
        });
      }
    }

    for (const entry of grouped.values()) {
      const existing = reactionsMap.get(entry.commentId) ?? [];
      existing.push({
        emoji: entry.emoji,
        count: entry.userIds.length,
        userIds: entry.userIds,
      });
      reactionsMap.set(entry.commentId, existing);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    contextType: r.contextType,
    contextId: r.contextId,
    authorId: r.authorId,
    authorFirstName: r.authorFirstName,
    authorLastName: r.authorLastName,
    content: r.content,
    type: r.type,
    pinned: r.pinned,
    replyToId: r.replyToId,
    attachments: r.attachments,
    metadata: r.metadata,
    editedAt: r.editedAt?.toISOString() ?? null,
    deletedAt: r.deletedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    reactions: reactionsMap.get(r.id) ?? [],
  }));
}

// ─── Add Comment ───────────────────────────────────────

export async function addComment(
  contextType: string,
  contextId: number,
  authorId: number,
  content: string,
  type: string = "comment",
  opts?: {
    replyToId?: number;
    attachments?: Array<{
      name: string;
      url: string;
      size: number;
      contentType: string;
    }>;
  }
): Promise<CommentWithAuthor> {
  const [inserted] = await db
    .insert(comments)
    .values({
      contextType,
      contextId,
      authorId,
      content,
      type,
      replyToId: opts?.replyToId ?? null,
      attachments: opts?.attachments ?? null,
    })
    .returning();

  // Update lastMessageAt on proStudents when coaching context
  if (contextType === "coaching") {
    db.update(proStudents)
      .set({ lastMessageAt: new Date() })
      .where(eq(proStudents.id, contextId))
      .catch(() => {});
  }

  // Get the author info
  const [author] = await db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, authorId))
    .limit(1);

  const authorName = [author?.firstName, author?.lastName]
    .filter(Boolean)
    .join(" ");

  // Notify admin/dev users about new comment
  createNotification({
    type: "comment_added",
    targetRoles: ["admin", "dev"],
    title: `New comment from ${authorName}`,
    message:
      content.length > 100 ? content.substring(0, 100) + "..." : content,
    actionUrl: `/admin/tasks?id=${contextId}`,
    actionLabel: "View",
  }).catch(() => {});

  // Process @mentions
  await processMentions(content, contextType, contextId, authorName);

  return {
    id: inserted.id,
    contextType: inserted.contextType,
    contextId: inserted.contextId,
    authorId: inserted.authorId,
    authorFirstName: author?.firstName ?? null,
    authorLastName: author?.lastName ?? null,
    content: inserted.content,
    type: inserted.type,
    pinned: inserted.pinned,
    replyToId: inserted.replyToId,
    attachments: inserted.attachments,
    metadata: inserted.metadata,
    editedAt: null,
    deletedAt: null,
    createdAt: inserted.createdAt.toISOString(),
    updatedAt: inserted.updatedAt.toISOString(),
    reactions: [],
  };
}

// ─── Update Comment ────────────────────────────────────

export async function updateComment(
  commentId: number,
  content: string,
  userId: number
): Promise<{ error?: string }> {
  const [comment] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);

  if (!comment) return { error: "Comment not found" };
  if (comment.authorId !== userId) return { error: "Not authorized" };
  if (comment.deletedAt) return { error: "Comment is deleted" };

  // 15-minute edit window
  const fifteenMinutes = 15 * 60 * 1000;
  if (Date.now() - comment.createdAt.getTime() > fifteenMinutes) {
    return { error: "Edit window has expired (15 minutes)" };
  }

  await db
    .update(comments)
    .set({
      content,
      editedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(comments.id, commentId));

  return {};
}

// ─── Delete Comment ────────────────────────────────────

export async function deleteComment(
  commentId: number,
  userId: number,
  isAdmin: boolean = false
): Promise<{ error?: string }> {
  const [comment] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);

  if (!comment) return { error: "Comment not found" };
  if (comment.authorId !== userId && !isAdmin)
    return { error: "Not authorized" };

  await db
    .update(comments)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(comments.id, commentId));

  return {};
}

// ─── Reactions ─────────────────────────────────────────

export async function addReaction(
  commentId: number,
  userId: number,
  emoji: string
): Promise<void> {
  // Check if already exists
  const [existing] = await db
    .select()
    .from(commentReactions)
    .where(
      and(
        eq(commentReactions.commentId, commentId),
        eq(commentReactions.userId, userId),
        eq(commentReactions.emoji, emoji)
      )
    )
    .limit(1);

  if (existing) return; // Already reacted

  await db.insert(commentReactions).values({
    commentId,
    userId,
    emoji,
  });
}

export async function removeReaction(
  commentId: number,
  userId: number,
  emoji: string
): Promise<void> {
  await db
    .delete(commentReactions)
    .where(
      and(
        eq(commentReactions.commentId, commentId),
        eq(commentReactions.userId, userId),
        eq(commentReactions.emoji, emoji)
      )
    );
}

// ─── Comment Count ─────────────────────────────────────

export async function getCommentCount(
  contextType: string,
  contextId: number
): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(comments)
    .where(
      and(
        eq(comments.contextType, contextType),
        eq(comments.contextId, contextId),
        isNull(comments.deletedAt)
      )
    );
  return result?.count ?? 0;
}

// ─── @Mention Processing ───────────────────────────────

async function processMentions(
  content: string,
  contextType: string,
  contextId: number,
  authorName: string
) {
  // Parse @FirstName patterns
  const mentionPattern = /@(\w+)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionPattern.exec(content)) !== null) {
    mentions.push(match[1]);
  }

  if (mentions.length === 0) return;

  // Find matching users
  const allUsers = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      roles: users.roles,
    })
    .from(users)
    .where(
      sql`${users.roles} SIMILAR TO '%(admin|dev|pro)%'`
    );

  for (const mention of mentions) {
    const matchedUser = allUsers.find(
      (u) => u.firstName.toLowerCase() === mention.toLowerCase()
    );
    if (!matchedUser) continue;

    // Send high-priority notification to mentioned user
    createNotification({
      type: "comment_mention",
      priority: "high",
      targetUserId: matchedUser.id,
      title: `${authorName} mentioned you in a comment`,
      message:
        content.length > 100 ? content.substring(0, 100) + "..." : content,
      actionUrl: `/admin/tasks?id=${contextId}`,
      actionLabel: "View",
    }).catch(() => {});

    // If context is a task, update waitingOnUserIds (using metadata or assignees)
    if (contextType === "task") {
      try {
        const [task] = await db
          .select({ assigneeIds: tasks.assigneeIds })
          .from(tasks)
          .where(eq(tasks.id, contextId))
          .limit(1);

        if (task) {
          const currentAssignees = (task.assigneeIds as number[]) ?? [];
          if (!currentAssignees.includes(matchedUser.id)) {
            await db
              .update(tasks)
              .set({
                assigneeIds: [...currentAssignees, matchedUser.id],
                updatedAt: new Date(),
              })
              .where(eq(tasks.id, contextId));
          }
        }
      } catch {
        // Ignore task update errors
      }
    }
  }
}
