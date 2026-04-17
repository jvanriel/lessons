"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { selectPros } from "./actions";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

interface Pro {
  id: number;
  displayName: string;
  photoUrl: string | null;
  specialties: string | null;
  bio: string | null;
  cities: (string | null)[];
}

export default function ChoosePros({
  pros,
  preSelectedId,
  existingProIds,
  locale,
}: {
  pros: Pro[];
  preSelectedId: number | null;
  existingProIds: number[];
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

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleContinue() {
    startTransition(async () => {
      await selectPros(Array.from(selected));
    });
  }

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
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pros.map((pro) => {
              const isSelected = selected.has(pro.id);
              const isExisting = existingProIds.includes(pro.id);
              return (
                <button
                  key={pro.id}
                  type="button"
                  onClick={() => toggle(pro.id)}
                  className={`relative rounded-xl border p-5 text-left transition-all ${
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

          <div className="mt-8 flex items-center justify-between">
            <Link
              href="/member/dashboard"
              className="text-sm text-green-500 hover:text-green-600"
            >
              {t("choosePros.skipForNow", locale)}
            </Link>
            <button
              type="button"
              onClick={handleContinue}
              disabled={isPending || selected.size === 0}
              className="rounded-md bg-gold-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gold-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending
                ? t("choosePros.saving", locale)
                : selected.size > 0
                  ? t("choosePros.continueWithCount", locale).replace(
                      "{n}",
                      String(selected.size)
                    )
                  : t("choosePros.continue", locale)}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
