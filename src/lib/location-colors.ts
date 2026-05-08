/**
 * Distinct color palette for up to 6 pro locations. Used by both the
 * availability editor (`/pro/availability`) and the bookings calendar
 * (`/pro/bookings`) so the same club gets the same colour in both
 * places — pros with multiple clubs can scan either grid and know at
 * a glance which sessions belong where.
 *
 * The mapping is deterministic per pro: locations sorted by `sortOrder`
 * receive colour 0, 1, 2, … modulo 6. Both callsites build their map
 * from `buildLocationColorMap` against an identically-ordered list so
 * the assignment never drifts.
 */
export const LOCATION_COLORS = [
  { bg: "bg-green-500/80", bgHex: "#22c55e", text: "text-green-700", light: "bg-green-100", border: "border-green-500" },
  { bg: "bg-blue-500/80", bgHex: "#3b82f6", text: "text-blue-700", light: "bg-blue-100", border: "border-blue-500" },
  { bg: "bg-amber-500/80", bgHex: "#f59e0b", text: "text-amber-700", light: "bg-amber-100", border: "border-amber-500" },
  { bg: "bg-purple-500/80", bgHex: "#a855f7", text: "text-purple-700", light: "bg-purple-100", border: "border-purple-500" },
  { bg: "bg-rose-500/80", bgHex: "#f43f5e", text: "text-rose-700", light: "bg-rose-100", border: "border-rose-500" },
  { bg: "bg-cyan-500/80", bgHex: "#06b6d4", text: "text-cyan-700", light: "bg-cyan-100", border: "border-cyan-500" },
];

export function buildLocationColorMap(
  locations: { id: number }[],
): Map<number, number> {
  const map = new Map<number, number>();
  locations.forEach((loc, i) => map.set(loc.id, i % LOCATION_COLORS.length));
  return map;
}
