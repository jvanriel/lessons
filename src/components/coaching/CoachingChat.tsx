"use client";

import { useCallback, useEffect } from "react";
import Comments from "@/components/comments/Comments";
import { markCoachingReadAction } from "@/lib/coaching-actions";
import { notifyCoachingUnreadChanged } from "@/hooks/useCoachingUnread";

interface CoachingChatProps {
  proStudentId: number;
  currentUserId: number;
  partnerName: string;
  partnerRole: "pro" | "student";
  emptyText?: string;
  /**
   * Other side's last_seen_at (server-rendered as ISO string).
   * Drives the per-message ✓ / ✓✓ tick in `Comments`. Pass null
   * if the other side has never opened the chat — every message
   * shows as ✓ (sent, not yet read).
   */
  otherSideLastSeenAt: string | null;
}

export default function CoachingChat({
  proStudentId,
  currentUserId,
  partnerName,
  partnerRole,
  emptyText,
  otherSideLastSeenAt,
}: CoachingChatProps) {
  // Bump the viewer's `last_seen_at` as soon as the chat mounts —
  // anything they had unread now counts as read. The server action
  // figures out the role from the session, so a wrong client-side
  // assumption can't poison the other party's column.
  //
  // task 144 — also re-mark every 10s while the chat is open. The
  // Comments component polls for new messages every 5s, so without
  // this loop a message that arrives while the pro is reading would
  // keep counting toward the sidebar badge until the chat re-opens.
  // The custom event drops the badge in the parent shell within
  // ~10s instead of waiting on the slower /api/coaching/unread poll.
  useEffect(() => {
    let cancelled = false;
    async function markAndNotify() {
      await markCoachingReadAction(proStudentId);
      if (!cancelled) notifyCoachingUnreadChanged();
    }
    void markAndNotify();
    const id = setInterval(() => void markAndNotify(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [proStudentId]);

  const handleUpload = useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("proStudentId", String(proStudentId));

      const res = await fetch("/api/coaching/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        console.error("Upload error:", err.error);
        return null;
      }

      return res.json();
    },
    [proStudentId]
  );

  return (
    <div className="flex h-full flex-col">
      <Comments
        contextType="coaching"
        contextId={proStudentId}
        userId={currentUserId}
        mentionUsers={[
          {
            id: currentUserId,
            firstName: partnerName.split(" ")[0] || partnerName,
            lastName: partnerName.split(" ").slice(1).join(" ") || "",
          },
        ]}
        onUpload={handleUpload}
        fillHeight
        emptyText={emptyText}
        readReceiptOtherSeenAt={otherSideLastSeenAt}
      />
    </div>
  );
}
