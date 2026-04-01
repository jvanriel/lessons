"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ─────────────────────────────────────────────

interface Reaction {
  emoji: string;
  count: number;
  userIds: number[];
}

interface Comment {
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
  reactions: Reaction[];
}

interface MentionUser {
  id: number;
  firstName: string;
  lastName: string;
}

interface CommentsProps {
  contextType: string;
  contextId: number;
  userId: number;
  mentionUsers?: MentionUser[];
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎯", "✅"];

// ─── Component ─────────────────────────────────────────

export default function Comments({
  contextType,
  contextId,
  userId,
  mentionUsers = [],
}: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionCursorPos, setMentionCursorPos] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldAutoScroll = useRef(true);
  const prevContextId = useRef(contextId);

  // Reset state when context changes
  if (prevContextId.current !== contextId) {
    prevContextId.current = contextId;
    setComments([]);
    setLoading(true);
    setReplyTo(null);
    setInput("");
  }

  // ─── Fetch Comments ────────────────────────────────

  const fetchComments = useCallback(
    async (after?: number) => {
      try {
        const params = new URLSearchParams({
          contextType,
          contextId: String(contextId),
        });
        if (after) params.set("after", String(after));

        const res = await fetch(`/api/comments?${params}`);
        if (!res.ok) return;
        const data: Comment[] = await res.json();

        if (after) {
          setComments((prev) => {
            const existingIds = new Set(prev.map((c) => c.id));
            const newComments = data.filter((c) => !existingIds.has(c.id));
            if (newComments.length === 0) return prev;
            return [...prev, ...newComments];
          });
        } else {
          setComments(data);
        }
      } catch {
        // Silently fail on poll errors
      } finally {
        setLoading(false);
      }
    },
    [contextType, contextId]
  );

  // Initial fetch
  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Poll every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const maxId =
        comments.length > 0
          ? Math.max(...comments.map((c) => c.id))
          : undefined;
      fetchComments(maxId);
    }, 5000);
    return () => clearInterval(interval);
  }, [comments, fetchComments]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (shouldAutoScroll.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments]);

  function handleScroll() {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 50;
  }

  // ─── Send Comment ──────────────────────────────────

  async function handleSend() {
    if (!input.trim() || sending) return;
    setSending(true);
    shouldAutoScroll.current = true;

    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contextType,
          contextId,
          content: input.trim(),
          replyToId: replyTo?.id,
        }),
      });

      if (res.ok) {
        const newComment: Comment = await res.json();
        setComments((prev) => [...prev, newComment]);
        setInput("");
        setReplyTo(null);
      }
    } catch {
      // Handle silently
    } finally {
      setSending(false);
    }
  }

  // ─── Delete Comment ────────────────────────────────

  async function handleDelete(commentId: number) {
    const res = await fetch(`/api/comments/${commentId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, deletedAt: new Date().toISOString() }
            : c
        )
      );
    }
  }

  // ─── Toggle Reaction ──────────────────────────────

  async function handleReaction(commentId: number, emoji: string) {
    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;

    const existingReaction = comment.reactions.find(
      (r) => r.emoji === emoji
    );
    const hasReacted = existingReaction?.userIds.includes(userId);

    if (hasReacted) {
      await fetch(
        `/api/comments/${commentId}/reactions?emoji=${encodeURIComponent(emoji)}`,
        { method: "DELETE" }
      );
    } else {
      await fetch(`/api/comments/${commentId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
    }

    // Optimistic update
    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        const reactions = [...c.reactions];
        const idx = reactions.findIndex((r) => r.emoji === emoji);

        if (hasReacted) {
          if (idx >= 0) {
            const r = reactions[idx];
            if (r.count <= 1) {
              reactions.splice(idx, 1);
            } else {
              reactions[idx] = {
                ...r,
                count: r.count - 1,
                userIds: r.userIds.filter((id) => id !== userId),
              };
            }
          }
        } else {
          if (idx >= 0) {
            const r = reactions[idx];
            reactions[idx] = {
              ...r,
              count: r.count + 1,
              userIds: [...r.userIds, userId],
            };
          } else {
            reactions.push({ emoji, count: 1, userIds: [userId] });
          }
        }

        return { ...c, reactions };
      })
    );
  }

  // ─── @Mention Handling ─────────────────────────────

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart ?? value.length;
    setInput(value);

    // Check for @ trigger
    const textBeforeCursor = value.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      setShowMentions(true);
      setMentionFilter(atMatch[1].toLowerCase());
      setMentionCursorPos(cursorPos);
    } else {
      setShowMentions(false);
    }
  }

  function handleMentionSelect(user: MentionUser) {
    const textBeforeCursor = input.substring(0, mentionCursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (!atMatch) return;

    const beforeAt = textBeforeCursor.substring(
      0,
      textBeforeCursor.length - atMatch[0].length
    );
    const afterCursor = input.substring(mentionCursorPos);
    const newValue = `${beforeAt}@${user.firstName} ${afterCursor}`;

    setInput(newValue);
    setShowMentions(false);
    inputRef.current?.focus();
  }

  const filteredMentionUsers = mentionUsers.filter((u) =>
    u.firstName.toLowerCase().startsWith(mentionFilter)
  );

  // ─── Key Handler ───────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      setShowMentions(false);
      setReplyTo(null);
    }
  }

  // ─── Date Helpers ──────────────────────────────────

  function formatDateSeparator(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function shouldShowDateSeparator(index: number): boolean {
    if (index === 0) return true;
    const prev = new Date(comments[index - 1].createdAt).toDateString();
    const curr = new Date(comments[index].createdAt).toDateString();
    return prev !== curr;
  }

  // ─── Find Reply Target ─────────────────────────────

  function getReplyTarget(replyToId: number | null): Comment | undefined {
    if (!replyToId) return undefined;
    return comments.find((c) => c.id === replyToId);
  }

  // ─── Render ────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-green-500">Loading comments...</p>
      </div>
    );
  }

  return (
    <div className="flex h-[400px] flex-col">
      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 space-y-1 overflow-y-auto px-2 py-3"
      >
        {comments.length === 0 && (
          <p className="py-8 text-center text-sm text-green-400">
            No comments yet. Start the conversation.
          </p>
        )}

        {comments.map((comment, index) => {
          const isOwn = comment.authorId === userId;
          const isDeleted = !!comment.deletedAt;
          const replyTarget = getReplyTarget(comment.replyToId);

          return (
            <div key={comment.id}>
              {/* Date separator */}
              {shouldShowDateSeparator(index) && (
                <div className="flex items-center justify-center py-2">
                  <span className="rounded-full bg-green-100 px-3 py-0.5 text-[11px] font-medium text-green-600">
                    {formatDateSeparator(comment.createdAt)}
                  </span>
                </div>
              )}

              {/* Message bubble */}
              <div
                className={`mb-1 flex ${isOwn ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[75%] ${isOwn ? "items-end" : "items-start"}`}>
                  {/* Author name (hidden for own messages) */}
                  {!isOwn && !isDeleted && (
                    <p className="mb-0.5 px-3 text-[11px] font-medium text-green-700">
                      {comment.authorFirstName} {comment.authorLastName}
                    </p>
                  )}

                  {/* Reply preview */}
                  {replyTarget && !isDeleted && (
                    <div
                      className={`mx-1 mb-0.5 rounded-t-lg border-l-2 border-gold-500 bg-green-50 px-3 py-1.5 ${
                        isOwn ? "ml-auto" : ""
                      }`}
                    >
                      <p className="text-[10px] font-medium text-gold-700">
                        {replyTarget.authorFirstName}
                      </p>
                      <p className="line-clamp-1 text-[11px] text-green-600">
                        {replyTarget.deletedAt
                          ? "(deleted)"
                          : replyTarget.content}
                      </p>
                    </div>
                  )}

                  {/* Bubble */}
                  <div
                    className={`group relative rounded-2xl px-3 py-2 ${
                      isDeleted
                        ? "bg-gray-100 italic text-gray-400"
                        : isOwn
                          ? "bg-green-700 text-white"
                          : "bg-green-50 text-green-900"
                    } ${replyTarget && !isDeleted ? "rounded-tl-md" : ""}`}
                  >
                    {isDeleted ? (
                      <p className="text-sm">(deleted)</p>
                    ) : (
                      <>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">
                          {renderContentWithMentions(comment.content)}
                        </p>

                        {/* Action buttons (visible on hover) */}
                        <div
                          className={`absolute top-0 ${isOwn ? "-left-20" : "-right-20"} hidden gap-0.5 group-hover:flex`}
                        >
                          <button
                            onClick={() => {
                              setReplyTo(comment);
                              inputRef.current?.focus();
                            }}
                            className="rounded p-1 text-green-400 hover:bg-green-100 hover:text-green-600"
                            title="Reply"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6m-6-6 6-6"
                              />
                            </svg>
                          </button>
                          {isOwn && (
                            <button
                              onClick={() => handleDelete(comment.id)}
                              className="rounded p-1 text-green-400 hover:bg-red-50 hover:text-red-500"
                              title="Delete"
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Edited indicator + timestamp */}
                  <div
                    className={`mt-0.5 flex items-center gap-1.5 px-1 ${isOwn ? "justify-end" : "justify-start"}`}
                  >
                    {comment.editedAt && !isDeleted && (
                      <span className="text-[10px] italic text-green-400">
                        (edited)
                      </span>
                    )}
                    <span className="text-[10px] text-green-400">
                      {formatTime(comment.createdAt)}
                    </span>
                  </div>

                  {/* Reactions */}
                  {!isDeleted && comment.reactions.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1 px-1">
                      {comment.reactions.map((reaction) => (
                        <button
                          key={reaction.emoji}
                          onClick={() =>
                            handleReaction(comment.id, reaction.emoji)
                          }
                          className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
                            reaction.userIds.includes(userId)
                              ? "border-gold-400 bg-gold-50 text-gold-700"
                              : "border-green-200 bg-white text-green-600 hover:border-green-300"
                          }`}
                        >
                          <span>{reaction.emoji}</span>
                          <span className="text-[10px]">
                            {reaction.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Quick reactions (on hover) */}
                  {!isDeleted && (
                    <div
                      className={`mt-0.5 hidden gap-0.5 group-hover:flex ${isOwn ? "justify-end" : "justify-start"}`}
                    >
                      {/* Need to wrap the bubble in group for this to work -
                          handled via the parent group class */}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick reaction bar (below bubble, visible on hover via parent group) */}
              {!isDeleted && (
                <div
                  className={`-mt-0.5 mb-1 flex gap-0.5 opacity-0 transition-opacity hover:opacity-100 ${
                    isOwn ? "justify-end pr-2" : "justify-start pl-2"
                  } [div:hover>&]:opacity-100`}
                >
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleReaction(comment.id, emoji)}
                      className="rounded-full p-0.5 text-xs hover:bg-green-100"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 border-t border-green-100 bg-green-50/50 px-4 py-2">
          <div className="flex-1 border-l-2 border-gold-500 pl-3">
            <p className="text-[11px] font-medium text-gold-700">
              Replying to {replyTo.authorFirstName}
            </p>
            <p className="line-clamp-1 text-xs text-green-600">
              {replyTo.content}
            </p>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="rounded p-1 text-green-400 hover:bg-green-100 hover:text-green-600"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      {/* @Mention dropdown */}
      {showMentions && filteredMentionUsers.length > 0 && (
        <div className="border-t border-green-100 bg-white shadow-lg">
          {filteredMentionUsers.map((user) => (
            <button
              key={user.id}
              onClick={() => handleMentionSelect(user)}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-green-800 hover:bg-green-50"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-xs font-medium text-green-700">
                {user.firstName[0]}
              </span>
              <span>
                {user.firstName} {user.lastName}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 border-t border-green-100 bg-white px-3 py-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="max-h-24 min-h-[36px] flex-1 resize-none rounded-xl border border-green-200 bg-green-50/50 px-3 py-2 text-sm text-green-900 placeholder:text-green-400 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-700 text-white transition-colors hover:bg-green-800 disabled:opacity-40"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────

function renderContentWithMentions(content: string): React.ReactNode {
  const parts = content.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      return (
        <span key={i} className="font-semibold text-gold-300">
          {part}
        </span>
      );
    }
    return part;
  });
}
