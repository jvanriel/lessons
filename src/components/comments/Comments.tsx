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

interface Attachment {
  name: string;
  url: string;
  size: number;
  contentType: string;
}

interface CommentsProps {
  contextType: string;
  contextId: number;
  userId: number;
  mentionUsers?: MentionUser[];
  onUpload?: (file: File) => Promise<Attachment | null>;
  fillHeight?: boolean;
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎯", "✅"];

const EMOJI_PICKER: string[] = [
  // Smileys
  "😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚",
  "😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥸","🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️",
  // Gestures & people
  "👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👋","🤚","🖐️","✋","🖖","👏","🙌",
  "🙏","💪","🫡","🤝","👀","🧠","🦵","🦶","👂","👃",
  // Hearts & symbols
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","♥️",
  "✨","⭐","🌟","💫","💥","🔥","💯","✅","❌","⚠️",
  // Activities & sports
  "⛳","🏌️","🏌️‍♂️","🏌️‍♀️","🏆","🥇","🥈","🥉","🎯","🎉","🎊","🎁","🎈","🏅","⚽","🏀","🏈","⚾","🎾","🏐",
];

// ─── Component ─────────────────────────────────────────

export default function Comments({
  contextType,
  contextId,
  userId,
  mentionUsers = [],
  onUpload,
  fillHeight = false,
}: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionCursorPos, setMentionCursorPos] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [reactionPickerId, setReactionPickerId] = useState<number | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // ─── File Upload ────────────────────────────────────

  async function handleFileUpload(file: File) {
    if (!onUpload || uploading) return;
    setUploading(true);
    shouldAutoScroll.current = true;

    try {
      const attachment = await onUpload(file);
      if (!attachment) return;

      // Create a comment with the attachment
      const caption = isImageType(attachment.contentType)
        ? "📷 Photo"
        : isVideoType(attachment.contentType)
          ? "🎬 Video"
          : `📎 ${attachment.name}`;

      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contextType,
          contextId,
          content: caption,
          attachments: [attachment],
        }),
      });

      if (res.ok) {
        const newComment: Comment = await res.json();
        setComments((prev) => [...prev, newComment]);
      }
    } catch {
      // Handle silently
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
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
    <div
      className={`flex flex-col ${fillHeight ? "h-full" : "h-[400px]"} relative`}
      onDrop={onUpload ? handleDrop : undefined}
      onDragOver={onUpload ? handleDragOver : undefined}
      onDragLeave={onUpload ? handleDragLeave : undefined}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-gold-500 bg-gold-50/80">
          <p className="text-sm font-medium text-gold-700">Drop file to send</p>
        </div>
      )}

      {/* Lightbox overlay */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
          <img src={lightboxUrl} alt="" className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" />
        </div>
      )}

      {/* Video overlay */}
      {videoUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setVideoUrl(null)}
        >
          <button
            onClick={() => setVideoUrl(null)}
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
          <video
            src={videoUrl}
            controls
            autoPlay
            className="max-h-[90vh] max-w-[90vw] rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

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

                  {/* Bubble + reaction trigger */}
                  <div
                    className={`flex items-start gap-1 ${isOwn ? "flex-row-reverse" : ""}`}
                  >
                  <div
                    className={`group relative rounded-2xl px-3 py-2 ${!isDeleted ? "pr-8" : ""} ${
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
                        {/* Attachment rendering */}
                        {comment.attachments && comment.attachments.length > 0 && (
                          <div className="mb-1.5 space-y-1.5">
                            {comment.attachments.map((att, ai) => {
                              if (isImageType(att.contentType)) {
                                return (
                                  <button
                                    key={ai}
                                    type="button"
                                    onClick={() => setLightboxUrl(att.url)}
                                    className="block overflow-hidden rounded-lg"
                                  >
                                    <img
                                      src={att.url}
                                      alt={att.name}
                                      className="max-w-[300px] rounded-lg object-cover transition-opacity hover:opacity-90"
                                    />
                                  </button>
                                );
                              }
                              if (isVideoType(att.contentType)) {
                                return (
                                  <button
                                    key={ai}
                                    type="button"
                                    onClick={() => setVideoUrl(att.url)}
                                    className="relative block max-w-[300px] overflow-hidden rounded-lg"
                                  >
                                    <video
                                      src={att.url}
                                      className="max-w-[300px] rounded-lg"
                                      muted
                                      preload="metadata"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
                                        <svg className="h-5 w-5 text-green-700 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                          <path d="M8 5v14l11-7z" />
                                        </svg>
                                      </div>
                                    </div>
                                  </button>
                                );
                              }
                              // Document card
                              return (
                                <a
                                  key={ai}
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors ${
                                    isOwn
                                      ? "border-green-600 bg-green-600/30 hover:bg-green-600/40"
                                      : "border-green-200 bg-white hover:bg-green-50"
                                  }`}
                                >
                                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                                    isOwn ? "bg-green-600/40" : "bg-green-100"
                                  }`}>
                                    <svg className={`h-4 w-4 ${isOwn ? "text-white" : "text-green-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                    </svg>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className={`truncate text-xs font-medium ${isOwn ? "text-white" : "text-green-800"}`}>
                                      {att.name}
                                    </p>
                                    <p className={`text-[10px] ${isOwn ? "text-green-200" : "text-green-400"}`}>
                                      {formatFileSize(att.size)}
                                    </p>
                                  </div>
                                  <svg className={`h-4 w-4 shrink-0 ${isOwn ? "text-green-200" : "text-green-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                  </svg>
                                </a>
                              );
                            })}
                          </div>
                        )}

                        <p className="whitespace-pre-wrap text-sm leading-relaxed">
                          {renderContentWithMentions(comment.content)}
                        </p>

                        {/* Chevron menu — top right inside bubble */}
                        <div className="absolute right-1 top-1">
                          <div className="relative">
                            <button
                              onClick={() =>
                                setMenuOpenId(
                                  menuOpenId === comment.id ? null : comment.id
                                )
                              }
                              className={`rounded p-0.5 ${
                                isOwn
                                  ? "text-white/50 hover:bg-white/10 hover:text-white"
                                  : "text-green-400 hover:bg-green-100 hover:text-green-700"
                              }`}
                              title="More"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2.5}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="m19.5 8.25-7.5 7.5-7.5-7.5"
                                />
                              </svg>
                            </button>
                            {menuOpenId === comment.id && (
                              <div
                                className={`absolute top-6 z-20 min-w-[140px] overflow-hidden rounded-lg border border-green-200 bg-white py-1 shadow-lg ${
                                  isOwn ? "right-0" : "left-0"
                                }`}
                              >
                                <button
                                  onClick={() => {
                                    setReplyTo(comment);
                                    inputRef.current?.focus();
                                    setMenuOpenId(null);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-green-700 hover:bg-green-50"
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
                                  Reply
                                </button>
                                {comment.attachments && comment.attachments.length > 0 && (
                                  <a
                                    href={comment.attachments[0].url}
                                    download={comment.attachments[0].name}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setMenuOpenId(null)}
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-green-700 hover:bg-green-50"
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
                                        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                                      />
                                    </svg>
                                    Download
                                  </a>
                                )}
                                {isOwn && (
                                  <button
                                    onClick={() => {
                                      handleDelete(comment.id);
                                      setMenuOpenId(null);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
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
                                    Delete
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  {/* Grey smiley — opens quick reactions */}
                  {!isDeleted && (
                    <div className="relative self-center">
                      <button
                        onClick={() =>
                          setReactionPickerId(
                            reactionPickerId === comment.id ? null : comment.id
                          )
                        }
                        className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="React"
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
                            d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z"
                          />
                        </svg>
                      </button>
                      {reactionPickerId === comment.id && (
                        <div
                          className={`absolute bottom-9 z-20 flex gap-0.5 rounded-full border border-green-200 bg-white p-1 shadow-lg ${
                            isOwn ? "right-0" : "left-0"
                          }`}
                        >
                          {QUICK_REACTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => {
                                handleReaction(comment.id, emoji);
                                setReactionPickerId(null);
                              }}
                              className="rounded-full p-1 text-base transition-transform hover:scale-125 hover:bg-green-50"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
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

                </div>
              </div>
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

      {/* Upload progress */}
      {uploading && (
        <div className="flex items-center gap-2 border-t border-green-100 bg-gold-50 px-4 py-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gold-400 border-t-transparent" />
          <span className="text-xs text-gold-700">Uploading file...</span>
        </div>
      )}

      {/* Hidden file input */}
      {onUpload && (
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
            e.target.value = "";
          }}
        />
      )}

      {/* Input area */}
      <div className="relative flex items-end gap-2 border-t border-green-100 bg-white px-3 py-2">
        {showEmojiPicker && (
          <div className="absolute bottom-14 right-3 z-20 w-72 rounded-xl border border-green-200 bg-white p-2 shadow-lg">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-xs font-medium text-green-600">
                Emoji
              </span>
              <button
                type="button"
                onClick={() => setShowEmojiPicker(false)}
                className="rounded p-0.5 text-green-400 hover:bg-green-50 hover:text-green-600"
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
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
              {EMOJI_PICKER.map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  type="button"
                  onClick={() => {
                    setInput((prev) => prev + emoji);
                    inputRef.current?.focus();
                  }}
                  className="rounded p-1 text-xl transition-colors hover:bg-green-50"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
        {onUpload && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-green-400 transition-colors hover:bg-green-50 hover:text-green-600 disabled:opacity-40"
            title="Attach file"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
            </svg>
          </button>
        )}
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
          type="button"
          onClick={() => setShowEmojiPicker((v) => !v)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-green-400 transition-colors hover:bg-green-50 hover:text-green-600"
          title="Emoji"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
          </svg>
        </button>
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

function isImageType(contentType: string): boolean {
  return contentType.startsWith("image/");
}

function isVideoType(contentType: string): boolean {
  return contentType.startsWith("video/");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
