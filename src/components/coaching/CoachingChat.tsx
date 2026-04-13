"use client";

import { useCallback } from "react";
import Comments from "@/components/comments/Comments";

interface CoachingChatProps {
  proStudentId: number;
  currentUserId: number;
  partnerName: string;
  partnerRole: "pro" | "student";
  emptyText?: string;
}

export default function CoachingChat({
  proStudentId,
  currentUserId,
  partnerName,
  partnerRole,
  emptyText,
}: CoachingChatProps) {
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
      />
    </div>
  );
}
