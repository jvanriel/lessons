"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export interface ToastData {
  id: string;
  title: string;
  message?: string;
  actionUrl?: string;
  priority: string;
}

const TOAST_DURATION = 5000;

export default function NotificationToast({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));

    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 300);
    }, TOAST_DURATION);

    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const isHighPriority =
    toast.priority === "high" || toast.priority === "urgent";

  const content = (
    <div
      className={`pointer-events-auto w-80 overflow-hidden rounded-lg border shadow-xl transition-all duration-300 ${
        visible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
      } ${
        isHighPriority
          ? "border-amber-500/30 bg-green-900"
          : "border-green-700 bg-green-900"
      }`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-green-100/90">
            {toast.title}
          </p>
          {toast.message && (
            <p className="mt-0.5 line-clamp-2 text-xs text-green-100/50">
              {toast.message}
            </p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setVisible(false);
            setTimeout(() => onDismiss(toast.id), 300);
          }}
          className="flex-shrink-0 text-green-100/30 transition-colors hover:text-green-100/60"
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );

  if (toast.actionUrl) {
    return (
      <Link href={toast.actionUrl} onClick={() => onDismiss(toast.id)}>
        {content}
      </Link>
    );
  }

  return content;
}
