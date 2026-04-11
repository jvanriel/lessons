"use client";

import { useState, useTransition } from "react";
import { updateMemberBookingPrefs } from "../book/actions";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";

interface ProPref {
  proStudentId: number;
  proName: string;
  preferredDuration: number | null;
  preferredDayOfWeek: number | null;
  preferredTime: string | null;
}

const DAY_KEYS = [
  "onboarding.day.mon",
  "onboarding.day.tue",
  "onboarding.day.wed",
  "onboarding.day.thu",
  "onboarding.day.fri",
  "onboarding.day.sat",
  "onboarding.day.sun",
];

const DURATIONS = [30, 45, 60, 90, 120];

// Generate time options in 30-min increments
const TIMES: string[] = [];
for (let h = 7; h <= 21; h++) {
  for (const m of ["00", "30"]) {
    TIMES.push(`${String(h).padStart(2, "0")}:${m}`);
  }
}

export function BookingPreferences({
  pros,
  locale,
}: {
  pros: ProPref[];
  locale: Locale;
}) {
  return (
    <div>
      <h2 className="font-display text-xl font-medium text-green-800">
        {t("profile.bookingPreferences", locale)}
      </h2>
      <p className="mt-1 text-sm text-green-600">
        {t("profile.bookingPreferencesDesc", locale)}
      </p>
      <div className="mt-6 space-y-6">
        {pros.map((pro) => (
          <ProPreferenceRow key={pro.proStudentId} pro={pro} locale={locale} />
        ))}
      </div>
    </div>
  );
}

function ProPreferenceRow({
  pro,
  locale,
}: {
  pro: ProPref;
  locale: Locale;
}) {
  const [isPending, startTransition] = useTransition();
  const [duration, setDuration] = useState(
    pro.preferredDuration !== null ? String(pro.preferredDuration) : ""
  );
  const [day, setDay] = useState(
    pro.preferredDayOfWeek !== null ? String(pro.preferredDayOfWeek) : ""
  );
  const [time, setTime] = useState(pro.preferredTime ?? "");
  const [saved, setSaved] = useState(false);

  function save(
    newDuration: string,
    newDay: string,
    newTime: string
  ) {
    setSaved(false);
    startTransition(async () => {
      await updateMemberBookingPrefs(pro.proStudentId, {
        preferredDuration: newDuration !== "" ? Number(newDuration) : null,
        preferredInterval: null,
        preferredDayOfWeek: newDay !== "" ? Number(newDay) : null,
        preferredTime: newTime || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  const notSet = t("profile.notSet", locale);
  const selectClass =
    "w-full rounded-md border border-green-200 bg-white px-2.5 py-1.5 text-sm text-green-900 outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400/30";

  return (
    <div className="rounded-lg border border-green-100 p-4">
      <h3 className="text-sm font-medium text-green-900">{pro.proName}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-green-600">
            {t("onboarding.duration", locale)}
          </label>
          <select
            value={duration}
            onChange={(e) => {
              setDuration(e.target.value);
              save(e.target.value, day, time);
            }}
            className={selectClass}
          >
            <option value="">{notSet}</option>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-green-600">
            {t("onboarding.preferredDay", locale)}
          </label>
          <select
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              save(duration, e.target.value, time);
            }}
            className={selectClass}
          >
            <option value="">{notSet}</option>
            {DAY_KEYS.map((key, idx) => (
              <option key={idx} value={idx}>
                {t(key, locale)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-green-600">
            {t("onboarding.preferredTime", locale)}
          </label>
          <select
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              save(duration, day, e.target.value);
            }}
            className={selectClass}
          >
            <option value="">{notSet}</option>
            {TIMES.map((tm) => (
              <option key={tm} value={tm}>
                {tm}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-2 h-4">
        {isPending && (
          <span className="text-xs text-green-500">
            {t("profile.saving", locale)}
          </span>
        )}
        {saved && !isPending && (
          <span className="text-xs text-green-600">
            {t("profile.saved", locale)}
          </span>
        )}
      </div>
    </div>
  );
}
