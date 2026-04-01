"use client";

import { useState, useTransition, useCallback, useRef } from "react";
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

// ─── Constants ──────────────────────────────────────

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const START_HOUR = 7;
const END_HOUR = 21;

// Build time slots: 07:00, 07:30, 08:00 ... 20:30
const TIME_SLOTS: string[] = [];
for (let h = START_HOUR; h < END_HOUR; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

// Location color palette
const LOCATION_COLORS = [
  { bg: "bg-green-200", bgHover: "hover:bg-green-300", border: "border-green-400", text: "text-green-800", dot: "bg-green-500" },
  { bg: "bg-blue-200", bgHover: "hover:bg-blue-300", border: "border-blue-400", text: "text-blue-800", dot: "bg-blue-500" },
  { bg: "bg-amber-200", bgHover: "hover:bg-amber-300", border: "border-amber-400", text: "text-amber-800", dot: "bg-amber-500" },
  { bg: "bg-purple-200", bgHover: "hover:bg-purple-300", border: "border-purple-400", text: "text-purple-800", dot: "bg-purple-500" },
  { bg: "bg-pink-200", bgHover: "hover:bg-pink-300", border: "border-pink-400", text: "text-pink-800", dot: "bg-pink-500" },
  { bg: "bg-teal-200", bgHover: "hover:bg-teal-300", border: "border-teal-400", text: "text-teal-800", dot: "bg-teal-500" },
];

function getLocationColor(index: number) {
  return LOCATION_COLORS[index % LOCATION_COLORS.length];
}

// Key for a grid cell
function cellKey(day: number, time: string) {
  return `${day}-${time}`;
}

// Convert templates to a grid map: cellKey -> proLocationId
function templatesToGrid(templates: TemplateRow[]): Map<string, number> {
  const grid = new Map<string, number>();
  for (const t of templates) {
    // Expand the template into 30-min cells
    for (const slot of TIME_SLOTS) {
      if (slot >= t.startTime && slot < t.endTime) {
        grid.set(cellKey(t.dayOfWeek, slot), t.proLocationId);
      }
    }
  }
  return grid;
}

// Convert grid map back to TemplateSlots (merge consecutive same-location cells per day)
function gridToTemplates(grid: Map<string, number>): TemplateSlot[] {
  const templates: TemplateSlot[] = [];

  for (let day = 0; day < 7; day++) {
    let currentStart: string | null = null;
    let currentLocation: number | null = null;

    for (let i = 0; i < TIME_SLOTS.length; i++) {
      const time = TIME_SLOTS[i];
      const key = cellKey(day, time);
      const locId = grid.get(key);

      if (locId !== undefined) {
        if (currentStart === null || currentLocation !== locId) {
          // Close previous range if any
          if (currentStart !== null && currentLocation !== null) {
            templates.push({
              dayOfWeek: day,
              startTime: currentStart,
              endTime: time,
              proLocationId: currentLocation,
            });
          }
          currentStart = time;
          currentLocation = locId;
        }
      } else {
        // Close current range
        if (currentStart !== null && currentLocation !== null) {
          templates.push({
            dayOfWeek: day,
            startTime: currentStart,
            endTime: time,
            proLocationId: currentLocation,
          });
          currentStart = null;
          currentLocation = null;
        }
      }
    }

    // Close any trailing range
    if (currentStart !== null && currentLocation !== null) {
      // End time is 30 min after the last slot
      const lastSlot = TIME_SLOTS[TIME_SLOTS.length - 1];
      const [h, m] = lastSlot.split(":").map(Number);
      const endTime = m === 30
        ? `${String(h + 1).padStart(2, "0")}:00`
        : `${String(h).padStart(2, "0")}:30`;
      templates.push({
        dayOfWeek: day,
        startTime: currentStart,
        endTime: endTime,
        proLocationId: currentLocation,
      });
    }
  }

  return templates;
}

// ─── Component ──────────────────────────────────────

export function AvailabilityEditor({ initialTemplates, proLocations }: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  // Grid state
  const [grid, setGrid] = useState<Map<string, number>>(() =>
    templatesToGrid(initialTemplates)
  );
  const [activeLocationId, setActiveLocationId] = useState<number>(
    proLocations[0]?.id ?? 0
  );

  // Drag painting state
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<"paint" | "erase">("paint");
  const gridRef = useRef<HTMLDivElement>(null);

  // Build location color index
  const locationColorMap = new Map<number, ReturnType<typeof getLocationColor>>();
  proLocations.forEach((loc, i) => {
    locationColorMap.set(loc.id, getLocationColor(i));
  });

  // ─── Grid interactions ────────────────────────────

  const handleCellMouseDown = useCallback(
    (day: number, time: string) => {
      const key = cellKey(day, time);
      const existing = grid.get(key);

      setIsDragging(true);

      if (existing !== undefined) {
        // Erase mode
        setDragMode("erase");
        setGrid((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      } else {
        // Paint mode
        setDragMode("paint");
        setGrid((prev) => {
          const next = new Map(prev);
          next.set(key, activeLocationId);
          return next;
        });
      }
    },
    [grid, activeLocationId]
  );

  const handleCellMouseEnter = useCallback(
    (day: number, time: string) => {
      if (!isDragging) return;
      const key = cellKey(day, time);

      setGrid((prev) => {
        const next = new Map(prev);
        if (dragMode === "erase") {
          next.delete(key);
        } else {
          next.set(key, activeLocationId);
        }
        return next;
      });
    },
    [isDragging, dragMode, activeLocationId]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // ─── Save ─────────────────────────────────────────

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const templates = gridToTemplates(grid);
      const result = await saveWeeklyTemplate(templates);
      if (result.success) {
        setMessage("Weekly schedule saved.");
      } else {
        setMessage(result.error ?? "Error saving schedule.");
      }
    });
  }

  // ─── Clear all ────────────────────────────────────

  function handleClearAll() {
    setGrid(new Map());
  }

  // ─── Override state ───────────────────────────────

  const [overrides, setOverrides] = useState<Override[]>([]);
  const [overrideMonth, setOverrideMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [overridesLoaded, setOverridesLoaded] = useState(false);

  const [newOverrideDate, setNewOverrideDate] = useState("");
  const [newOverrideType, setNewOverrideType] = useState<"blocked" | "available">("blocked");
  const [newOverrideStart, setNewOverrideStart] = useState("");
  const [newOverrideEnd, setNewOverrideEnd] = useState("");
  const [newOverrideReason, setNewOverrideReason] = useState("");
  const [newOverrideLocation, setNewOverrideLocation] = useState<number | "">("");

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

  // ─── Render ───────────────────────────────────────

  return (
    <div
      className="space-y-10"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
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

      {/* ── Weekly Grid ── */}
      <section>
        <h2 className="mb-4 font-display text-xl font-medium text-green-800">
          Weekly schedule
        </h2>

        {/* Location legend + selector */}
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-green-700">
              Paint with:
            </label>
            <select
              value={activeLocationId}
              onChange={(e) => setActiveLocationId(Number(e.target.value))}
              className="rounded-md border border-green-200 bg-white px-3 py-1.5 text-sm text-green-900"
            >
              {proLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                  {loc.city ? ` (${loc.city})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {proLocations.map((loc, i) => {
              const color = getLocationColor(i);
              return (
                <div key={loc.id} className="flex items-center gap-1.5">
                  <span
                    className={cn("inline-block h-3 w-3 rounded-sm", color.dot)}
                  />
                  <span className="text-xs text-green-700">
                    {loc.name}
                    {loc.city ? ` (${loc.city})` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="mb-3 text-xs text-green-500">
          Click to toggle slots. Click and drag to paint or erase multiple slots.
        </p>

        {/* Grid */}
        <div className="overflow-x-auto rounded-xl border border-green-200 bg-white">
          <div
            ref={gridRef}
            className="min-w-[640px] select-none"
            onDragStart={(e) => e.preventDefault()}
          >
            {/* Header row */}
            <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-green-200">
              <div className="border-r border-green-100 px-2 py-2" />
              {DAY_NAMES.map((day) => (
                <div
                  key={day}
                  className="border-r border-green-100 px-2 py-2 text-center text-xs font-semibold text-green-800 last:border-r-0"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Time rows */}
            {TIME_SLOTS.map((time, timeIdx) => {
              const isHour = time.endsWith(":00");
              return (
                <div
                  key={time}
                  className={cn(
                    "grid grid-cols-[60px_repeat(7,1fr)]",
                    isHour
                      ? "border-t border-green-200"
                      : "border-t border-green-100/50"
                  )}
                >
                  {/* Time label */}
                  <div
                    className={cn(
                      "border-r border-green-100 px-2 py-0.5 text-right text-[10px] text-green-400",
                      !isHour && "text-green-300"
                    )}
                  >
                    {isHour ? time : ""}
                  </div>

                  {/* Day cells */}
                  {DAY_NAMES.map((_, dayIdx) => {
                    const key = cellKey(dayIdx, time);
                    const locId = grid.get(key);
                    const color =
                      locId !== undefined
                        ? locationColorMap.get(locId)
                        : undefined;

                    return (
                      <div
                        key={dayIdx}
                        className={cn(
                          "h-6 cursor-pointer border-r border-green-100/50 transition-colors last:border-r-0",
                          color
                            ? cn(color.bg, color.bgHover)
                            : "hover:bg-green-50"
                        )}
                        onMouseDown={() => handleCellMouseDown(dayIdx, time)}
                        onMouseEnter={() =>
                          handleCellMouseEnter(dayIdx, time)
                        }
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-3">
          <Button
            className="bg-gold-600 text-white hover:bg-gold-500"
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? "Saving..." : "Save weekly schedule"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearAll}>
            Clear all
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
