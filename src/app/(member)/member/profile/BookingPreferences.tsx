"use client";

import { useState, useTransition } from "react";
import { updateMemberBookingPrefs } from "../book/actions";

interface ProPref {
  proStudentId: number;
  proName: string;
  preferredDuration: number | null;
  preferredInterval: string | null;
  preferredDayOfWeek: number | null;
  preferredTime: string | null;
}

const DAYS = [
  { value: 0, label: "Monday" },
  { value: 1, label: "Tuesday" },
  { value: 2, label: "Wednesday" },
  { value: 3, label: "Thursday" },
  { value: 4, label: "Friday" },
  { value: 5, label: "Saturday" },
  { value: 6, label: "Sunday" },
];

const DURATIONS = [
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
];

const INTERVALS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
];

// Generate time options in 30-min increments
const TIMES: string[] = [];
for (let h = 7; h <= 21; h++) {
  for (const m of ["00", "30"]) {
    TIMES.push(`${String(h).padStart(2, "0")}:${m}`);
  }
}

export function BookingPreferences({ pros }: { pros: ProPref[] }) {
  return (
    <div>
      <h2 className="font-display text-xl font-medium text-green-800">
        Booking Preferences
      </h2>
      <p className="mt-1 text-sm text-green-600">
        Set your preferred schedule for each pro. This powers Quick Book on your
        dashboard.
      </p>
      <div className="mt-6 space-y-6">
        {pros.map((pro) => (
          <ProPreferenceRow key={pro.proStudentId} pro={pro} />
        ))}
      </div>
    </div>
  );
}

function ProPreferenceRow({ pro }: { pro: ProPref }) {
  const [isPending, startTransition] = useTransition();
  const [duration, setDuration] = useState(
    pro.preferredDuration !== null ? String(pro.preferredDuration) : ""
  );
  const [interval, setIntervalState] = useState(pro.preferredInterval ?? "");
  const [day, setDay] = useState(
    pro.preferredDayOfWeek !== null ? String(pro.preferredDayOfWeek) : ""
  );
  const [time, setTime] = useState(pro.preferredTime ?? "");
  const [saved, setSaved] = useState(false);

  function save(
    newDuration: string,
    newInterval: string,
    newDay: string,
    newTime: string
  ) {
    setSaved(false);
    startTransition(async () => {
      await updateMemberBookingPrefs(pro.proStudentId, {
        preferredDuration: newDuration !== "" ? Number(newDuration) : null,
        preferredInterval: newInterval || null,
        preferredDayOfWeek: newDay !== "" ? Number(newDay) : null,
        preferredTime: newTime || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="rounded-lg border border-green-100 p-4">
      <h3 className="text-sm font-medium text-green-900">{pro.proName}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-green-600">
            Duration
          </label>
          <select
            value={duration}
            onChange={(e) => { setDuration(e.target.value); save(e.target.value, interval, day, time); }}
            className="w-full rounded-md border border-green-200 bg-white px-2.5 py-1.5 text-sm text-green-900 outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400/30"
          >
            <option value="">Not set</option>
            {DURATIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-green-600">
            Frequency
          </label>
          <select
            value={interval}
            onChange={(e) => { setIntervalState(e.target.value); save(duration, e.target.value, day, time); }}
            className="w-full rounded-md border border-green-200 bg-white px-2.5 py-1.5 text-sm text-green-900 outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400/30"
          >
            <option value="">Not set</option>
            {INTERVALS.map((iv) => (
              <option key={iv.value} value={iv.value}>
                {iv.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-green-600">
            Preferred day
          </label>
          <select
            value={day}
            onChange={(e) => { setDay(e.target.value); save(duration, interval, e.target.value, time); }}
            className="w-full rounded-md border border-green-200 bg-white px-2.5 py-1.5 text-sm text-green-900 outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400/30"
          >
            <option value="">Not set</option>
            {DAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-green-600">
            Preferred time
          </label>
          <select
            value={time}
            onChange={(e) => { setTime(e.target.value); save(duration, interval, day, e.target.value); }}
            className="w-full rounded-md border border-green-200 bg-white px-2.5 py-1.5 text-sm text-green-900 outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400/30"
          >
            <option value="">Not set</option>
            {TIMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-2 h-4">
        {isPending && (
          <span className="text-xs text-green-500">Saving...</span>
        )}
        {saved && !isPending && (
          <span className="text-xs text-green-600">Saved</span>
        )}
      </div>
    </div>
  );
}
