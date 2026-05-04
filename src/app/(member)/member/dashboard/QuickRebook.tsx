"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  quickCreateBooking,
  getAvailableSlots,
  getDateBlockReason,
  updatePreferredInterval,
  explainDateSlots,
  type QuickBookData,
  type SlotExplanation,
} from "../book/actions";
import { SlotExplanationDialog } from "@/components/SlotExplanationDialog";
import { formatDate as formatDateLocale } from "@/lib/format-date";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

interface Props {
  data: QuickBookData;
  proId: number;
  /**
   * Pro's display name. Used to interpolate into the
   * `memberQB.blockedBody` copy so the student sees *which* pro is
   * driving the payment-method requirement (task 102 — pre-fix the
   * generic "add a payment method to enable Quick Book" implied the
   * platform required it, not the pro).
   */
  proName: string;
  hasPaymentMethod?: boolean;
  allowBookingWithoutPayment?: boolean;
  locale: Locale;
}

const HOLD_MS = 600;

function makeDateFormatters(locale: Locale) {
  return {
    short: (dateStr: string) =>
      formatDateLocale(dateStr, locale, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    long: (dateStr: string) =>
      formatDateLocale(dateStr, locale, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    pillDay: (dateStr: string) =>
      formatDateLocale(dateStr, locale, { weekday: "short" }),
    pillDate: (dateStr: string) =>
      formatDateLocale(dateStr, locale, { month: "short", day: "numeric" }),
  };
}

export function QuickBook({ data, proId, proName, hasPaymentMethod = true, allowBookingWithoutPayment = false, locale }: Props) {
  const fd = makeDateFormatters(locale);
  const formatShortDate = fd.short;
  const formatDatePillDay = fd.pillDay;
  const formatDatePillDate = fd.pillDate;
  const paymentBlocked = !hasPaymentMethod && !allowBookingWithoutPayment;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedDate, setSelectedDate] = useState(data.suggestedDate);
  const [slots, setSlots] = useState(
    data.suggestedSlot
      ? [data.suggestedSlot, ...data.alternativeSlots]
      : data.alternativeSlots
  );
  const [status, setStatus] = useState<
    "idle" | "holding" | "booking" | "booked" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [holdingSlot, setHoldingSlot] = useState<string | null>(null);
  const [bookedSlot, setBookedSlot] = useState<{
    startTime: string;
    endTime: string;
  } | null>(null);
  const [interval, setInterval] = useState(data.interval);
  const [explanation, setExplanation] = useState<SlotExplanation | null>(null);
  const dateHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs per rendered date pill so we can scroll the selected one
  // into view when the user navigates with the arrows — otherwise
  // the pill gets clipped behind overflow-hidden and Nadine can't
  // see which date she's on (task 33).
  const pillRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Sync state when server data changes (e.g. after booking or cancellation)
  useEffect(() => {
    setSelectedDate(data.suggestedDate);
    setSlots(
      data.suggestedSlot
        ? [data.suggestedSlot, ...data.alternativeSlots]
        : data.alternativeSlots
    );
    setInterval(data.interval);
  }, [data]);

  // Keep the selected date pill visible whenever it changes — arrow
  // navigation or a server refresh can land it off-screen inside the
  // overflow container.
  useEffect(() => {
    const pill = pillRefs.current.get(selectedDate);
    pill?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selectedDate]);

  // Listen for booking changes (from notifications) and refresh the page
  useEffect(() => {
    function handleBookingChanged() {
      router.refresh();
    }
    window.addEventListener("booking-changed", handleBookingChanged);
    return () => window.removeEventListener("booking-changed", handleBookingChanged);
  }, [router]);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animFrame = useRef<number | null>(null);
  const holdStart = useRef(0);

  // Animate the hold progress
  const animateProgress = useCallback(() => {
    const elapsed = Date.now() - holdStart.current;
    const progress = Math.min(elapsed / HOLD_MS, 1);
    setHoldProgress(progress);
    if (progress < 1) {
      animFrame.current = requestAnimationFrame(animateProgress);
    }
  }, []);

  const startHold = useCallback(
    (slot: { startTime: string; endTime: string }) => {
      if (status === "booking" || status === "booked") return;
      setHoldingSlot(slot.startTime);
      setStatus("holding");
      setError(null);
      holdStart.current = Date.now();

      if (navigator.vibrate) navigator.vibrate(30);
      animFrame.current = requestAnimationFrame(animateProgress);

      holdTimer.current = setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
        setStatus("booking");
        setHoldProgress(1);

        startTransition(async () => {
          const result = await quickCreateBooking({
            proProfileId: data.proProfileId,
            proLocationId: data.locationId,
            date: selectedDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
            duration: data.duration,
          });

          if (result.error) {
            setStatus("error");
            setError(result.error);
            setHoldProgress(0);
            setHoldingSlot(null);
          } else {
            setStatus("booked");
            setBookedSlot(slot);
            setHoldingSlot(null);
            setHoldProgress(0);
            router.refresh();
            setTimeout(() => {
              setStatus("idle");
              setBookedSlot(null);
            }, 3000);
          }
        });
      }, HOLD_MS);
    },
    [status, selectedDate, data, animateProgress, startTransition, router]
  );

  const cancelHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (animFrame.current) {
      cancelAnimationFrame(animFrame.current);
      animFrame.current = null;
    }
    if (status === "holding") {
      setStatus("idle");
      setHoldProgress(0);
      setHoldingSlot(null);
    }
  }, [status]);

  const [blockReason, setBlockReason] = useState<string | null>(null);

  // Switch to a different date
  function switchDate(dateStr: string) {
    setSelectedDate(dateStr);
    setSlots([]);
    setBlockReason(null);
    startTransition(async () => {
      const newSlots = await getAvailableSlots(
        data.proProfileId,
        data.locationId,
        dateStr,
        data.duration
      );
      setSlots(newSlots);
      // Surface the pro's block reason inline next to "no slots"
      // instead of hiding it behind the long-press explain dialog
      // (task 27 — Nadine's 2026-04-28 retest).
      if (newSlots.length === 0) {
        const reason = await getDateBlockReason(
          data.proProfileId,
          data.locationId,
          dateStr,
        );
        setBlockReason(reason);
      }
    });
  }

  // If payment is required and student has none, show a blocked state
  if (paymentBlocked) {
    return (
      <div className="mt-3 rounded-lg border border-green-100 bg-green-50/50 p-4">
        <h3 className="text-sm font-medium text-green-900">{t("memberQB.heading", locale)}</h3>
        <p className="mt-2 text-xs text-green-600">
          {t("memberQB.blockedBody", locale).replace("{pro}", proName)}
        </p>
        <a
          href="/member/settings"
          className="mt-2 inline-block text-xs font-medium text-gold-600 hover:text-gold-500"
        >
          {t("memberQB.addPayment", locale)}
        </a>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-green-100 bg-green-50/50 p-4">
      {/* Header */}
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-green-900">{t("memberQB.heading", locale)}</h3>
        {data.cancellationHours > 0 && (
          <span className="text-[10px] text-green-400">
            {t("memberQB.cancelLabel", locale).replace(
              "{n}",
              String(data.cancellationHours),
            )}
          </span>
        )}
      </div>

      {/* Toast */}
      {status === "booked" && bookedSlot && (
        <div className="mb-3 flex items-center gap-2 rounded-md bg-green-100 px-3 py-2 text-xs font-medium text-green-800 animate-in fade-in">
          <svg
            className="h-4 w-4 shrink-0 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
          {t("memberQB.bookedAt", locale)
            .replace("{date}", formatShortDate(selectedDate))
            .replace("{time}", bookedSlot.startTime)}
        </div>
      )}

      {/* Date pills with arrows. The arrows step `selectedDate`
          through the full `availableDates` list (every day with at
          least one open slot within the booking horizon), in either
          direction — Nadine's mental model from task 35 retest:
          "Via de pijltjes kan ik klikken van beschikbare dag naar
          beschikbare dag binnen de boekingshorizon."

          The pills below render a sliding window of 5 dates around
          the selection so an interval-jumped suggested date still
          shows context on both sides. Pressing left arrow on
          today+7 (after "Over een week") now navigates back to
          today+6/+5/etc. instead of clearing the interval. */}
          {(() => {
            const all = data.availableDates;
            const selectedIdx = Math.max(0, all.indexOf(selectedDate));
            // 5-pill window centered on the selection, clamped to
            // the list bounds.
            const WINDOW = 5;
            let start = selectedIdx - Math.floor(WINDOW / 2);
            if (start < 0) start = 0;
            let end = start + WINDOW;
            if (end > all.length) {
              end = all.length;
              start = Math.max(0, end - WINDOW);
            }
            const visible = all.slice(start, end);
            return (
              <div className="mb-3 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedIdx > 0) switchDate(all[selectedIdx - 1]);
                  }}
                  className="shrink-0 rounded p-0.5 text-green-400 hover:text-green-700 disabled:opacity-30"
                  disabled={selectedIdx <= 0}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {visible.map((d) => (
                    <button
                      key={d}
                      ref={(el) => {
                        if (el) pillRefs.current.set(d, el);
                        else pillRefs.current.delete(d);
                      }}
                      onPointerDown={() => {
                        dateHoldTimer.current = setTimeout(() => {
                          dateHoldTimer.current = null;
                          startTransition(async () => {
                            const prefDay = formatDateLocale(data.suggestedDate, locale, { weekday: "long" });
                            const result = await explainDateSlots(
                              data.proProfileId,
                              data.locationId,
                              d,
                              data.duration,
                              d === data.suggestedDate,
                              false,
                              prefDay,
                              interval,
                            );
                            setExplanation(result);
                          });
                        }, 600);
                      }}
                      onPointerUp={() => {
                        if (dateHoldTimer.current) {
                          clearTimeout(dateHoldTimer.current);
                          dateHoldTimer.current = null;
                          switchDate(d);
                        }
                      }}
                      onPointerLeave={() => {
                        if (dateHoldTimer.current) {
                          clearTimeout(dateHoldTimer.current);
                          dateHoldTimer.current = null;
                        }
                      }}
                      onContextMenu={(e) => e.preventDefault()}
                      className={`shrink-0 rounded-lg px-2.5 py-1 text-center transition-colors select-none ${
                        selectedDate === d
                          ? "bg-gold-600 text-white"
                          : "bg-green-50 text-green-700 hover:bg-green-100"
                      }`}
                    >
                      <div className="text-[10px] font-medium leading-tight">{formatDatePillDay(d)}</div>
                      <div className="text-[10px] leading-tight">{formatDatePillDate(d)}</div>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedIdx < all.length - 1) switchDate(all[selectedIdx + 1]);
                  }}
                  className="shrink-0 rounded p-0.5 text-green-400 hover:text-green-700 disabled:opacity-30"
                  disabled={selectedIdx >= all.length - 1}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            );
          })()}

          {/* Time slots — hold any slot to book */}
          {isPending && slots.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-sm text-green-500">
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              {t("memberQB.loadingTimes", locale)}
            </div>
          ) : slots.length === 0 ? (
            <div className="py-2 text-xs text-green-500">
              <p>{t("memberQB.noSlots", locale)}</p>
              {blockReason && (
                <p className="mt-1 text-green-700">
                  <span className="font-medium">
                    {t("memberQB.blockReasonLabel", locale)}:
                  </span>{" "}
                  {blockReason}
                </p>
              )}
            </div>
          ) : (
            <>
              <p className="mb-1.5 text-[11px] italic text-green-500">
                {t("memberQB.holdHint", locale)}
              </p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {slots.map((slot) => {
                const isHolding =
                  holdingSlot === slot.startTime && status === "holding";
                const isBooking =
                  holdingSlot === slot.startTime && status === "booking";
                const isSuggested =
                  slot.startTime === data.suggestedSlot?.startTime &&
                  selectedDate === data.suggestedDate;
                return (
                  <button
                    key={slot.startTime}
                    onPointerDown={() => startHold(slot)}
                    onPointerUp={cancelHold}
                    onPointerLeave={cancelHold}
                    onContextMenu={(e) => e.preventDefault()}
                    disabled={status === "booking"}
                    className={`relative overflow-hidden rounded-md border px-3 py-2 text-xs font-medium transition-colors select-none disabled:opacity-60 ${
                      isHolding || isBooking
                        ? "border-gold-500 bg-gold-50 text-gold-700"
                        : isSuggested
                          ? "border-gold-400 bg-gold-50 text-gold-700"
                          : "border-green-200 text-green-700 hover:border-green-300"
                    }`}
                  >
                    {/* Hold progress fill */}
                    {isHolding && (
                      <div
                        className="absolute inset-0 bg-gold-200 transition-none"
                        style={{ width: `${holdProgress * 100}%` }}
                      />
                    )}
                    <span className="relative">
                      {isBooking ? "..." : slot.startTime}
                    </span>
                  </button>
                );
              })}
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Next lesson timing + more options */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {([
                { value: "weekly", label: t("memberQB.inAWeek", locale) },
                { value: "biweekly", label: t("memberQB.inTwoWeeks", locale) },
                { value: "monthly", label: t("memberQB.inAMonth", locale) },
              ] as const).map((iv) => (
                <button
                  key={iv.value}
                  onClick={() => {
                    const newVal = interval === iv.value ? null : iv.value;
                    setInterval(newVal);
                    startTransition(async () => {
                      await updatePreferredInterval(
                        data.proStudentId,
                        newVal
                      );
                      router.refresh();
                    });
                  }}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    interval === iv.value
                      ? "bg-green-700 text-white"
                      : "bg-green-50 text-green-500 hover:text-green-700"
                  }`}
                >
                  {iv.label}
                </button>
              ))}
            </div>
            <Link
              href={`/member/book/${proId}?full=1`}
              className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-white px-2.5 py-1 text-xs font-medium text-green-700 transition-colors hover:border-green-300 hover:bg-green-50"
            >
              {t("memberQB.moreOptions", locale)}
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          </div>

      {/* Slot explanation dialog */}
      {explanation && (
        <SlotExplanationDialog
          data={explanation}
          onClose={() => setExplanation(null)}
          locale={locale}
        />
      )}
    </div>
  );
}
