"use client";

import { useCallback, useEffect } from "react";
import Comments from "@/components/comments/Comments";
import { markCoachingReadAction } from "@/lib/coaching-actions";

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
  useEffect(() => {
    void markCoachingReadAction(proStudentId);
    // proStudentId is the only thing the action actually depends
    // on — currentUserId / partnerRole are forwarded just to keep
    // the linter happy for stable identity.
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
