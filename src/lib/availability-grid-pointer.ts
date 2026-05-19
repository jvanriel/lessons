/**
 * Pointer-event helpers for the pro-availability grid (task 75).
 *
 * Both grids on /pro/availability (the weekly werkrooster and the
 * rooster-en-blokken overrides view) need the same painting rules:
 *
 *   - Mouse / pen → click toggles, drag paints, shift+click selects.
 *   - Touch       → long-press (~350ms, haptic) toggles ONE cell. A
 *                   shorter tap does nothing (so the page can scroll),
 *                   and crucially `startDrag` is NOT attached on touch
 *                   so finger movement after the buzz can't paint
 *                   neighbouring cells. This was the bug Nadine
 *                   reported pre-task-75: a 7×30 grid + long-press +
 *                   accidental finger drift = whole row repainted.
 *
 * Extracted to its own module so it can be unit-tested in isolation
 * without spinning up the 2700-line editor.
 */
import type { PointerEvent } from "react";

export const LONG_PRESS_MS = 350;
export const LONG_PRESS_MOVE_TOLERANCE = 10;

/**
 * Gates a cell paint operation by pointer type. See file header for
 * the full mouse-vs-touch contract.
 */
export function beginCellPointer(
  e: PointerEvent,
  fire: () => void,
  startDrag: () => void,
): void {
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
  const onMove = (ev: globalThis.PointerEvent) => {
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
