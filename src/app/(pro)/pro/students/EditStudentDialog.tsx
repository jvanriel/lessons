"use client";

import { useState, useRef, useTransition } from "react";
import { updateStudentInfo, resetStudentPassword, removeStudent } from "./actions";

interface Student {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  source: string;
  status: string;
  createdAt: Date;
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
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
];

const INTERVALS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
];

const TIMES: string[] = [];
for (let h = 7; h <= 21; h++) {
  for (const m of ["00", "30"]) {
    TIMES.push(`${String(h).padStart(2, "0")}:${m}`);
  }
}

const inputClass =
  "w-full rounded-md border border-green-200 bg-white px-3 py-1.5 text-sm text-green-900 outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400/30";

const selectClass =
  "w-full rounded-md border border-green-200 bg-white px-2.5 py-1.5 text-sm text-green-900 outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400/30";

export function EditStudentDialog({
  student,
  onClose,
}: {
  student: Student;
  onClose: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [firstName, setFirstName] = useState(student.firstName);
  const [lastName, setLastName] = useState(student.lastName);
  const [email, setEmail] = useState(student.email);
  const [phone, setPhone] = useState(student.phone ?? "");
  const [duration, setDuration] = useState(
    student.preferredDuration !== null ? String(student.preferredDuration) : ""
  );
  const [interval, setInterval] = useState(student.preferredInterval ?? "");
  const [day, setDay] = useState(
    student.preferredDayOfWeek !== null
      ? String(student.preferredDayOfWeek)
      : ""
  );
  const [time, setTime] = useState(student.preferredTime ?? "");

  // Feedback
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateStudentInfo(student.id, {
        firstName,
        lastName,
        email,
        phone,
        preferredDuration: duration !== "" ? Number(duration) : null,
        preferredInterval: interval || null,
        preferredDayOfWeek: day !== "" ? Number(day) : null,
        preferredTime: time || null,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  function handleResetPassword() {
    startTransition(async () => {
      const result = await resetStudentPassword(student.id);
      if (result.error) {
        setError(result.error);
      } else if (result.password) {
        setResetPassword(result.password);
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      await removeStudent(student.id);
      onClose();
    });
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-16"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-green-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-green-100 px-5 py-4">
          <h3 className="font-display text-lg font-semibold text-green-900">
            {student.firstName} {student.lastName}
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-green-400 hover:text-green-600"
          >
            <svg
              className="h-5 w-5"
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

        <div className="space-y-5 px-5 py-5">
          {/* Personal info */}
          <div>
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-green-400">
              Personal info
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-green-600">
                  First name
                </label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-green-600">
                  Last name
                </label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-green-600">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-green-600">
                  Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Booking preferences */}
          <div>
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-green-400">
              Booking preferences
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-green-600">
                  Duration
                </label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className={selectClass}
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
                  onChange={(e) => setInterval(e.target.value)}
                  className={selectClass}
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
                  onChange={(e) => setDay(e.target.value)}
                  className={selectClass}
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
                  onChange={(e) => setTime(e.target.value)}
                  className={selectClass}
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
          </div>

          {/* Save + feedback */}
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-500 disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Save changes"}
            </button>
            {saved && (
              <span className="text-xs text-green-600">Saved</span>
            )}
          </div>

          {/* Password reset */}
          <div className="border-t border-green-100 pt-4">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-green-400">
              Account
            </h4>
            {resetPassword ? (
              <div className="rounded-md bg-green-50 p-3">
                <p className="text-xs text-green-700">
                  New password sent to {email}:
                </p>
                <code className="mt-1 block rounded bg-white px-2 py-1 text-sm font-mono text-green-900">
                  {resetPassword}
                </code>
              </div>
            ) : (
              <button
                onClick={handleResetPassword}
                disabled={isPending}
                className="rounded-md border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-50 disabled:opacity-50"
              >
                Reset password
              </button>
            )}
          </div>

          {/* Remove student */}
          <div className="border-t border-green-100 pt-4">
            {!confirmRemove ? (
              <button
                onClick={() => setConfirmRemove(true)}
                className="text-xs text-red-400 hover:text-red-600"
              >
                Remove student
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-xs text-red-600">Are you sure?</p>
                <button
                  onClick={handleRemove}
                  disabled={isPending}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                >
                  Yes, remove
                </button>
                <button
                  onClick={() => setConfirmRemove(false)}
                  className="text-xs text-green-500 hover:text-green-700"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Meta info */}
          <div className="border-t border-green-100 pt-3 text-xs text-green-400">
            <span>Status: {student.status}</span>
            <span className="mx-2">&middot;</span>
            <span>
              Joined{" "}
              {new Date(student.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
