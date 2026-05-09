"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { selectPros } from "./actions";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { formatDate } from "@/lib/format-date";

interface Pro {
  id: number;
  displayName: string;
  photoUrl: string | null;
  specialties: string | null;
  bio: string | null;
  cities: (string | null)[];
  courses: string[];
}

interface UpcomingBooking {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
}

export default function ChoosePros({
  pros,
  preSelectedId,
  existingProIds,
  upcomingBookingsByPro,
  locale,
}: {
  pros: Pro[];
  preSelectedId: number | null;
  existingProIds: number[];
  upcomingBookingsByPro: Record<number, UpcomingBooking[]>;
  locale: Locale;
}) {
  const [selected, setSelected] = useState<Set<number>>(() => {
    const initial = new Set<number>(existingProIds);
    if (preSelectedId && !initial.has(preSelectedId)) {
      initial.add(preSelectedId);
    }
    return initial;
  });
  const [isPending, startTransition] = useTransition();
  const [pendingDeactivateId, setPendingDeactivateId] = useState<number | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  // "saved" briefly flashes after a successful auto-save so the user
  // sees confirmation; transitions back to "idle" via setTimeout.
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");
  const [query, setQuery] = useState("");
  const backdropRef = useRef<HTMLDivElement>(null);

  const filteredPros = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pros;
    return pros.filter((p) => {
      const haystack = [
        p.displayName,
        p.specialties ?? "",
        p.bio ?? "",
        p.cities.filter(Boolean).join(" "),
        p.courses.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [pros, query]);

  const prosById = useMemo(
    () => new Map(pros.map((p) => [p.id, p])),
    [pros]
  );

  function persist(next: Set<number>) {
    setError(null);
    startTransition(async () => {
      const result = await selectPros(Array.from(next));
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    });
  }

  function toggle(id: number) {
    const isCurrentlySelected = selected.has(id);
    // Deselecting an existing relationship that has upcoming lessons —
    // surface the confirmation dialog before changing state, so the
    // student is warned the bookings will be cancelled.
    if (
      isCurrentlySelected &&
      existingProIds.includes(id) &&
      (upcomingBookingsByPro[id] ?? []).length > 0
    ) {
      setPendingDeactivateId(id);
      return;
    }
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    persist(next);
  }

  function confirmDeactivate() {
    if (pendingDeactivateId == null) return;
    const next = new Set(selected);
    next.delete(pendingDeactivateId);
    setSelected(next);
    setPendingDeactivateId(null);
    persist(next);
  }

  function cancelDeactivate() {
    setPendingDeactivateId(null);
  }

  const pendingDeactivatePro =
    pendingDeactivateId != null ? prosById.get(pendingDeactivateId) : null;
  const pendingDeactivateBookings =
    pendingDeactivateId != null
      ? upcomingBookingsByPro[pendingDeactivateId] ?? []
      : [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-900">
        {t("choosePros.title", locale)}
      </h1>
      <p className="mt-2 text-green-600">
        {t("choosePros.subtitle", locale)}
      </p>

      {pros.length === 0 ? (
        <div className="mt-8 rounded-xl border border-green-200 bg-white p-8 text-center">
          <p className="text-green-600">
            {t("choosePros.empty", locale)}
          </p>
          <Link
            href="/member/dashboard"
            className="mt-4 inline-block text-sm text-gold-600 hover:text-gold-500"
          >
            {t("choosePros.goToDashboard", locale)}
          </Link>
        </div>
      ) : (
        <>
          <div className="relative mt-6">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("choosePros.searchPlaceholder", locale)}
              className="w-full rounded-md border border-green-200 bg-white py-2 pl-9 pr-3 text-sm text-green-800 placeholder:text-green-300 focus:border-green-400 focus:outline-none"
            />
          </div>
          {filteredPros.length === 0 ? (
            <div className="mt-6 rounded-xl border border-green-200 bg-white p-8 text-center">
              <p className="text-green-600">{t("choosePros.noMatches", locale)}</p>
            </div>
          ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPros.map((pro) => {
              const isSelected = selected.has(pro.id);
              const isExisting = existingProIds.includes(pro.id);
              return (
                <button
                  key={pro.id}
                  type="button"
                  onClick={() => toggle(pro.id)}
                  className={`relative w-full min-w-0 rounded-xl border p-5 text-left transition-all ${
                    isSelected
                      ? "border-gold-500 bg-gold-50 shadow-md ring-1 ring-gold-400"
                      : "border-green-200 bg-white hover:border-green-300 hover:shadow-sm"
                  }`}
                >
                  {isExisting && (
                    <span className="absolute top-2 right-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-600">
                      {t("choosePros.alreadyJoined", locale)}
                    </span>
                  )}
                  <div className="flex items-center gap-3">
                    {pro.photoUrl ? (
                      <img
                        src={pro.photoUrl}
                        alt={pro.displayName}
                        className="h-14 w-14 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-lg font-medium text-green-600">
                        {pro.displayName.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-green-900 truncate">
                        {pro.displayName}
                      </p>
                      {pro.specialties && (
                        <p className="mt-0.5 text-xs text-gold-600 truncate">
                          {pro.specialties}
                        </p>
                      )}
                      {pro.cities.length > 0 && (
                        <p className="mt-0.5 text-xs text-green-500 truncate">
                          {pro.cities.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Selection indicator */}
                  <div
                    className={`absolute top-3 left-3 flex h-5 w-5 items-center justify-center rounded-full border ${
                      isSelected
                        ? "border-gold-500 bg-gold-500 text-white"
                        : "border-green-300 bg-white"
                    }`}
                  >
                    {isSelected && (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          )}

          {error && (
            <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <Link
              href="/member/dashboard"
              className="text-sm text-green-500 hover:text-green-600"
            >
              ← {t("choosePros.backToDashboard", locale)}
            </Link>
            <span
              className={`text-xs transition-opacity ${
                isPending || saveState === "saved"
                  ? "opacity-100"
                  : "opacity-0"
              } ${isPending ? "text-green-500" : "text-green-600"}`}
              aria-live="polite"
            >
              {isPending
                ? t("choosePros.saving", locale)
                : saveState === "saved"
                  ? t("choosePros.saved", locale)
                  : ""}
            </span>
          </div>
        </>
      )}

      {pendingDeactivatePro && (
        <div
          ref={backdropRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={(e) => {
            if (e.target === backdropRef.current) cancelDeactivate();
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-green-200 bg-white p-6 shadow-2xl">
            <h3 className="font-display text-lg font-semibold text-green-900">
              {t("choosePros.deactivate.title", locale)}
            </h3>
            <p className="mt-2 text-sm text-green-600">
              {t("choosePros.deactivate.body", locale)}
            </p>

            <div className="mt-4 rounded-lg border border-green-200 bg-green-50/40 p-3">
              <p className="text-sm font-medium text-green-900">
                {pendingDeactivatePro.displayName}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-green-700">
                {pendingDeactivateBookings.map((b) => (
                  <li key={b.id}>
                    {formatDate(b.date, locale, {
                      weekday: "short",
                      day: "numeric",
                      month: "long",
                    })}{" "}
                    · {b.startTime}–{b.endTime}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={cancelDeactivate}
                className="flex-1 rounded-md border border-green-200 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-50"
              >
                {t("choosePros.deactivate.cancel", locale)}
              </button>
              <button
                type="button"
                onClick={confirmDeactivate}
                disabled={isPending}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {isPending
                  ? t("choosePros.saving", locale)
                  : t("choosePros.deactivate.confirm", locale)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
