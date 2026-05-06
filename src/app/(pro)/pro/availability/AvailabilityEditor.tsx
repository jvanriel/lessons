"use client";

import { useState, useCallback, useRef, useMemo, useEffect, type ReactNode } from "react";
import type {
  SerializedAvailability,
  SerializedOverride,
  SerializedProLocationWithName,
  SerializedBooking,
  SerializedProfileSettings,
  SerializedSchedulePeriod,
} from "./actions";
import { saveSchedulePeriods, saveWeekOverrides } from "./actions";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";
import { formatDate as formatDateLocale } from "@/lib/format-date";
import { addDaysToDateString } from "@/lib/local-date";

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
const CELL_H_TOUCH = 52;

/**
 * Pick the row height based on the primary pointer. Touch devices get
 * tall cells so fingers can tap individual half-hour slots — including
 * phones in landscape orientation (where viewport width is wide but
 * the user is still tapping with a thumb). Mouse users stay compact
 * so a whole week fits on screen.
 */
function useCellHeight() {
  const [cellH, setCellH] = useState(CELL_H_DESKTOP);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const apply = (m: boolean) => setCellH(m ? CELL_H_TOUCH : CELL_H_DESKTOP);
    apply(mq.matches);
    function handler(e: MediaQueryListEvent) { apply(e.matches); }
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

/**
 * One schedule period in the editor. The "Always" period has both
 * date bounds set to null and is always present (it represents
 * unbounded weekly availability — the historical default).
 */
interface Period {
  /** Stable client-side id for React keys + dirty tracking. */
  id: string;
  validFrom: string | null;
  validUntil: string | null;
  grid: LocationGrid;
}

function emptyGrid(): LocationGrid {
  return Array.from({ length: 7 }, () =>
    Array.from({ length: ROWS }, () => new Set<number>()),
  );
}

function cloneGrid(g: LocationGrid): LocationGrid {
  return g.map((col) => col.map((cell) => new Set(cell)));
}

function availabilityToLocationGrid(slots: SerializedAvailability[]): LocationGrid {
  const grid: LocationGrid = emptyGrid();
  for (const s of slots) {
    const startRow = timeToRow(s.startTime);
    const endRow = timeToRow(s.endTime);
    for (let r = startRow; r < endRow; r++) {
      grid[s.dayOfWeek][r].add(s.proLocationId);
    }
  }
  return grid;
}

/**
 * Build editor-side periods from server data (task 78). Period defs
 * come from `pro_schedule_periods` (so empty / vacation periods
 * persist); slot rows from `pro_availability` are attached to their
 * matching period by `(validFrom, validUntil)` tuple. With the new
 * exclusive-timeline model, periods don't overlap and the
 * chronologically first may have `validFrom = null`, the last may
 * have `validUntil = null`. A pro with no period defs yet gets a
 * single empty unbounded "Always" period as a starting point — it
 * persists on the next save.
 */
function buildPeriods(
  periodDefs: SerializedSchedulePeriod[] | undefined,
  slots: SerializedAvailability[] | undefined,
): Period[] {
  const safeDefs = periodDefs ?? [];
  const safeSlots = slots ?? [];
  const slotsByKey = new Map<string, SerializedAvailability[]>();
  for (const s of safeSlots) {
    const key = `${s.validFrom ?? ""}|${s.validUntil ?? ""}`;
    const arr = slotsByKey.get(key) ?? [];
    arr.push(s);
    slotsByKey.set(key, arr);
  }
  const periods: Period[] = safeDefs.map((d) => {
    const key = `${d.validFrom ?? ""}|${d.validUntil ?? ""}`;
    const matched = slotsByKey.get(key) ?? [];
    return {
      id: `p${d.id}`,
      validFrom: d.validFrom,
      validUntil: d.validUntil,
      grid: availabilityToLocationGrid(matched),
    };
  });
  if (periods.length === 0) {
    periods.push({
      id: "p-default",
      validFrom: null,
      validUntil: null,
      grid: emptyGrid(),
    });
  }
  // Sort by validFrom ASC; null-from goes first (chronologically
  // earliest), null-until is implicitly the last position.
  periods.sort((a, b) => {
    if (a.validFrom === null && b.validFrom !== null) return -1;
    if (b.validFrom === null && a.validFrom !== null) return 1;
    return (a.validFrom ?? "").localeCompare(b.validFrom ?? "");
  });
  return periods;
}

/** Project the union of every matching period's grid for a given date. */
function projectGridForDate(
  periods: Period[],
  dateStr: string,
): LocationGrid {
  const out = emptyGrid();
  for (const p of periods) {
    if (p.validFrom && dateStr < p.validFrom) continue;
    if (p.validUntil && dateStr > p.validUntil) continue;
    for (let day = 0; day < 7; day++) {
      for (let row = 0; row < ROWS; row++) {
        for (const id of p.grid[day][row]) out[day][row].add(id);
      }
    }
  }
  return out;
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

// ─── Landscape prompt ────────────────────────────────

/**
 * Dialog shown on mobile portrait telling the pro to rotate to
 * landscape for a better grid-editing experience. Cancel dismisses
 * for the session; the dialog also auto-hides as soon as the user
 * rotates (the portrait media query stops matching).
 */
function LandscapeRotatePrompt({ locale }: { locale: Locale }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      className="fixed inset-0 z-40 hidden items-end justify-center bg-black/40 p-4 portrait:max-md:flex"
      onClick={() => setDismissed(true)}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-green-200 bg-cream">
          <svg
            className="h-7 w-7 text-green-700"
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
        <h2 className="text-center font-display text-xl font-semibold text-green-900">
          {t("proAvail.rotateLandscape.title", locale)}
        </h2>
        <p className="mt-2 text-center text-sm text-green-700">
          {t("proAvail.rotateLandscape.body", locale)}
        </p>
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-md border border-green-200 px-6 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-50"
          >
            {t("proAvail.rotateLandscape.cancel", locale)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Touch paint helpers ─────────────────────────────

const LONG_PRESS_MS = 350;
const LONG_PRESS_MOVE_TOLERANCE = 10;

/**
 * Gates a cell paint operation by pointer type:
 *
 *   - Mouse / pen → `fire` runs immediately AND `startDrag` is invoked,
 *     so a desktop click toggles the cell and a held-down drag paints
 *     the cells the cursor crosses.
 *   - Touch → `fire` only runs after the finger stays put for ~350ms
 *     (long-press, with a haptic buzz on supported devices). A short
 *     tap does nothing — leaves the page free to scroll. `startDrag`
 *     is NOT called on touch: drag-paint is desktop-only by design
 *     (task 75). Mobile users toggle one cell per long-press.
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
    // Intentionally NOT calling startDrag on touch — drag-paint is
    // desktop-only. Long-press toggles a single cell and stops.
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
  schedulePeriods: SerializedSchedulePeriod[];
  overrides: SerializedOverride[];
  bookings: SerializedBooking[];
  profileSettings: SerializedProfileSettings;
  locale: Locale;
}

export default function AvailabilityEditor({
  locations,
  availability,
  schedulePeriods,
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

  // Multi-period state (tasks 77, 78). Built from period defs +
  // matching slot rows; sorted chronologically.
  const [periods, setPeriods] = useState<Period[]>(() =>
    buildPeriods(schedulePeriods, availability),
  );
  const [activePeriodId, setActivePeriodId] = useState<string>(
    () => buildPeriods(schedulePeriods, availability)[0]?.id ?? "p1",
  );

  // Reset when server data changes. Compare by serialized content of
  // BOTH the period defs and the slot rows — revalidatePath
  // re-supplies fresh references after every save, so a reference
  // check would needlessly clobber client-only state.
  const prevAvailRef = useRef<string>(
    JSON.stringify({ schedulePeriods, availability }),
  );
  // Mirror periods + active id in refs so the reset effect can read
  // the latest values without listing them as deps (which would make
  // the effect re-run on every paint).
  const periodsRef = useRef(periods);
  const activePeriodIdRef = useRef(activePeriodId);
  periodsRef.current = periods;
  activePeriodIdRef.current = activePeriodId;
  useEffect(() => {
    const serialized = JSON.stringify({ schedulePeriods, availability });
    if (prevAvailRef.current === serialized) return;
    prevAvailRef.current = serialized;
    const next = buildPeriods(schedulePeriods, availability);
    // Preserve the active tab across resets by matching the (validFrom,
    // validUntil) pair, not the client-side id. `buildPeriods`
    // generates ids from server `pro_schedule_periods.id`, while
    // `addPeriod` uses `Date.now()`-based ids — a plain id lookup
    // would fall through to `next[0]` after every save, which is the
    // "tab jumped back to the first period" symptom.
    const currentActive = periodsRef.current.find(
      (p) => p.id === activePeriodIdRef.current,
    );
    setPeriods(next);
    setActivePeriodId(() => {
      if (currentActive) {
        const matched = next.find(
          (p) =>
            p.validFrom === currentActive.validFrom &&
            p.validUntil === currentActive.validUntil,
        );
        if (matched) return matched.id;
      }
      return next[0]?.id ?? "p1";
    });
  }, [availability, schedulePeriods]);

  const activePeriod = periods.find((p) => p.id === activePeriodId) ?? periods[0];

  function updatePeriodGrid(periodId: string, grid: LocationGrid) {
    setPeriods((prev) =>
      prev.map((p) => (p.id === periodId ? { ...p, grid } : p)),
    );
  }

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
      <LandscapeRotatePrompt locale={locale} />

      {/* Section 1: Schedule periods (tab strip + active grid) */}
      <SchedulePeriodsSection
        periods={periods}
        activePeriodId={activePeriodId}
        onActivePeriodChange={setActivePeriodId}
        onPeriodsChange={setPeriods}
        locations={locations}
        locationColorMap={locationColorMap}
        activeLocationId={activeLocationId}
        onActiveLocationChange={setActiveLocationId}
        onGridChange={(grid) => activePeriod && updatePeriodGrid(activePeriod.id, grid)}
        locale={locale}
      />

      {/* Section 2: Preview / blocking grid — shows the union of all
          periods that match the visible week. */}
      <PreviewBlockingGrid
        locations={locations}
        locationColorMap={locationColorMap}
        periods={periods}
        overrides={overrides}
        bookings={bookings}
        profileSettings={profileSettings}
        locale={locale}
      />
    </div>
  );
}

// ─── Schedule Periods Section ────────────────────────

function SchedulePeriodsSection({
  periods,
  activePeriodId,
  onActivePeriodChange,
  onPeriodsChange,
  locations,
  locationColorMap,
  activeLocationId,
  onActiveLocationChange,
  onGridChange,
  locale,
}: {
  periods: Period[];
  activePeriodId: string;
  onActivePeriodChange: (id: string) => void;
  onPeriodsChange: (next: Period[]) => void;
  locations: SerializedProLocationWithName[];
  locationColorMap: Map<number, number>;
  activeLocationId: number;
  onActiveLocationChange: (id: number) => void;
  onGridChange: (grid: LocationGrid) => void;
  locale: Locale;
}) {
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingDatesFor, setEditingDatesFor] = useState<string | null>(null);
  // Pending duplicate held only in the dialog until the user picks
  // dates and clicks Save. Committing immediately (the previous
  // behavior) caused the auto-save to fire with two periods sharing
  // the source's dates → server returned an overlap error.
  const [pendingDuplicate, setPendingDuplicate] = useState<{
    grid: LocationGrid;
    defaultFrom: string;
    defaultUntil: string;
  } | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  // When the user removes the chronologically last period, the dialog
  // offers a checkbox to also clear the new-last period's
  // `validUntil` (extend to "open end"). Tracked separately so the
  // toggle resets between opens.
  const [pendingExtendPrevious, setPendingExtendPrevious] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Tracks the JSON of the most recently dispatched save payload.
  // Why: `saveSchedulePeriods` calls `revalidatePath`, which causes the
  // server to re-supply `availability` with a new array reference even
  // when the content is identical. The parent then rebuilds `periods`
  // (also a new reference). A reference-only check would treat that as
  // a fresh edit and re-save — saving forever in a loop. Comparing the
  // serialized payload breaks the cycle.
  const lastSavedRef = useRef<string | null>(null);

  const activePeriod =
    periods.find((p) => p.id === activePeriodId) ?? periods[0];

  // Auto-save: on any change to `periods`, debounce 2s then push the
  // whole set via `saveSchedulePeriods`. First render primes the ref
  // with the server-loaded state so we don't immediately save it back.
  useEffect(() => {
    // Task 78: empty periods (no slots painted) now persist as
    // vacation / closed dates via `pro_schedule_periods`, so we no
    // longer filter them out of the save payload.
    const payload = {
      periods: periods.map((p) => ({
        validFrom: p.validFrom,
        validUntil: p.validUntil,
        slots: locations.flatMap((loc) =>
          gridToSlotsForLocation(p.grid, loc.id).map((s) => ({
            proLocationId: loc.id,
            ...s,
          })),
        ),
      })),
    };
    const serialized = JSON.stringify(payload);

    if (lastSavedRef.current === null) {
      lastSavedRef.current = serialized;
      return;
    }
    if (lastSavedRef.current === serialized) return;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSaveStatus("saving");
      setSaveError(null);
      // Mark this snapshot as "the one we're persisting" before the
      // request goes out, so revalidate-triggered re-renders with the
      // same content don't schedule a duplicate save.
      lastSavedRef.current = serialized;
      (async () => {
        const result = await saveSchedulePeriods(payload);
        if (result.error) {
          setSaveStatus("error");
          setSaveError(result.error);
        } else {
          setSaveStatus("saved");
          setTimeout(
            () => setSaveStatus((s) => (s === "saved" ? "idle" : s)),
            2000,
          );
        }
      })();
    }, 2000);
    return () => clearTimeout(debounceRef.current);
  }, [periods, locations]);

  function addPeriod(validFrom: string, validUntil: string) {
    const id = `p${Date.now()}`;
    const inserted: Period = {
      id,
      validFrom,
      validUntil,
      grid: emptyGrid(),
    };
    onPeriodsChange(insertWithSplit(periods, inserted).sort(sortPeriods));
    onActivePeriodChange(id);
    setShowAdd(false);
  }

  function duplicateActivePeriod() {
    if (!activePeriod) return;
    // Default the new range to the day after the source ends (so the
    // two are contiguous, not overlapping) and 30 days long. If the
    // source is unbounded, anchor to today instead.
    const fromAnchor = activePeriod.validUntil
      ? addDaysToDateString(activePeriod.validUntil, 1)
      : toLocalDateStr(new Date());
    const defaultUntil = addDaysToDateString(fromAnchor, 30);
    setPendingDuplicate({
      grid: cloneGrid(activePeriod.grid),
      defaultFrom: fromAnchor,
      defaultUntil,
    });
  }

  function commitDuplicate(validFrom: string, validUntil: string) {
    if (!pendingDuplicate) return;
    const id = `p${Date.now()}`;
    const inserted: Period = {
      id,
      validFrom,
      validUntil,
      grid: pendingDuplicate.grid,
    };
    onPeriodsChange(insertWithSplit(periods, inserted).sort(sortPeriods));
    onActivePeriodChange(id);
    setPendingDuplicate(null);
  }

  function removePeriod(id: string) {
    // The unbounded "Always" period is the editor's fallback grid and
    // cannot be removed. Defensive guard — the UI also hides the
    // button for it.
    const target = periods.find((p) => p.id === id);
    if (target && target.validFrom === null && target.validUntil === null) {
      return;
    }
    setPendingRemoveId(id);
    setPendingExtendPrevious(false);
  }

  function confirmRemovePeriod() {
    const id = pendingRemoveId;
    const extendPrev = pendingExtendPrevious;
    setPendingRemoveId(null);
    setPendingExtendPrevious(false);
    if (!id) return;
    const idx = periods.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const wasLast = idx === periods.length - 1 && periods.length > 1;

    let next = periods.filter((p) => p.id !== id);
    // If the user removed the chronologically last period and ticked
    // the "extend previous" toggle, clear the new-last's validUntil
    // so the timeline keeps an open end (no closing date).
    if (extendPrev && wasLast && next.length > 0) {
      const newLastIdx = next.length - 1;
      next = next.map((p, i) =>
        i === newLastIdx ? { ...p, validUntil: null } : p,
      );
    }
    // Always keep at least one period (the unbounded "Always") so the
    // grid has somewhere to render. If the user removes the last
    // period, recreate an empty unbounded one.
    if (next.length === 0) {
      next.push({ id: `p${Date.now()}`, validFrom: null, validUntil: null, grid: emptyGrid() });
    }
    onPeriodsChange(next);
    if (activePeriodId === id) {
      onActivePeriodChange(next[0].id);
    }
  }

  function updatePeriodDates(
    id: string,
    validFrom: string | null,
    validUntil: string | null,
  ) {
    onPeriodsChange(
      periods
        .map((p) =>
          p.id === id ? { ...p, validFrom, validUntil } : p,
        )
        .sort(sortPeriods),
    );
    setEditingDatesFor(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-green-800">
          {t("proAvail.schedulePeriods", locale)}:
        </span>
        {periods.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onActivePeriodChange(p.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              p.id === activePeriodId
                ? "bg-green-700 text-white"
                : "border border-green-200 bg-white text-green-700 hover:border-green-400"
            }`}
            title={periodLabel(p, locale)}
          >
            {periodLabel(p, locale)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="rounded-full border border-dashed border-green-300 px-3 py-1 text-xs font-medium text-green-600 hover:border-gold-500 hover:text-gold-600"
        >
          + {t("proAvail.addPeriod", locale)}
        </button>
        <div className="ml-auto flex items-center gap-3">
          {saveStatus === "saving" && (
            <span className="text-xs text-green-700/50 animate-pulse">{t("proAvail.saving", locale)}</span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs text-green-600">{t("proAvail.saved", locale)}</span>
          )}
          {saveStatus === "error" && saveError && (
            <span className="text-xs text-red-600">{saveError}</span>
          )}
        </div>
      </div>

      {activePeriod && (
        <div className="space-y-3 rounded-xl border border-green-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex-1">
              <p className="text-sm text-green-700">
                {periodDescription(activePeriod, locale)}
              </p>
              {/* Hint for the unbounded "Always" tab when other periods
                  exist — explains how to "reset" to a single-schedule
                  setup. (task 77 item D-ii) */}
              {activePeriod.validFrom === null &&
                activePeriod.validUntil === null &&
                periods.some(
                  (p) => p.validFrom !== null || p.validUntil !== null,
                ) && (
                  <p className="mt-1 text-[11px] italic text-green-500">
                    {t("proAvail.alwaysResetHint", locale)}
                  </p>
                )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setEditingDatesFor(activePeriod.id)}
                className="text-green-700 underline-offset-2 hover:underline"
              >
                {t("proAvail.editDates", locale)}
              </button>
              <span className="text-green-300">•</span>
              <button
                type="button"
                onClick={duplicateActivePeriod}
                className="text-green-700 underline-offset-2 hover:underline"
              >
                {t("proAvail.duplicate", locale)}
              </button>
              {periods.length > 1 &&
                !(activePeriod.validFrom === null && activePeriod.validUntil === null) && (
                  <>
                    <span className="text-green-300">•</span>
                    <button
                      type="button"
                      onClick={() => removePeriod(activePeriod.id)}
                      className="text-red-500 underline-offset-2 hover:underline hover:text-red-600"
                    >
                      {t("proAvail.removePeriod", locale)}
                    </button>
                  </>
                )}
            </div>
          </div>

          <WeeklyTemplateGrid
            locations={locations}
            locationColorMap={locationColorMap}
            activeLocationId={activeLocationId}
            onActiveLocationChange={onActiveLocationChange}
            grid={activePeriod.grid}
            onGridChange={onGridChange}
            locale={locale}
          />
        </div>
      )}

      {showAdd && (() => {
        // Anchor on the latest existing bounded period's end + 1 day,
        // or today if no bounded periods exist yet. Span 30 days.
        const latestUntil = periods
          .map((p) => p.validUntil)
          .filter((d): d is string => !!d)
          .sort()
          .at(-1);
        const fromAnchor = latestUntil
          ? addDaysToDateString(latestUntil, 1)
          : toLocalDateStr(new Date());
        const untilAnchor = addDaysToDateString(fromAnchor, 30);
        return (
          <PeriodDatesDialog
            mode="add"
            initialFrom={fromAnchor}
            initialUntil={untilAnchor}
            locale={locale}
            existingBoundedRanges={periods
              .filter((p) => p.validFrom && p.validUntil)
              .map((p) => ({ id: p.id, from: p.validFrom!, until: p.validUntil! }))}
            onSubmit={addPeriod}
            onClose={() => setShowAdd(false)}
          />
        );
      })()}
      {editingDatesFor !== null && (() => {
        const idx = periods.findIndex((x) => x.id === editingDatesFor);
        const p = periods[idx];
        if (!p) return null;
        return (
          <PeriodDatesDialog
            mode="edit"
            initialFrom={p.validFrom}
            initialUntil={p.validUntil}
            allowOpenStart={idx === 0}
            allowOpenEnd={idx === periods.length - 1}
            locale={locale}
            existingBoundedRanges={periods
              .filter((x) => x.id !== p.id && x.validFrom && x.validUntil)
              .map((x) => ({
                id: x.id,
                from: x.validFrom!,
                until: x.validUntil!,
              }))}
            onSubmit={(from, until) =>
              updatePeriodDates(p.id, from || null, until || null)
            }
            onClose={() => setEditingDatesFor(null)}
          />
        );
      })()}
      {pendingDuplicate !== null && (
        <PeriodDatesDialog
          mode="add"
          initialFrom={pendingDuplicate.defaultFrom}
          initialUntil={pendingDuplicate.defaultUntil}
          locale={locale}
          existingBoundedRanges={periods
            .filter((p) => p.validFrom && p.validUntil)
            .map((p) => ({
              id: p.id,
              from: p.validFrom!,
              until: p.validUntil!,
            }))}
          onSubmit={commitDuplicate}
          onClose={() => setPendingDuplicate(null)}
        />
      )}
      {pendingRemoveId !== null && (() => {
        const idx = periods.findIndex((p) => p.id === pendingRemoveId);
        const target = periods[idx];
        const isLastWithPrevious =
          idx === periods.length - 1 && periods.length > 1;
        return (
          <ConfirmDialog
            title={t("proAvail.removePeriod", locale)}
            message={t("proAvail.removePeriodConfirm", locale)}
            detail={target ? periodLabel(target, locale) : undefined}
            extra={
              isLastWithPrevious ? (
                <label className="mt-3 flex items-start gap-2 text-xs text-green-700">
                  <input
                    type="checkbox"
                    checked={pendingExtendPrevious}
                    onChange={(e) => setPendingExtendPrevious(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-green-300 text-green-700"
                  />
                  <span>
                    {t("proAvail.extendPreviousAfterRemove", locale)}
                  </span>
                </label>
              ) : undefined
            }
            confirmLabel={t("proAvail.removePeriod", locale)}
            cancelLabel={t("proAvail.cancel", locale)}
            onConfirm={confirmRemovePeriod}
            onClose={() => {
              setPendingRemoveId(null);
              setPendingExtendPrevious(false);
            }}
            danger
          />
        );
      })()}
    </div>
  );
}

function ConfirmDialog({
  title,
  message,
  detail,
  extra,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  danger = false,
}: {
  title: string;
  message: string;
  detail?: string;
  extra?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-4 w-full max-w-sm rounded-xl border border-green-200 bg-white p-6 shadow-2xl">
        <h3 className="font-display text-lg font-semibold text-green-900">
          {title}
        </h3>
        {detail && (
          <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-900">
            {detail}
          </p>
        )}
        <p className="mt-3 text-sm text-green-800">{message}</p>
        {extra}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border border-green-200 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              danger
                ? "flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
                : "flex-1 rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function sortPeriods(a: Period, b: Period): number {
  if (a.validFrom === null && b.validFrom !== null) return -1;
  if (b.validFrom === null && a.validFrom !== null) return 1;
  return (a.validFrom ?? "").localeCompare(b.validFrom ?? "");
}

/**
 * Insert a new period into an exclusive timeline (task 78). If the
 * new range falls entirely inside an existing period, that period is
 * split: a "before" segment (its grid cloned) is created if there's
 * room before the new range, and an "after" segment likewise. This
 * lets the user add a bounded period inside an unbounded "Altijd"
 * (or another bounded period — e.g. a vacation inside summer) without
 * losing the surrounding schedule.
 *
 * If the new range doesn't fall inside any existing period (it sits
 * in a gap, or partially overlaps a bounded period), it's appended
 * as-is. The server will still validate non-overlap and surface an
 * error for the partial-overlap case — auto-resolving that would be
 * surprising.
 */
function insertWithSplit(existing: Period[], inserted: Period): Period[] {
  const containing = existing.find((p) => {
    if (p.id === inserted.id) return false;
    if (inserted.validFrom === null || inserted.validUntil === null) {
      return false;
    }
    const fromOk = p.validFrom === null || p.validFrom <= inserted.validFrom;
    const untilOk = p.validUntil === null || p.validUntil >= inserted.validUntil;
    return fromOk && untilOk;
  });
  if (!containing || inserted.validFrom === null || inserted.validUntil === null) {
    return [...existing, inserted];
  }
  const beforeFrom = containing.validFrom;
  const beforeUntil = addDaysToDateString(inserted.validFrom, -1);
  const afterFrom = addDaysToDateString(inserted.validUntil, 1);
  const afterUntil = containing.validUntil;
  const out = existing.filter((p) => p.id !== containing.id);
  if (beforeFrom === null || beforeFrom <= beforeUntil) {
    out.push({
      id: `p${Date.now()}b`,
      validFrom: beforeFrom,
      validUntil: beforeUntil,
      grid: cloneGrid(containing.grid),
    });
  }
  out.push(inserted);
  if (afterUntil === null || afterFrom <= afterUntil) {
    out.push({
      id: `p${Date.now()}a`,
      validFrom: afterFrom,
      validUntil: afterUntil,
      grid: cloneGrid(containing.grid),
    });
  }
  return out;
}

function periodLabel(p: Period, locale: Locale): string {
  if (!p.validFrom && !p.validUntil) return t("proAvail.alwaysPeriod", locale);
  const from = p.validFrom ? formatDateShort(p.validFrom, locale) : "…";
  const until = p.validUntil ? formatDateShort(p.validUntil, locale) : "…";
  return `${from} – ${until}`;
}

function periodDescription(p: Period, locale: Locale): string {
  if (!p.validFrom && !p.validUntil)
    return t("proAvail.alwaysPeriodDesc", locale);
  return t("proAvail.periodActiveBetween", locale)
    .replace("{from}", p.validFrom ?? "…")
    .replace("{until}", p.validUntil ?? "…");
}

function PeriodDatesDialog({
  mode,
  initialFrom,
  initialUntil,
  existingBoundedRanges,
  locale,
  onSubmit,
  onClose,
  allowOpenStart = false,
  allowOpenEnd = false,
}: {
  mode: "add" | "edit";
  initialFrom?: string | null;
  initialUntil?: string | null;
  existingBoundedRanges: Array<{ id: string; from: string; until: string }>;
  locale: Locale;
  // Sends `""` (empty) for boundary fields the user wants to clear.
  // Callers convert that to `null` before persisting.
  onSubmit: (from: string, until: string) => void;
  onClose: () => void;
  // Task 78 — only the chronologically first period may have null
  // `validFrom` and only the last may have null `validUntil`. The
  // editor passes `true` for the field whose null state is allowed.
  allowOpenStart?: boolean;
  allowOpenEnd?: boolean;
}) {
  const [from, setFrom] = useState(initialFrom ?? "");
  const [until, setUntil] = useState(initialUntil ?? "");
  const [openStart, setOpenStart] = useState(
    allowOpenStart && initialFrom === null,
  );
  const [openEnd, setOpenEnd] = useState(
    allowOpenEnd && initialUntil === null,
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Inline validation — recomputed each render. Shown below the fields
  // and disables Save while present, so users see the issue as they
  // type/change a date instead of only at submit time. (task 77)
  const inlineError = (() => {
    const fromValue = openStart ? "" : from;
    const untilValue = openEnd ? "" : until;
    if (fromValue && untilValue && fromValue > untilValue) {
      return t("proAvail.periodFromBeforeUntil", locale);
    }
    if (fromValue && untilValue) {
      for (const r of existingBoundedRanges) {
        if (fromValue <= r.until && r.from <= untilValue) {
          return t("proAvail.periodOverlap", locale);
        }
      }
    }
    return null;
  })();

  function submit() {
    setSubmitError(null);
    const fromValue = openStart ? "" : from;
    const untilValue = openEnd ? "" : until;
    if ((!fromValue && !openStart) || (!untilValue && !openEnd)) {
      setSubmitError(t("proAvail.periodDatesRequired", locale));
      return;
    }
    // The inline error catches end-before-start and overlap; if it's
    // present we shouldn't reach submit (button is disabled), but
    // double-check defensively.
    if (inlineError) {
      setSubmitError(inlineError);
      return;
    }
    onSubmit(fromValue, untilValue);
  }

  const error = inlineError ?? submitError;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-4 w-full max-w-sm rounded-xl border border-green-200 bg-white p-6 shadow-2xl">
        <h3 className="font-display text-lg font-semibold text-green-900">
          {mode === "add"
            ? t("proAvail.addPeriod", locale)
            : t("proAvail.editPeriodDates", locale)}
        </h3>
        <div className="mt-4 grid gap-3">
          <label className="block text-xs font-medium text-green-700">
            {t("proAvail.periodFrom", locale)}
            <input
              type="date"
              value={openStart ? "" : from}
              disabled={openStart}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400 disabled:bg-green-50 disabled:text-green-400"
            />
            {allowOpenStart && (
              <span className="mt-1 flex items-center gap-2 text-[11px] font-normal text-green-600">
                <input
                  type="checkbox"
                  checked={openStart}
                  onChange={(e) => setOpenStart(e.target.checked)}
                  className="h-3 w-3 rounded border-green-300 text-green-700"
                />
                {t("proAvail.openStart", locale)}
              </span>
            )}
          </label>
          <label className="block text-xs font-medium text-green-700">
            {t("proAvail.periodUntil", locale)}
            <input
              type="date"
              value={openEnd ? "" : until}
              disabled={openEnd}
              onChange={(e) => setUntil(e.target.value)}
              className="mt-1 block w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400 disabled:bg-green-50 disabled:text-green-400"
            />
            {allowOpenEnd && (
              <span className="mt-1 flex items-center gap-2 text-[11px] font-normal text-green-600">
                <input
                  type="checkbox"
                  checked={openEnd}
                  onChange={(e) => setOpenEnd(e.target.checked)}
                  className="h-3 w-3 rounded border-green-300 text-green-700"
                />
                {t("proAvail.openEnd", locale)}
              </span>
            )}
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border border-green-200 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
          >
            {t("proAvail.cancel", locale)}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={Boolean(inlineError)}
            className="flex-1 rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-green-300"
          >
            {t("proAvail.save", locale)}
          </button>
        </div>
      </div>
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
  // Auto-save now lives on the parent (`SchedulePeriodsSection`) so the
  // grid component stays a controlled view: edits go up via
  // `onGridChange`, the parent debounces and saves the full set of
  // periods. The grid no longer needs `dirtyLocations` or its own
  // save-status indicator.

  // Mirror the controlled `grid` prop in a ref so drag-paint reads the
  // latest state on every pointermove. Without this, the move handler
  // captures `grid` from the render where the drag started and each
  // step paints from that stale grid — so the drag ends up persisting
  // only the last cell.
  const gridRef = useRef(grid);
  gridRef.current = grid;

  const updateCell = useCallback((day: number, row: number, adding: boolean) => {
    onGridChange(
      gridRef.current.map((col, colIdx) =>
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
  }, [activeLocationId, onGridChange]);

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
    // Build the new grid in one pass and push it via `onGridChange`
    // once. Iterating `updateCell` per cell would lose every
    // intermediate update — `onGridChange` flows up to a parent
    // setState, and synchronous loops in the same handler all read
    // the same `gridRef.current` snapshot, so only the last cell
    // would survive. That was the "shift-klik werkt niet" symptom
    // from Nadine's 2026-04-28 retest of task 27 (1d).
    onGridChange(
      gridRef.current.map((col, colIdx) =>
        col.map((cell, rowIdx) => {
          if (colIdx < dMin || colIdx > dMax) return new Set(cell);
          if (rowIdx < rMin || rowIdx > rMax) return new Set(cell);
          const next = new Set(cell);
          if (adding) next.add(activeLocationId);
          else next.delete(activeLocationId);
          return next;
        }),
      ),
    );
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

  // Drag painting — desktop only. After a mouse-down, attach window
  // listeners so moving across adjacent cells paints them with the
  // anchor's value. Touch never calls this (see `beginCellPointer`).
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
        {/* Save status indicator now lives on the period tab strip
            (parent component) so it covers all periods at once. */}
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
  periods,
  overrides,
  bookings,
  profileSettings,
  locale,
}: {
  locations: SerializedProLocationWithName[];
  locationColorMap: Map<number, number>;
  /** All schedule periods. The preview unions every matching period
   *  per visible day to compute the projected weekly template. */
  periods: Period[];
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
    // For each visible day, project the union of every period whose
    // (validFrom, validUntil) range covers that date. Coexistence
    // semantics — same as the slot engine in `lesson-slots.ts`.
    const aMap: Set<number>[][] = Array.from({ length: 7 }, (_, dayIdx) => {
      const projected = projectGridForDate(periods, days[dayIdx].date);
      return Array.from(
        { length: ROWS },
        (_, row) => new Set(projected[days[dayIdx].dayOfWeek][row]),
      );
    });

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
  }, [days, periods, bookings, locale]);

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

  // Drag painting — desktop only (see `beginCellPointer`). Touch never
  // calls this; mobile long-press toggles one cell at a time.
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
          {/* Surface the pro's own booking horizon so they know which
              window of dates students will see in their booking
              calendar. (task 77 item B) */}
          <p className="mt-1 text-[11px] italic text-green-500">
            {t("publicBook.bookingsOpenThrough", locale).replace(
              "{date}",
              formatDateLocale(
                (() => {
                  const d = new Date();
                  d.setDate(d.getDate() + profileSettings.bookingHorizon);
                  return d;
                })(),
                locale,
                { day: "numeric", month: "long", year: "numeric" },
              ),
            )}
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
