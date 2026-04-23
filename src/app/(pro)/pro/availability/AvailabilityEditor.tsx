"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import type {
  SerializedAvailability,
  SerializedOverride,
  SerializedProLocationWithName,
  SerializedBooking,
  SerializedProfileSettings,
} from "./actions";
import { saveWeeklyTemplate, saveWeekOverrides } from "./actions";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";
import { formatDate as formatDateLocale } from "@/lib/format-date";

// ─── Constants ───────────────────────────────────────

const DAY_KEYS = [
  "book.day.mon",
  "book.day.tue",
  "book.day.wed",
  "book.day.thu",
  "book.day.fri",
  "book.day.sat",
  "book.day.sun",
] as const;
const GRID_START_HOUR = 7;
const GRID_END_HOUR = 22;
const ROWS = (GRID_END_HOUR - GRID_START_HOUR) * 2; // 30 half-hour rows
const CELL_H_DESKTOP = 22;
const CELL_H_MOBILE = 44;

function useCellHeight() {
  const [cellH, setCellH] = useState(CELL_H_DESKTOP);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setCellH(mq.matches ? CELL_H_MOBILE : CELL_H_DESKTOP);
    function handler(e: MediaQueryListEvent) { setCellH(e.matches ? CELL_H_MOBILE : CELL_H_DESKTOP); }
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return cellH;
}

// Distinct colors for up to 6 locations
const LOCATION_COLORS = [
  { bg: "bg-green-500/80", bgHex: "#22c55e", text: "text-green-700", light: "bg-green-100", border: "border-green-500" },
  { bg: "bg-blue-500/80", bgHex: "#3b82f6", text: "text-blue-700", light: "bg-blue-100", border: "border-blue-500" },
  { bg: "bg-amber-500/80", bgHex: "#f59e0b", text: "text-amber-700", light: "bg-amber-100", border: "border-amber-500" },
  { bg: "bg-purple-500/80", bgHex: "#a855f7", text: "text-purple-700", light: "bg-purple-100", border: "border-purple-500" },
  { bg: "bg-rose-500/80", bgHex: "#f43f5e", text: "text-rose-700", light: "bg-rose-100", border: "border-rose-500" },
  { bg: "bg-cyan-500/80", bgHex: "#06b6d4", text: "text-cyan-700", light: "bg-cyan-100", border: "border-cyan-500" },
];

function rowToTime(row: number): string {
  const totalMinutes = (GRID_START_HOUR * 60) + (row * 30);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToRow(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return Math.max(0, Math.min(ROWS, ((h * 60 + m) - GRID_START_HOUR * 60) / 30));
}

// Grid cell stores a Set of location IDs
type LocationGrid = Set<number>[][];

function availabilityToLocationGrid(slots: SerializedAvailability[]): LocationGrid {
  const grid: LocationGrid = Array.from({ length: 7 }, () =>
    Array.from({ length: ROWS }, () => new Set<number>()),
  );
  for (const s of slots) {
    const startRow = timeToRow(s.startTime);
    const endRow = timeToRow(s.endTime);
    for (let r = startRow; r < endRow; r++) {
      grid[s.dayOfWeek][r].add(s.proLocationId);
    }
  }
  return grid;
}

// Extract slots for one location from the grid
function gridToSlotsForLocation(
  grid: LocationGrid,
  locationId: number,
): Array<{ dayOfWeek: number; startTime: string; endTime: string }> {
  const slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }> = [];
  for (let day = 0; day < 7; day++) {
    let inBlock = false;
    let blockStart = 0;
    for (let row = 0; row <= ROWS; row++) {
      const active = row < ROWS && grid[day][row].has(locationId);
      if (active && !inBlock) {
        inBlock = true;
        blockStart = row;
      } else if (!active && inBlock) {
        inBlock = false;
        slots.push({
          dayOfWeek: day,
          startTime: rowToTime(blockStart),
          endTime: rowToTime(row),
        });
      }
    }
  }
  return slots;
}

function getDayOfWeek(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateShort(dateStr: string, locale: Locale): string {
  return formatDateLocale(dateStr, locale, { day: "numeric", month: "short" });
}

function getWeekNumber(d: Date): number {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const yearStart = new Date(date.getFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ─── Landscape gate ──────────────────────────────────

/**
 * The availability grid is 7 day-columns wide and needs space — on a
 * phone held portrait the columns get too narrow to tap reliably and
 * the surrounding controls overflow. On tablets and up there's always
 * enough room so the hint is hidden. Shown only when portrait AND
 * below the md breakpoint.
 */
function LandscapeRotateHint({ locale }: { locale: Locale }) {
  return (
    <div className="fixed inset-0 z-40 hidden flex-col items-center justify-center bg-cream/95 px-8 text-center portrait:max-md:flex">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-green-200 bg-white">
        <svg
          className="h-8 w-8 text-green-700"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h18M16.5 3L21 7.5m0 0L16.5 12M21 7.5H3"
          />
        </svg>
      </div>
      <h2 className="font-display text-xl font-semibold text-green-900">
        {t("proAvail.rotateLandscape.title", locale)}
      </h2>
      <p className="mt-2 max-w-sm text-sm text-green-700">
        {t("proAvail.rotateLandscape.body", locale)}
      </p>
    </div>
  );
}

// ─── Touch paint helpers ─────────────────────────────

const LONG_PRESS_MS = 350;
const LONG_PRESS_MOVE_TOLERANCE = 10;

/**
 * Gates a cell paint operation for touch: on mouse/pen, `fire` runs
 * immediately (and `startDrag` is also invoked). On touch, `fire` only
 * runs if the finger stays put for ~350ms — a short tap does nothing,
 * leaving the page free to scroll. Once long-press fires, `startDrag`
 * gets called so the caller can attach window-level pointermove
 * listeners to hit-test adjacent cells and paint them.
 */
function beginCellPointer(
  e: React.PointerEvent,
  fire: () => void,
  startDrag: () => void,
) {
  if (e.pointerType !== "touch") {
    e.preventDefault();
    fire();
    startDrag();
    return;
  }
  // Touch: wait for a long-press before doing anything. Meanwhile the
  // browser is free to scroll if the user slides their finger.
  const startX = e.clientX;
  const startY = e.clientY;
  let done = false;
  const cleanup = () => {
    done = true;
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onEnd, true);
    window.removeEventListener("pointercancel", onEnd, true);
  };
  const onMove = (ev: PointerEvent) => {
    if (done) return;
    if (
      Math.abs(ev.clientX - startX) > LONG_PRESS_MOVE_TOLERANCE ||
      Math.abs(ev.clientY - startY) > LONG_PRESS_MOVE_TOLERANCE
    ) {
      clearTimeout(timer);
      cleanup();
    }
  };
  const onEnd = () => {
    clearTimeout(timer);
    cleanup();
  };
  const timer = window.setTimeout(() => {
    if (done) return;
    fire();
    startDrag();
    if ("vibrate" in navigator) {
      try {
        navigator.vibrate(15);
      } catch {
        /* user-agent gesture rules — ignore */
      }
    }
    cleanup();
  }, LONG_PRESS_MS);
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onEnd, true);
  window.addEventListener("pointercancel", onEnd, true);
}

/**
 * Given a clientX/Y, find the [data-cell] element under the cursor and
 * return its {day, row}. Null if the hit-point isn't on a cell.
 */
function hitTestCell(clientX: number, clientY: number): { day: number; row: number } | null {
  const el = document.elementFromPoint(clientX, clientY);
  const cell = el?.closest("[data-cell]") as HTMLElement | null;
  if (!cell) return null;
  const attr = cell.getAttribute("data-cell");
  if (!attr) return null;
  const parts = attr.split("-").map(Number);
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null;
  return { day: parts[0], row: parts[1] };
}

// ─── Main Component ──────────────────────────────────

interface Props {
  locations: SerializedProLocationWithName[];
  availability: SerializedAvailability[];
  overrides: SerializedOverride[];
  bookings: SerializedBooking[];
  profileSettings: SerializedProfileSettings;
  locale: Locale;
}

export default function AvailabilityEditor({
  locations,
  availability,
  overrides,
  bookings,
  profileSettings,
  locale,
}: Props) {
  const CELL_H = useCellHeight();

  // Build location -> color index map
  const locationColorMap = useMemo(() => {
    const map = new Map<number, number>();
    locations.forEach((loc, i) => map.set(loc.id, i % LOCATION_COLORS.length));
    return map;
  }, [locations]);

  // Active brush for painting
  const [activeLocationId, setActiveLocationId] = useState<number>(locations[0]?.id || 0);

  // Lift template grid state so preview can read it
  const [templateGrid, setTemplateGrid] = useState(() => availabilityToLocationGrid(availability));

  // Reset when server data changes
  const prevAvailRef = useRef(availability);
  useEffect(() => {
    if (prevAvailRef.current !== availability) {
      prevAvailRef.current = availability;
      setTemplateGrid(availabilityToLocationGrid(availability));
    }
  }, [availability]);

  if (locations.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-8 text-center text-sm text-amber-800">
        {t("proAvail.noLocationsLinked", locale)}{" "}
        <a href="/pro/profile" className="text-gold-600 underline hover:text-gold-500">
          {t("proAvail.addViaProfile", locale)}
        </a>{" "}
        {t("proAvail.toSetAvailability", locale)}
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-8">
      <LandscapeRotateHint locale={locale} />
      {/* Section 1: Unified weekly template */}
      <WeeklyTemplateGrid
        locations={locations}
        locationColorMap={locationColorMap}
        activeLocationId={activeLocationId}
        onActiveLocationChange={setActiveLocationId}
        grid={templateGrid}
        onGridChange={setTemplateGrid}
        locale={locale}
      />

      {/* Section 2: Preview / blocking grid */}
      <PreviewBlockingGrid
        locations={locations}
        locationColorMap={locationColorMap}
        templateGrid={templateGrid}
        overrides={overrides}
        bookings={bookings}
        profileSettings={profileSettings}
        locale={locale}
      />
    </div>
  );
}

// ─── Section 1: Unified Weekly Template Grid ─────────

function WeeklyTemplateGrid({
  locations,
  locationColorMap,
  activeLocationId,
  onActiveLocationChange,
  grid,
  onGridChange,
  locale,
}: {
  locations: SerializedProLocationWithName[];
  locationColorMap: Map<number, number>;
  activeLocationId: number;
  onActiveLocationChange: (id: number) => void;
  grid: LocationGrid;
  onGridChange: (grid: LocationGrid) => void;
  locale: Locale;
}) {
  const CELL_H = useCellHeight();
  const [dirtyLocations, setDirtyLocations] = useState<Set<number>>(new Set());
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Auto-save dirty locations after 2s of inactivity
  useEffect(() => {
    if (dirtyLocations.size === 0) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSaveStatus("saving");
      const locIds = [...dirtyLocations];
      setDirtyLocations(new Set());
      (async () => {
        for (const locId of locIds) {
          const slots = gridToSlotsForLocation(grid, locId);
          const result = await saveWeeklyTemplate({ proLocationId: locId, slots });
          if (result.error) {
            setSaveStatus("idle");
            return;
          }
        }
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 2000);
      })();
    }, 2000);
    return () => clearTimeout(debounceRef.current);
  }, [dirtyLocations, grid]);

  const updateCell = useCallback((day: number, row: number, adding: boolean) => {
    onGridChange(
      grid.map((col, colIdx) =>
        colIdx === day
          ? col.map((cell, rowIdx) => {
              if (rowIdx !== row) return cell;
              const next = new Set(cell);
              if (adding) next.add(activeLocationId);
              else next.delete(activeLocationId);
              return next;
            })
          : col.map((cell) => new Set(cell)),
      ),
    );
    setDirtyLocations((prev) => new Set(prev).add(activeLocationId));
    setSaveStatus("idle");
  }, [activeLocationId, grid, onGridChange]);

  // Anchor for Shift+click range selection on desktop. Stores the last
  // deliberately clicked cell plus the value the click produced, so a
  // subsequent shift-click fills the rectangle between the two with
  // that same value. One click / tap toggles a single cell; mobile has
  // no shift modifier so it's tap-per-cell (task 27, 1a/1b).
  const anchorRef = useRef<{ day: number; row: number; adding: boolean } | null>(
    null,
  );

  function applyRange(
    d0: number,
    d1: number,
    r0: number,
    r1: number,
    adding: boolean,
  ) {
    const dMin = Math.min(d0, d1);
    const dMax = Math.max(d0, d1);
    const rMin = Math.min(r0, r1);
    const rMax = Math.max(r0, r1);
    for (let d = dMin; d <= dMax; d++) {
      for (let r = rMin; r <= rMax; r++) {
        updateCell(d, r, adding);
      }
    }
  }

  function handlePointerDown(day: number, row: number, e: React.PointerEvent) {
    if (e.shiftKey && e.pointerType === "mouse" && anchorRef.current) {
      const a = anchorRef.current;
      applyRange(a.day, day, a.row, row, a.adding);
      anchorRef.current = { day, row, adding: a.adding };
      return;
    }

    const isActive = grid[day][row].has(activeLocationId);
    const adding = !isActive;
    updateCell(day, row, adding);
    anchorRef.current = { day, row, adding };
  }

  // Drag painting — after a mouse-down or long-press-on-touch starts,
  // attach window listeners so moving across adjacent cells paints them
  // with the anchor's value.
  function startTemplateDrag() {
    const lastKeyRef = { current: "" };
    const move = (ev: PointerEvent) => {
      const a = anchorRef.current;
      if (!a) return;
      const hit = hitTestCell(ev.clientX, ev.clientY);
      if (!hit) return;
      const key = `${hit.day}-${hit.row}`;
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;
      updateCell(hit.day, hit.row, a.adding);
    };
    const up = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
  }

  return (
    <div className="rounded-xl border border-green-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-green-950">{t("proAvail.weeklyHeading", locale)}</h2>
          <p className="mt-0.5 text-xs text-green-700/50">
            {t("proAvail.weeklyHelp", locale)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === "saving" && (
            <span className="text-xs text-green-700/50 animate-pulse">{t("proAvail.saving", locale)}</span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs text-green-600">{t("proAvail.saved", locale)}</span>
          )}
        </div>
      </div>

      {/* Location brush selector */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-green-700/50">{t("proAvail.location", locale)}:</span>
        {locations.map((loc) => {
          const colorIdx = locationColorMap.get(loc.id) ?? 0;
          const color = LOCATION_COLORS[colorIdx];
          const isActive = loc.id === activeLocationId;
          return (
            <button
              key={loc.id}
              onClick={() => onActiveLocationChange(loc.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                isActive
                  ? `${color.light} ${color.text} ring-2 ${color.border} ring-offset-1`
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              } ${!loc.active ? "opacity-50" : ""}`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: color.bgHex }}
              />
              {loc.locationName}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] italic text-green-500">
        {t("proAvail.clickHint", locale)}
      </p>
      <p className="mt-1 text-[10px] italic text-green-500 md:hidden">
        {t("proAvail.scrollHint", locale)}
      </p>

      {/* Grid */}
      <div className="mt-4 select-none overflow-x-auto">
        <div className="grid" style={{
          gridTemplateColumns: `48px repeat(7, minmax(0, 1fr))`,
          minWidth: 480,
        }}>
          {/* Header */}
          <div />
          {DAY_KEYS.map((dk) => (
            <div key={dk} className="pb-1 text-center text-xs font-medium text-green-700/60">
              {t(dk, locale)}
            </div>
          ))}

          {/* Grid rows */}
          {Array.from({ length: ROWS }, (_, row) => {
            const isHourBoundary = row % 2 === 0;
            return [
              <div
                key={`label-${row}`}
                className="flex items-center justify-end pr-2 text-[10px] text-green-700/40"
                style={{ height: CELL_H }}
              >
                {isHourBoundary ? rowToTime(row) : ""}
              </div>,
              ...Array.from({ length: 7 }, (_, day) => {
                const cellLocs = grid[day][row];
                const locCount = cellLocs.size;
                const isConflict = locCount > 1;

                // Determine cell color
                const cellStyle: React.CSSProperties = { height: CELL_H };
                let cellClass = `cursor-pointer border-r border-green-100 transition-colors ${
                  isHourBoundary ? "border-t border-t-green-100" : "border-t border-t-green-50"
                }`;

                if (locCount === 0) {
                  cellClass += " hover:bg-green-100/50";
                } else if (locCount === 1) {
                  const locId = [...cellLocs][0];
                  const colorIdx = locationColorMap.get(locId) ?? 0;
                  cellStyle.backgroundColor = LOCATION_COLORS[colorIdx].bgHex;
                  cellStyle.opacity = 0.75;
                  // Rounding for contiguous blocks
                  const aboveSame = row > 0 && grid[day][row - 1].has(locId);
                  const belowSame = row < ROWS - 1 && grid[day][row + 1].has(locId);
                  if (!aboveSame) cellClass += " rounded-t";
                  if (!belowSame) cellClass += " rounded-b";
                } else {
                  // Conflict: striped pattern
                  const colors = [...cellLocs].map((id) => {
                    const idx = locationColorMap.get(id) ?? 0;
                    return LOCATION_COLORS[idx].bgHex;
                  });
                  cellStyle.background = `repeating-linear-gradient(135deg, ${colors[0]} 0px, ${colors[0]} 3px, ${colors[1] || colors[0]} 3px, ${colors[1] || colors[0]} 6px)`;
                  cellStyle.opacity = 0.8;
                }

                return (
                  <div
                    key={`${day}-${row}`}
                    data-cell={`${day}-${row}`}
                    onPointerDown={(e) =>
                      beginCellPointer(
                        e,
                        () => handlePointerDown(day, row, e),
                        () => startTemplateDrag(),
                      )
                    }
                    onContextMenu={(e) => e.preventDefault()}
                    className={cellClass}
                    style={cellStyle}
                    title={
                      locCount > 0
                        ? [...cellLocs]
                            .map((id) => locations.find((l) => l.id === id)?.locationName)
                            .join(" + ") + (isConflict ? " -- Overlap" : "")
                        : undefined
                    }
                  >
                    {isConflict && (
                      <span className="flex h-full items-center justify-center text-[9px] text-white font-bold drop-shadow">
                        !
                      </span>
                    )}
                  </div>
                );
              }),
            ];
          }).flat()}
        </div>
      </div>
    </div>
  );
}

// ─── Section 2: Preview / Blocking Grid ──────────────

interface DayInfo {
  date: string;
  dayOfWeek: number;
  isPast: boolean;
  isBeyondHorizon: boolean;
}

function initBlockedCells(days: DayInfo[], overrides: SerializedOverride[]): boolean[][] {
  const cells = Array.from({ length: 7 }, () => Array<boolean>(ROWS).fill(false));
  for (const o of overrides) {
    if (o.type !== "blocked" || !o.startTime || !o.endTime) continue;
    const dayIdx = days.findIndex((d) => d.date === o.date);
    if (dayIdx < 0) continue;
    const startRow = timeToRow(o.startTime);
    const endRow = timeToRow(o.endTime);
    for (let r = startRow; r < endRow; r++) cells[dayIdx][r] = true;
  }
  return cells;
}

function initFullDayBlocked(days: DayInfo[], overrides: SerializedOverride[]): boolean[] {
  const full = Array<boolean>(7).fill(false);
  for (const o of overrides) {
    if (o.type !== "blocked") continue;
    if (o.startTime && o.endTime) continue; // has specific times
    const dayIdx = days.findIndex((d) => d.date === o.date);
    if (dayIdx >= 0) full[dayIdx] = true;
  }
  return full;
}

function initBlockReasons(days: DayInfo[], overrides: SerializedOverride[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const o of overrides) {
    if (o.type !== "blocked" || !o.reason) continue;
    const dayIdx = days.findIndex((d) => d.date === o.date);
    if (dayIdx < 0) continue;
    if (!o.startTime || !o.endTime) {
      map.set(`${dayIdx}`, o.reason);
    } else {
      map.set(`${dayIdx}-${timeToRow(o.startTime)}`, o.reason);
    }
  }
  return map;
}

function initExtraAvailCells(days: DayInfo[], overrides: SerializedOverride[]): Set<number>[][] {
  const cells: Set<number>[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: ROWS }, () => new Set<number>()),
  );
  for (const o of overrides) {
    if (o.type !== "available" || !o.startTime || !o.endTime || !o.proLocationId) continue;
    const dayIdx = days.findIndex((d) => d.date === o.date);
    if (dayIdx < 0) continue;
    const startRow = timeToRow(o.startTime);
    const endRow = timeToRow(o.endTime);
    for (let r = startRow; r < endRow; r++) cells[dayIdx][r].add(o.proLocationId);
  }
  return cells;
}

function findBlockStart(cells: boolean[][], dayIdx: number, row: number): number {
  let r = row;
  while (r > 0 && cells[dayIdx][r - 1]) r--;
  return r;
}

function PreviewBlockingGrid({
  locations,
  locationColorMap,
  templateGrid,
  overrides,
  bookings,
  profileSettings,
  locale,
}: {
  locations: SerializedProLocationWithName[];
  locationColorMap: Map<number, number>;
  templateGrid: LocationGrid;
  overrides: SerializedOverride[];
  bookings: SerializedBooking[];
  profileSettings: SerializedProfileSettings;
  locale: Locale;
}) {
  const CELL_H = useCellHeight();
  const [weekOffset, setWeekOffset] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayStr = toLocalDateStr(today);

  const days = useMemo((): DayInfo[] => {
    const currentDow = (today.getDay() + 6) % 7;
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - currentDow + weekOffset * 7);
    const horizonDate = new Date(today);
    horizonDate.setDate(horizonDate.getDate() + profileSettings.bookingHorizon);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return {
        date: toLocalDateStr(d),
        dayOfWeek: getDayOfWeek(d),
        isPast: d < today,
        isBeyondHorizon: d > horizonDate,
      };
    });
  }, [weekOffset, today, profileSettings.bookingHorizon]);

  const weekStart = useMemo(() => {
    const currentDow = (today.getDay() + 6) % 7;
    const ws = new Date(today);
    ws.setDate(ws.getDate() - currentDow + weekOffset * 7);
    return ws;
  }, [weekOffset, today]);

  // ─── Brush: blocked or extra availability per location ─
  type PreviewBrush = { mode: "blocked" } | { mode: "available"; locationId: number };
  const [brush, setBrush] = useState<PreviewBrush>({ mode: "blocked" });

  // ─── State: blocked cells + extra availability cells ──
  const [blockedCells, setBlockedCells] = useState(() => initBlockedCells(days, overrides));
  const [fullDayBlocked, setFullDayBlocked] = useState(() => initFullDayBlocked(days, overrides));
  const [extraAvailCells, setExtraAvailCells] = useState(() => initExtraAvailCells(days, overrides));
  const [reasons, setReasons] = useState(() => initBlockReasons(days, overrides));

  // Reset state when week or overrides change
  const prevKey = useRef(`${weekOffset}|${overrides.length}`);
  const key = `${weekOffset}|${overrides.length}`;
  useEffect(() => {
    if (key !== prevKey.current) {
      prevKey.current = key;
      setBlockedCells(initBlockedCells(days, overrides));
      setFullDayBlocked(initFullDayBlocked(days, overrides));
      setExtraAvailCells(initExtraAvailCells(days, overrides));
      setReasons(initBlockReasons(days, overrides));
      setDirty(false);
      setSaveStatus("idle");
    }
  }, [key, days, overrides]);

  // ─── Template availability + bookings (read-only background) ──
  const { templateAvailMap, bookingMap } = useMemo(() => {
    // Map templateGrid (indexed by dayOfWeek 0-6) onto the calendar days
    const aMap: Set<number>[][] = Array.from({ length: 7 }, (_, dayIdx) =>
      Array.from({ length: ROWS }, (_, row) => new Set(templateGrid[days[dayIdx].dayOfWeek][row])),
    );

    const bMap: (string | null)[][] = Array.from({ length: 7 }, () =>
      Array<string | null>(ROWS).fill(null),
    );
    for (const b of bookings) {
      if (b.status?.startsWith("cancelled")) continue;
      const dayIdx = days.findIndex((d) => d.date === b.date);
      if (dayIdx < 0) continue;
      const startRow = timeToRow(b.startTime);
      const endRow = timeToRow(b.endTime);
      const label = b.bookerName || t("proAvail.booked", locale);
      for (let r = startRow; r < endRow; r++) bMap[dayIdx][r] = label;
    }

    return { templateAvailMap: aMap, bookingMap: bMap };
  }, [days, templateGrid, bookings]);

  // ─── Paint handlers ───────────────────────────────

  const paintCell = useCallback(
    (dayIdx: number, row: number, adding: boolean) => {
      if (brush.mode === "blocked") {
        setBlockedCells((prev) => {
          const next = prev.map((col) => [...col]);
          next[dayIdx][row] = adding;
          return next;
        });
        // Clear extra avail from this cell when blocking
        if (adding) {
          setExtraAvailCells((prev) => {
            const next = prev.map((col) => col.map((s) => new Set(s)));
            next[dayIdx][row].clear();
            return next;
          });
        }
      } else {
        const locId = brush.locationId;
        setExtraAvailCells((prev) => {
          const next = prev.map((col) => col.map((s) => new Set(s)));
          if (adding) next[dayIdx][row].add(locId);
          else next[dayIdx][row].delete(locId);
          return next;
        });
        // Clear blocked from this cell when adding availability
        if (adding) {
          setBlockedCells((prev) => {
            const next = prev.map((col) => [...col]);
            next[dayIdx][row] = false;
            return next;
          });
        }
      }
      setDirty(true);
      setSaveStatus("idle");
    },
    [brush],
  );

  // Click = toggle one cell; Shift+click (desktop) = fill rectangle
  // from the last click to this cell with the anchor's value. Mobile
  // taps each cell — no drag (task 27, 1a/1b).
  const anchorRef2 = useRef<{
    day: number;
    row: number;
    adding: boolean;
  } | null>(null);

  function currentState(dayIdx: number, row: number): boolean {
    if (brush.mode === "blocked") return blockedCells[dayIdx][row];
    return extraAvailCells[dayIdx][row].has(brush.locationId);
  }

  function applyRange2(
    d0: number,
    d1: number,
    r0: number,
    r1: number,
    adding: boolean,
  ) {
    const dMin = Math.min(d0, d1);
    const dMax = Math.max(d0, d1);
    const rMin = Math.min(r0, r1);
    const rMax = Math.max(r0, r1);
    for (let d = dMin; d <= dMax; d++) {
      if (days[d]?.isPast || fullDayBlocked[d]) continue;
      for (let r = rMin; r <= rMax; r++) {
        paintCell(d, r, adding);
      }
    }
  }

  // Second-click-on-same-cell within 300ms is treated as "double-click"
  // and opens the reason popover instead of toggling the cell back off
  // (task 27, 1-extra). The native onDoubleClick fires too late — the
  // second click has already undone the first click's block.
  const lastClickRef = useRef<{
    dayIdx: number;
    row: number;
    time: number;
  } | null>(null);

  function handlePointerDown(dayIdx: number, row: number, e: React.PointerEvent) {
    if (days[dayIdx].isPast || fullDayBlocked[dayIdx]) return;

    const now = Date.now();
    const last = lastClickRef.current;
    const isSecondClick =
      !!last &&
      last.dayIdx === dayIdx &&
      last.row === row &&
      now - last.time < 300;

    if (isSecondClick && blockedCells[dayIdx][row]) {
      // The first click blocked this cell. Treat the second quick click
      // as "open reason" rather than "toggle off".
      lastClickRef.current = null;
      e.preventDefault();
      const key = `${dayIdx}-${findBlockStart(blockedCells, dayIdx, row)}`;
      setEditPopover({ key, x: e.clientX, y: e.clientY });
      return;
    }

    lastClickRef.current = { dayIdx, row, time: now };

    if (e.shiftKey && e.pointerType === "mouse" && anchorRef2.current) {
      const a = anchorRef2.current;
      applyRange2(a.day, dayIdx, a.row, row, a.adding);
      anchorRef2.current = { day: dayIdx, row, adding: a.adding };
      return;
    }

    const adding = !currentState(dayIdx, row);
    paintCell(dayIdx, row, adding);
    anchorRef2.current = { day: dayIdx, row, adding };
  }

  function startOverrideDrag() {
    const lastKeyRef = { current: "" };
    const move = (ev: PointerEvent) => {
      const a = anchorRef2.current;
      if (!a) return;
      const hit = hitTestCell(ev.clientX, ev.clientY);
      if (!hit) return;
      if (days[hit.day]?.isPast || fullDayBlocked[hit.day]) return;
      const key = `${hit.day}-${hit.row}`;
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;
      paintCell(hit.day, hit.row, a.adding);
    };
    const up = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
  }

  function toggleFullDay(dayIdx: number) {
    const turning = !fullDayBlocked[dayIdx];
    setFullDayBlocked((prev) => {
      const next = [...prev];
      next[dayIdx] = turning;
      return next;
    });
    if (turning) {
      // Clear individual blocked + extra avail cells
      setBlockedCells((prev) => {
        const next = prev.map((col) => [...col]);
        next[dayIdx] = Array<boolean>(ROWS).fill(false);
        return next;
      });
      setExtraAvailCells((prev) => {
        const next = prev.map((col) => col.map((s) => new Set(s)));
        next[dayIdx] = Array.from({ length: ROWS }, () => new Set<number>());
        return next;
      });
    }
    setDirty(true);
    setSaveStatus("idle");
  }

  function updateReason(rKey: string, value: string) {
    setReasons((prev) => {
      const next = new Map(prev);
      if (value) next.set(rKey, value);
      else next.delete(rKey);
      return next;
    });
    setDirty(true);
    setSaveStatus("idle");
  }

  // ─── Double-click reason popover ──────────────────
  const [editPopover, setEditPopover] = useState<{ key: string; x: number; y: number } | null>(null);

  function handleDoubleClick(dayIdx: number, row: number, e: React.MouseEvent) {
    const isBlocked = fullDayBlocked[dayIdx] || blockedCells[dayIdx][row];
    if (!isBlocked || days[dayIdx].isPast) return;
    e.preventDefault();
    const reasonKey = fullDayBlocked[dayIdx]
      ? `${dayIdx}`
      : `${dayIdx}-${findBlockStart(blockedCells, dayIdx, row)}`;
    setEditPopover({ key: reasonKey, x: e.clientX, y: e.clientY });
  }

  // ─── Auto-save overrides after 2s of inactivity ──
  useEffect(() => {
    if (!dirty) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSaveStatus("saving");
      setDirty(false);

      const datesToReplace = days.filter((d) => !d.isPast).map((d) => d.date);
      const records: Array<{
        date: string;
        type: "blocked" | "available";
        proLocationId?: number;
        startTime?: string;
        endTime?: string;
        reason?: string;
      }> = [];

      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        if (days[dayIdx].isPast) continue;
        const date = days[dayIdx].date;

        // ── Blocked overrides ──
        if (fullDayBlocked[dayIdx]) {
          records.push({ date, type: "blocked", reason: reasons.get(`${dayIdx}`) });
        } else {
          let inBlock = false;
          let startRow = 0;
          for (let row = 0; row <= ROWS; row++) {
            const active = row < ROWS && blockedCells[dayIdx][row];
            if (active && !inBlock) {
              inBlock = true;
              startRow = row;
            }
            if (!active && inBlock) {
              inBlock = false;
              records.push({
                date,
                type: "blocked",
                startTime: rowToTime(startRow),
                endTime: rowToTime(row),
                reason: reasons.get(`${dayIdx}-${startRow}`),
              });
            }
          }
        }

        // ── Extra availability overrides per location ──
        if (!fullDayBlocked[dayIdx]) {
          const locIds = new Set<number>();
          for (let row = 0; row < ROWS; row++) {
            for (const id of extraAvailCells[dayIdx][row]) locIds.add(id);
          }
          for (const locId of locIds) {
            let inBlock = false;
            let startRow = 0;
            for (let row = 0; row <= ROWS; row++) {
              const active = row < ROWS && extraAvailCells[dayIdx][row].has(locId);
              if (active && !inBlock) {
                inBlock = true;
                startRow = row;
              }
              if (!active && inBlock) {
                inBlock = false;
                records.push({
                  date,
                  type: "available",
                  proLocationId: locId,
                  startTime: rowToTime(startRow),
                  endTime: rowToTime(row),
                });
              }
            }
          }
        }
      }

      (async () => {
        const result = await saveWeekOverrides({ datesToReplace, overrides: records });
        if (!result.error) {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 2000);
        } else {
          setSaveStatus("idle");
        }
      })();
    }, 2000);
    return () => clearTimeout(debounceRef.current);
  }, [dirty, days, blockedCells, fullDayBlocked, extraAvailCells, reasons]);

  // ─── Helpers for cell rendering ───────────────────
  function cellLocNames(locs: Set<number>): string {
    return [...locs].map((id) => locations.find((l) => l.id === id)?.locationName).join(" + ");
  }

  return (
    <div className="rounded-xl border border-green-200 bg-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-green-950">{t("proAvail.blocksHeading", locale)}</h2>
          <p className="mt-0.5 text-xs text-green-700/50">
            {t("proAvail.blocksHelp", locale)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === "saving" && (
            <span className="text-xs text-green-700/50 animate-pulse">{t("proAvail.saving", locale)}</span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs text-green-600">{t("proAvail.saved", locale)}</span>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset((w) => w - 1)}
              className="rounded border border-green-200 px-2 py-1 text-xs text-green-700 hover:bg-green-50"
            >
              &#9664;
            </button>
            <span className="min-w-[80px] text-center text-sm font-medium text-green-950">
              {t("proAvail.week", locale)} {getWeekNumber(weekStart)}
            </span>
            <button
              onClick={() => setWeekOffset((w) => w + 1)}
              className="rounded border border-green-200 px-2 py-1 text-xs text-green-700 hover:bg-green-50"
            >
              &#9654;
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="ml-1 text-xs text-gold-600 hover:text-gold-500"
              >
                {t("proAvail.today", locale)}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Brush selector */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-green-700/50">{t("proAvail.mode", locale)}:</span>
        <button
          onClick={() => setBrush({ mode: "blocked" })}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
            brush.mode === "blocked"
              ? "bg-red-100 text-red-700 ring-2 ring-red-500 ring-offset-1"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
          {t("proAvail.modeBlock", locale)}
        </button>
        {locations.map((loc) => {
          const colorIdx = locationColorMap.get(loc.id) ?? 0;
          const color = LOCATION_COLORS[colorIdx];
          const isActive = brush.mode === "available" && brush.locationId === loc.id;
          return (
            <button
              key={loc.id}
              onClick={() => setBrush({ mode: "available", locationId: loc.id })}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                isActive
                  ? `${color.light} ${color.text} ring-2 ${color.border} ring-offset-1`
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              } ${!loc.active ? "opacity-50" : ""}`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: color.bgHex }}
              />
              + {loc.locationName}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] italic text-green-500">
        {t("proAvail.clickHint", locale)}
      </p>
      <p className="mt-1 text-[10px] italic text-green-500 md:hidden">
        {t("proAvail.scrollHint", locale)}
      </p>

      {/* Grid */}
      <div className="mt-4 select-none overflow-x-auto">
        <div
          className="grid"
          style={{ gridTemplateColumns: "48px repeat(7, minmax(0, 1fr))", minWidth: 480 }}
        >
          {/* ── Header row: day names + dates ── */}
          <div />
          {days.map((day) => {
            const isToday = day.date === todayStr;
            return (
              <div
                key={day.date}
                className={`flex flex-col items-center gap-0.5 pb-1 ${
                  day.isBeyondHorizon ? "opacity-60" : ""
                }`}
                title={
                  day.isBeyondHorizon
                    ? t("proAvail.beyondHorizonHelp", locale)
                    : undefined
                }
              >
                <div className={`text-xs font-medium ${isToday ? "text-gold-700" : "text-green-700/60"}`}>
                  {t(DAY_KEYS[day.dayOfWeek], locale)}
                </div>
                <div className="text-[10px] text-green-700/40">{formatDateShort(day.date, locale)}</div>
                {day.isBeyondHorizon && (
                  <span className="mt-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-gray-500">
                    {t("proAvail.beyondHorizonBadge", locale)}
                  </span>
                )}
              </div>
            );
          })}

          {/* ── Full day row: label + checkboxes + reason ── */}
          <div className="flex items-start justify-end pr-2 pt-0.5 text-[10px] text-red-400 whitespace-nowrap">
            {t("proAvail.fullDay", locale)}
          </div>
          {days.map((day, dayIdx) => (
            <div key={`fd-${day.date}`} className="flex min-w-0 flex-col items-center gap-0.5 pb-1">
              <input
                type="checkbox"
                checked={fullDayBlocked[dayIdx]}
                onChange={() => toggleFullDay(dayIdx)}
                disabled={day.isPast}
                className="h-3 w-3 rounded border-red-300 text-red-500 focus:ring-red-400 disabled:opacity-30"
              />
              {fullDayBlocked[dayIdx] && (
                <input
                  value={reasons.get(`${dayIdx}`) || ""}
                  onChange={(e) => updateReason(`${dayIdx}`, e.target.value)}
                  placeholder={t("proAvail.reasonPlaceholderShort", locale)}
                  className="w-full min-w-0 rounded border border-red-200 px-1 py-0.5 text-center text-[10px] focus:border-red-400 focus:outline-none"
                />
              )}
            </div>
          ))}

          {/* ── Data rows ── */}
          {Array.from({ length: ROWS }, (_, row) => {
            const isHourBoundary = row % 2 === 0;
            return [
              <div
                key={`label-${row}`}
                className="flex items-center justify-end pr-2 text-[10px] text-green-700/40"
                style={{ height: CELL_H }}
              >
                {isHourBoundary ? rowToTime(row) : ""}
              </div>,
              ...Array.from({ length: 7 }, (_, dayIdx) => {
                const day = days[dayIdx];
                const isFullDay = fullDayBlocked[dayIdx];
                const isCellBlocked = blockedCells[dayIdx][row];
                const isBlocked = isFullDay || isCellBlocked;
                const extraLocs = extraAvailCells[dayIdx][row];
                const hasExtra = extraLocs.size > 0;
                const booking = bookingMap[dayIdx][row];
                const templateLocs = templateAvailMap[dayIdx][row];
                const hasTemplate = templateLocs.size > 0;

                // Base cell style -- always show template availability as background
                const cellStyle: React.CSSProperties = { height: CELL_H };
                let cellClass = `relative border-r border-green-100 transition-colors ${
                  isHourBoundary ? "border-t border-t-green-100" : "border-t border-t-green-50"
                }`;

                if (day.isPast) {
                  cellClass += " bg-gray-50/50";
                } else {
                  cellClass += " cursor-pointer";
                  // Beyond the booking horizon: subtle fade so the pro
                  // can tell at a glance that students can't yet book
                  // here, even though edits are still allowed (task 27,
                  // item 1c).
                  if (day.isBeyondHorizon) {
                    cellStyle.opacity = 0.55;
                  }

                  // Template availability as base background color
                  if (hasTemplate) {
                    if (templateLocs.size === 1) {
                      const locId = [...templateLocs][0];
                      const colorIdx = locationColorMap.get(locId) ?? 0;
                      cellStyle.backgroundColor = LOCATION_COLORS[colorIdx].bgHex + "66";
                    } else {
                      const colors = [...templateLocs].map(
                        (id) => LOCATION_COLORS[locationColorMap.get(id) ?? 0].bgHex,
                      );
                      cellStyle.background = `repeating-linear-gradient(135deg, ${colors[0]}40 0px, ${colors[0]}40 3px, ${colors[1] || colors[0]}40 3px, ${colors[1] || colors[0]}40 6px)`;
                    }
                  } else if (!isBlocked && !hasExtra && !booking) {
                    cellClass += " hover:bg-green-50/50";
                  }
                }

                // Overlay: blocked / extra / booked -- rendered as inner div
                let overlayBg: string | undefined;
                let overlayClass = "";
                if (!day.isPast && isBlocked) {
                  overlayBg = "rgba(239, 68, 68, 0.6)";
                  const aboveBlocked = row > 0 && (isFullDay || blockedCells[dayIdx][row - 1]);
                  const belowBlocked = row < ROWS - 1 && (isFullDay || blockedCells[dayIdx][row + 1]);
                  if (!aboveBlocked) overlayClass += " rounded-t";
                  if (!belowBlocked) overlayClass += " rounded-b";
                } else if (!day.isPast && hasExtra) {
                  if (extraLocs.size === 1) {
                    const locId = [...extraLocs][0];
                    const colorIdx = locationColorMap.get(locId) ?? 0;
                    overlayBg = LOCATION_COLORS[colorIdx].bgHex + "99";
                  } else {
                    const colors = [...extraLocs].map(
                      (id) => LOCATION_COLORS[locationColorMap.get(id) ?? 0].bgHex,
                    );
                    overlayBg = `repeating-linear-gradient(135deg, ${colors[0]}99 0px, ${colors[0]}99 3px, ${colors[1] || colors[0]}99 3px, ${colors[1] || colors[0]}99 6px)`;
                  }
                  const aboveExtra = row > 0 && extraAvailCells[dayIdx][row - 1].size > 0;
                  const belowExtra = row < ROWS - 1 && extraAvailCells[dayIdx][row + 1].size > 0;
                  if (!aboveExtra) overlayClass += " rounded-t";
                  if (!belowExtra) overlayClass += " rounded-b";
                } else if (!day.isPast && booking) {
                  overlayBg = "rgba(20, 184, 166, 0.6)";
                  const aboveBooked = row > 0 && !!bookingMap[dayIdx][row - 1];
                  const belowBooked = row < ROWS - 1 && !!bookingMap[dayIdx][row + 1];
                  if (!aboveBooked) overlayClass += " rounded-t";
                  if (!belowBooked) overlayClass += " rounded-b";
                }

                // Build tooltip
                let title = `${rowToTime(row)}`;
                if (hasTemplate) title += ` - ${cellLocNames(templateLocs)}`;
                if (isBlocked) {
                  const rKey = isFullDay
                    ? `${dayIdx}`
                    : `${dayIdx}-${findBlockStart(blockedCells, dayIdx, row)}`;
                  const reason = reasons.get(rKey);
                  title += ` - ${t("proAvail.blocked", locale)}${reason ? ` -- ${reason}` : ""}`;
                } else if (hasExtra) {
                  title += ` - ${t("proAvail.extraPrefix", locale)}: ${cellLocNames(extraLocs)}`;
                } else if (booking) {
                  title += ` - ${booking}`;
                }

                return (
                  <div
                    key={`${dayIdx}-${row}`}
                    data-cell={`${dayIdx}-${row}`}
                    onPointerDown={(e) =>
                      beginCellPointer(
                        e,
                        () => handlePointerDown(dayIdx, row, e),
                        () => startOverrideDrag(),
                      )
                    }
                    onContextMenu={(e) => e.preventDefault()}
                    onDoubleClick={(e) => handleDoubleClick(dayIdx, row, e)}
                    className={cellClass}
                    style={cellStyle}
                    title={title}
                  >
                    {overlayBg && (
                      <div
                        className={`absolute inset-0${overlayClass}`}
                        style={
                          overlayBg.includes("gradient")
                            ? { background: overlayBg }
                            : { backgroundColor: overlayBg }
                        }
                      />
                    )}
                  </div>
                );
              }),
            ];
          }).flat()}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 border-t border-green-100 pt-3">
        {locations.map((loc) => {
          const colorIdx = locationColorMap.get(loc.id) ?? 0;
          return (
            <div key={loc.id} className="flex items-center gap-1.5">
              <div className="flex gap-px">
                <span
                  className="inline-block h-3 w-2.5 rounded-l-sm"
                  style={{ backgroundColor: LOCATION_COLORS[colorIdx].bgHex + "40" }}
                />
                <span
                  className="inline-block h-3 w-2.5 rounded-r-sm"
                  style={{ backgroundColor: LOCATION_COLORS[colorIdx].bgHex + "99" }}
                />
              </div>
              <span className="text-[10px] text-green-700/60">{loc.locationName}</span>
            </div>
          );
        })}
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-5 rounded-sm" style={{ backgroundColor: "rgba(20, 184, 166, 0.55)" }} />
          <span className="text-[10px] text-green-700/60">{t("proAvail.booked", locale)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-5 rounded-sm" style={{ backgroundColor: "rgba(239, 68, 68, 0.45)" }} />
          <span className="text-[10px] text-green-700/60">{t("proAvail.blocked", locale)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="h-3 w-5 rounded-sm"
            style={{ backgroundColor: "#e5e7eb", opacity: 0.55 }}
          />
          <span className="text-[10px] text-green-700/60">
            {t("proAvail.beyondHorizonLegend", locale)}
          </span>
        </div>
      </div>

      {/* Reason popover (double-click) */}
      {editPopover && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setEditPopover(null)} />
          <div
            data-reason-popover
            className="fixed z-50 rounded-lg border border-green-200 bg-white p-3 shadow-xl"
            style={{ left: Math.max(16, editPopover.x - 100), top: editPopover.y + 12 }}
          >
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-green-700/60">
              {t("proAvail.reasonOptional", locale)}
            </label>
            <div className="flex gap-1.5">
              <input
                value={reasons.get(editPopover.key) || ""}
                onChange={(e) => updateReason(editPopover.key, e.target.value)}
                placeholder={t("proAvail.reasonPlaceholder", locale)}
                className="w-40 rounded border border-green-200 px-2 py-1 text-xs focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") setEditPopover(null);
                }}
              />
              <button
                onClick={() => setEditPopover(null)}
                className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200"
              >
                {t("proAvail.ok", locale)}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
