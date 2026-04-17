/**
 * Pro-facing payment-status badge metadata.
 *
 * Surfaces on /pro/bookings (list + calendar), the pro notification email,
 * and the in-app notification stream so the pro instantly knows whether a
 * lesson was prepaid online or is cash-on-the-day.
 *
 * Colour palette mirrors existing Tailwind tokens already used elsewhere
 * (green for success, amber for cash, red for failed, etc.) so badges fit
 * the rest of the surface without a new design pass.
 */
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

export type PaymentStatus =
  | "pending"
  | "paid"
  | "manual"
  | "failed"
  | "requires_action"
  | "refunded";

export interface PaymentBadgeMeta {
  /** i18n key for the short badge label */
  labelKey: string;
  /** Tailwind background class for the badge */
  bg: string;
  /** Tailwind text color class for the badge */
  fg: string;
  /** Inline-style hex pair for HTML emails (background, text). */
  email: { bg: string; fg: string; border: string };
}

const META: Record<PaymentStatus, PaymentBadgeMeta | null> = {
  // Transient state — no badge until charge resolves.
  pending: null,
  paid: {
    labelKey: "paymentStatus.paid",
    bg: "bg-green-100",
    fg: "text-green-700",
    email: { bg: "#dcfce7", fg: "#15803d", border: "#86efac" },
  },
  manual: {
    labelKey: "paymentStatus.manual",
    bg: "bg-amber-100",
    fg: "text-amber-800",
    email: { bg: "#fef3c7", fg: "#92400e", border: "#fbbf24" },
  },
  failed: {
    labelKey: "paymentStatus.failed",
    bg: "bg-red-100",
    fg: "text-red-700",
    email: { bg: "#fee2e2", fg: "#b91c1c", border: "#fca5a5" },
  },
  requires_action: {
    labelKey: "paymentStatus.requires_action",
    bg: "bg-orange-100",
    fg: "text-orange-700",
    email: { bg: "#ffedd5", fg: "#c2410c", border: "#fdba74" },
  },
  refunded: {
    labelKey: "paymentStatus.refunded",
    bg: "bg-stone-100",
    fg: "text-stone-600",
    email: { bg: "#f5f5f4", fg: "#57534e", border: "#d6d3d1" },
  },
};

export function getPaymentBadge(
  status: string | null | undefined
): PaymentBadgeMeta | null {
  if (!status) return null;
  return META[status as PaymentStatus] ?? null;
}

export function getPaymentBadgeLabel(
  status: string | null | undefined,
  locale: Locale
): string | null {
  const meta = getPaymentBadge(status);
  if (!meta) return null;
  return t(meta.labelKey, locale);
}
