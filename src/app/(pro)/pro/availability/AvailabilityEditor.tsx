"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  saveWeeklyTemplate,
  saveOverride,
  deleteOverride,
  getOverrides,
  type TemplateSlot,
} from "./actions";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────

interface TemplateRow {
  id?: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  proLocationId: number;
  validFrom: string | null;
  validUntil: string | null;
}

interface LocationOption {
  id: number;
  name: string;
  city: string | null;
}

interface Override {
  id: number;
  date: string;
  type: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  proLocationId: number | null;
}

interface Props {
  initialTemplates: TemplateRow[];
  proLocations: LocationOption[];
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Component ──────────────────────────────────────

export function AvailabilityEditor({ initialTemplates, proLocations }: Props) {
  const [isPending, startTransition] = useTransition();
  const [templates, setTemplates] = useState<TemplateRow[]>(initialTemplates);
  const [message, setMessage] = useState<string | null>(null);

  // Override state
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [overrideMonth, setOverrideMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [overridesLoaded, setOverridesLoaded] = useState(false);

  // New override form
  const [newOverrideDate, setNewOverrideDate] = useState("");
  const [newOverrideType, setNewOverrideType] = useState<"blocked" | "available">("blocked");
  const [newOverrideStart, setNewOverrideStart] = useState("");
  const [newOverrideEnd, setNewOverrideEnd] = useState("");
  const [newOverrideReason, setNewOverrideReason] = useState("");
  const [newOverrideLocation, setNewOverrideLocation] = useState<number | "">("");

  const defaultLocationId = proLocations[0]?.id ?? 0;

  // ─── Template management ──────────────────────────

  function addSlot(dayOfWeek: number) {
    setTemplates((prev) => [
      ...prev,
      {
        dayOfWeek,
        startTime: "09:00",
        endTime: "17:00",
        proLocationId: defaultLocationId,
        validFrom: null,
        validUntil: null,
      },
    ]);
  }

  function removeSlot(index: number) {
    setTemplates((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSlot(
    index: number,
    field: "startTime" | "endTime" | "proLocationId",
    value: string | number
  ) {
    setTemplates((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  }

  function handleSaveTemplates() {
    setMessage(null);
    startTransition(async () => {
      const slots: TemplateSlot[] = templates.map((t) => ({
        dayOfWeek: t.dayOfWeek,
        startTime: t.startTime,
        endTime: t.endTime,
        proLocationId: t.proLocationId,
      }));
      const result = await saveWeeklyTemplate(slots);
      if (result.success) {
        setMessage("Weekly schedule saved.");
      } else {
        setMessage(result.error ?? "Error saving schedule.");
      }
    });
  }

  // ─── Override management ──────────────────────────

  function loadOverrides(month?: string) {
    const m = month ?? overrideMonth;
    startTransition(async () => {
      const result = await getOverrides(m);
      setOverrides(result);
      setOverridesLoaded(true);
    });
  }

  function handleAddOverride() {
    if (!newOverrideDate) return;
    setMessage(null);

    startTransition(async () => {
      const result = await saveOverride({
        date: newOverrideDate,
        type: newOverrideType,
        startTime: newOverrideStart || null,
        endTime: newOverrideEnd || null,
        reason: newOverrideReason || null,
        proLocationId: newOverrideLocation ? Number(newOverrideLocation) : null,
      });

      if (result.success) {
        setNewOverrideDate("");
        setNewOverrideStart("");
        setNewOverrideEnd("");
        setNewOverrideReason("");
        loadOverrides();
      } else {
        setMessage(result.error ?? "Error saving override.");
      }
    });
  }

  function handleDeleteOverride(id: number) {
    startTransition(async () => {
      await deleteOverride(id);
      loadOverrides();
    });
  }

  // ─── Render ────────────────────────────────────────

  // Group templates by day
  const templatesByDay = DAY_NAMES.map((_, dayIndex) => ({
    dayIndex,
    slots: templates
      .map((t, originalIndex) => ({ ...t, originalIndex }))
      .filter((t) => t.dayOfWeek === dayIndex),
  }));

  return (
    <div className="space-y-10">
      {/* Message */}
      {message && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            message.includes("Error") || message.includes("error")
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          )}
        >
          {message}
        </div>
      )}

      {/* ── Weekly Template ── */}
      <section>
        <h2 className="mb-4 font-display text-xl font-medium text-green-800">
          Weekly schedule
        </h2>
        <div className="space-y-4">
          {templatesByDay.map(({ dayIndex, slots }) => (
            <div
              key={dayIndex}
              className="rounded-xl border border-green-200 bg-white p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-green-900">
                  {DAY_NAMES[dayIndex]}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addSlot(dayIndex)}
                >
                  + Add slot
                </Button>
              </div>
              {slots.length === 0 && (
                <p className="text-xs text-green-400">No availability</p>
              )}
              <div className="space-y-2">
                {slots.map((slot) => (
                  <div
                    key={slot.originalIndex}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input
                      type="time"
                      value={slot.startTime}
                      onChange={(e) =>
                        updateSlot(slot.originalIndex, "startTime", e.target.value)
                      }
                      className="rounded-md border border-green-200 px-2 py-1 text-sm text-green-900"
                    />
                    <span className="text-green-400">to</span>
                    <input
                      type="time"
                      value={slot.endTime}
                      onChange={(e) =>
                        updateSlot(slot.originalIndex, "endTime", e.target.value)
                      }
                      className="rounded-md border border-green-200 px-2 py-1 text-sm text-green-900"
                    />
                    <select
                      value={slot.proLocationId}
                      onChange={(e) =>
                        updateSlot(
                          slot.originalIndex,
                          "proLocationId",
                          Number(e.target.value)
                        )
                      }
                      className="rounded-md border border-green-200 px-2 py-1 text-sm text-green-900"
                    >
                      {proLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                          {loc.city ? ` (${loc.city})` : ""}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removeSlot(slot.originalIndex)}
                    >
                      <svg
                        className="h-3.5 w-3.5 text-red-400"
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
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Button
            className="bg-gold-600 text-white hover:bg-gold-500"
            onClick={handleSaveTemplates}
            disabled={isPending}
          >
            {isPending ? "Saving..." : "Save weekly schedule"}
          </Button>
        </div>
      </section>

      {/* ── Date Overrides ── */}
      <section>
        <h2 className="mb-4 font-display text-xl font-medium text-green-800">
          Date overrides
        </h2>
        <p className="mb-4 text-sm text-green-600">
          Block specific dates or add extra availability.
        </p>

        {/* Month selector */}
        <div className="mb-4 flex items-center gap-3">
          <input
            type="month"
            value={overrideMonth}
            onChange={(e) => {
              setOverrideMonth(e.target.value);
              setOverridesLoaded(false);
            }}
            className="rounded-md border border-green-200 px-3 py-1.5 text-sm text-green-900"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadOverrides()}
            disabled={isPending}
          >
            {overridesLoaded ? "Refresh" : "Load overrides"}
          </Button>
        </div>

        {/* Existing overrides */}
        {overridesLoaded && (
          <div className="mb-6 space-y-2">
            {overrides.length === 0 ? (
              <p className="text-sm text-green-400">
                No overrides for this month.
              </p>
            ) : (
              overrides.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between rounded-lg border border-green-200 bg-white px-4 py-2"
                >
                  <div>
                    <span className="text-sm font-medium text-green-900">
                      {o.date}
                    </span>
                    <span
                      className={cn(
                        "ml-2 rounded-md px-2 py-0.5 text-xs font-medium",
                        o.type === "blocked"
                          ? "bg-red-100 text-red-600"
                          : "bg-green-100 text-green-600"
                      )}
                    >
                      {o.type}
                    </span>
                    {o.startTime && o.endTime && (
                      <span className="ml-2 text-xs text-green-600">
                        {o.startTime} - {o.endTime}
                      </span>
                    )}
                    {o.reason && (
                      <span className="ml-2 text-xs text-green-500">
                        ({o.reason})
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleDeleteOverride(o.id)}
                    disabled={isPending}
                  >
                    <svg
                      className="h-3.5 w-3.5 text-red-400"
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
                  </Button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Add override form */}
        <div className="rounded-xl border border-green-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-green-800">
            Add override
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-green-600">Date</label>
              <input
                type="date"
                value={newOverrideDate}
                onChange={(e) => setNewOverrideDate(e.target.value)}
                className="rounded-md border border-green-200 px-2 py-1.5 text-sm text-green-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-green-600">Type</label>
              <select
                value={newOverrideType}
                onChange={(e) =>
                  setNewOverrideType(e.target.value as "blocked" | "available")
                }
                className="rounded-md border border-green-200 px-2 py-1.5 text-sm text-green-900"
              >
                <option value="blocked">Blocked</option>
                <option value="available">Available</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-green-600">
                Start (optional)
              </label>
              <input
                type="time"
                value={newOverrideStart}
                onChange={(e) => setNewOverrideStart(e.target.value)}
                className="rounded-md border border-green-200 px-2 py-1.5 text-sm text-green-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-green-600">
                End (optional)
              </label>
              <input
                type="time"
                value={newOverrideEnd}
                onChange={(e) => setNewOverrideEnd(e.target.value)}
                className="rounded-md border border-green-200 px-2 py-1.5 text-sm text-green-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-green-600">
                Location (optional)
              </label>
              <select
                value={newOverrideLocation}
                onChange={(e) =>
                  setNewOverrideLocation(
                    e.target.value ? Number(e.target.value) : ""
                  )
                }
                className="rounded-md border border-green-200 px-2 py-1.5 text-sm text-green-900"
              >
                <option value="">All locations</option>
                {proLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-green-600">
                Reason (optional)
              </label>
              <input
                type="text"
                value={newOverrideReason}
                onChange={(e) => setNewOverrideReason(e.target.value)}
                placeholder="e.g. Holiday"
                className="rounded-md border border-green-200 px-2 py-1.5 text-sm text-green-900"
              />
            </div>
            <Button
              className="bg-gold-600 text-white hover:bg-gold-500"
              size="sm"
              onClick={handleAddOverride}
              disabled={isPending || !newOverrideDate}
            >
              Add
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
