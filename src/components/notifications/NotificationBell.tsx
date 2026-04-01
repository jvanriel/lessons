"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import NotificationToast, { type ToastData } from "./NotificationToast";
import { playNotificationChime } from "./chime";

interface Notification {
  id: number;
  type: string;
  priority: string;
  title: string;
  message: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
  read: boolean;
  createdAt: string;
}

const POLL_INTERVAL = 30_000;
const WS_URL = process.env.NEXT_PUBLIC_WS_GATEWAY_URL;

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "border-l-red-500",
  high: "border-l-amber-500",
  normal: "border-l-gold-400/40",
  low: "border-l-green-700/20",
};

export default function NotificationBell({
  sessionToken,
}: {
  sessionToken?: string;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?countOnly=true");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount);
      }
    } catch {}
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=30");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
        setLoaded(true);
      }
    } catch {}
  }, []);

  // WebSocket connection with exponential backoff
  useEffect(() => {
    if (!WS_URL || !sessionToken) return;

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let retryCount = 0;
    let disposed = false;
    const MAX_RETRIES = 8;
    const BASE_DELAY = 2_000;

    function connect() {
      if (disposed) return;
      ws = new WebSocket(`${WS_URL}?token=${sessionToken}`);

      ws.onopen = () => {
        const stableTimer = setTimeout(() => {
          retryCount = 0;
        }, 30_000);
        ws.addEventListener("close", () => clearTimeout(stableTimer), {
          once: true,
        });
        setWsConnected(true);
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "connected") return;
          setUnreadCount((c) => c + 1);
          fetchNotifications();

          const priority = data.priority ?? "normal";
          if (priority === "high" || priority === "urgent") {
            playNotificationChime();
            setToasts((prev) => [
              ...prev,
              {
                id: `${Date.now()}-${Math.random()}`,
                title: data.title ?? "New notification",
                message: data.message,
                actionUrl: data.actionUrl,
                priority,
              },
            ]);
          }
        } catch {}
      };

      ws.onclose = (ev) => {
        setWsConnected(false);
        if (disposed || ev.code === 4001 || ev.code === 4002) return;
        if (retryCount >= MAX_RETRIES) return;
        const delay = Math.min(
          BASE_DELAY * Math.pow(2, retryCount),
          600_000
        );
        retryCount++;
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [sessionToken, fetchNotifications]);

  // Poll for unread count (fallback when WS is not connected)
  useEffect(() => {
    fetchCount();
    if (wsConnected) return;
    const interval = setInterval(fetchCount, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchCount, wsConnected]);

  // Load full list when dropdown opens
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleMarkAllRead() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  async function handleClearAll() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearAll: true }),
    });
    setNotifications([]);
    setUnreadCount(0);
  }

  async function handleClickNotification(n: Notification) {
    if (!n.read) {
      fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [n.id] }),
      }).catch(() => {});
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === n.id ? { ...item, read: true } : item
        )
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
  }

  return (
    <>
      {/* Toast container */}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
          {toasts.map((t) => (
            <NotificationToast
              key={t.id}
              toast={t}
              onDismiss={dismissToast}
            />
          ))}
        </div>
      )}
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="relative flex items-center justify-center text-green-100/60 transition-colors duration-200 hover:text-gold-200"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <svg
            className="h-[18px] w-[18px]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
            />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full z-30 mt-3 w-80 overflow-hidden rounded-lg border border-green-700 bg-green-900 shadow-xl sm:w-96">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-green-700/50 px-4 py-3">
              <span className="text-sm font-medium text-green-100/80">
                Notifications
              </span>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs text-gold-500/60 transition-colors hover:text-gold-200"
                  >
                    Mark all read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="text-xs text-red-400/60 transition-colors hover:text-red-400"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div className="max-h-96 overflow-y-auto">
              {!loaded ? (
                <div className="px-4 py-8 text-center text-sm text-green-100/30">
                  Loading...
                </div>
              ) : notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-green-100/30">
                  No notifications
                </div>
              ) : (
                notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onClick={() => handleClickNotification(n)}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function NotificationItem({
  notification: n,
  onClick,
}: {
  notification: Notification;
  onClick: () => void;
}) {
  const borderClass = PRIORITY_STYLES[n.priority] ?? PRIORITY_STYLES.normal;
  const timeAgo = formatDistanceToNow(new Date(n.createdAt), {
    addSuffix: true,
  });

  const content = (
    <div
      className={`border-l-2 ${borderClass} px-4 py-3 transition-colors hover:bg-green-800/50 ${
        n.read ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={`text-sm leading-snug ${
            n.read
              ? "text-green-100/50"
              : "font-medium text-green-100/90"
          }`}
        >
          {n.title}
        </p>
        {!n.read && (
          <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-gold-400" />
        )}
      </div>
      {n.message && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-green-100/40">
          {n.message}
        </p>
      )}
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[11px] text-green-100/30">{timeAgo}</span>
        {n.actionLabel && (
          <span className="text-[11px] font-medium text-gold-500/60">
            {n.actionLabel} &rarr;
          </span>
        )}
      </div>
    </div>
  );

  if (n.actionUrl) {
    return (
      <Link href={n.actionUrl} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className="w-full text-left">
      {content}
    </button>
  );
}
