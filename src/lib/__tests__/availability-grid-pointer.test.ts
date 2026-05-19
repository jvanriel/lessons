// @vitest-environment happy-dom
/**
 * Unit tests for the availability-grid pointer gate (task 75).
 *
 * Two behaviours are load-bearing — a regression in either would
 * recreate the bug Nadine flagged: long-press on a 7×30 grid +
 * accidental finger drift = whole row repainted.
 *
 *   1. Mouse / pen: fire() AND startDrag() run synchronously, plus
 *      the synthetic event's default is prevented so the browser
 *      doesn't pick up a text-selection drag.
 *   2. Touch: nothing fires immediately. After LONG_PRESS_MS, fire()
 *      runs ONCE; startDrag() is never invoked. If the finger moves
 *      more than the tolerance before the timer elapses, fire() is
 *      also never invoked (the timer is cancelled).
 *
 * Run: pnpm vitest run src/lib/__tests__/availability-grid-pointer.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  beginCellPointer,
  LONG_PRESS_MS,
  LONG_PRESS_MOVE_TOLERANCE,
} from "@/lib/availability-grid-pointer";
import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Build a fake React PointerEvent. The function only reads
 * `pointerType`, `clientX`, `clientY`, and calls `preventDefault`,
 * so this minimal stub is enough.
 */
function makeEvent(
  pointerType: "mouse" | "pen" | "touch",
  clientX = 0,
  clientY = 0,
): ReactPointerEvent {
  const preventDefault = vi.fn();
  return {
    pointerType,
    clientX,
    clientY,
    preventDefault,
  } as unknown as ReactPointerEvent;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("beginCellPointer — non-touch (mouse / pen)", () => {
  it.each(["mouse", "pen"] as const)(
    "fires both callbacks synchronously on %s",
    (pointerType) => {
      const fire = vi.fn();
      const startDrag = vi.fn();
      const e = makeEvent(pointerType);
      beginCellPointer(e, fire, startDrag);
      expect(fire).toHaveBeenCalledTimes(1);
      expect(startDrag).toHaveBeenCalledTimes(1);
    },
  );

  it("calls preventDefault on the synthetic event for mouse", () => {
    const fire = vi.fn();
    const startDrag = vi.fn();
    const e = makeEvent("mouse");
    beginCellPointer(e, fire, startDrag);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("returns immediately on mouse without scheduling a timer", () => {
    const fire = vi.fn();
    const startDrag = vi.fn();
    const e = makeEvent("mouse");
    beginCellPointer(e, fire, startDrag);
    // No pending timers should be left behind — otherwise the mouse
    // path would queue a stray fire() that could trigger after the
    // user moved on to another action.
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("beginCellPointer — touch", () => {
  it("does NOT fire synchronously on touch", () => {
    const fire = vi.fn();
    const startDrag = vi.fn();
    const e = makeEvent("touch", 100, 100);
    beginCellPointer(e, fire, startDrag);
    expect(fire).not.toHaveBeenCalled();
    expect(startDrag).not.toHaveBeenCalled();
  });

  it("does NOT call preventDefault on touch (page must remain scrollable)", () => {
    const fire = vi.fn();
    const startDrag = vi.fn();
    const e = makeEvent("touch", 100, 100);
    beginCellPointer(e, fire, startDrag);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("fires once after LONG_PRESS_MS and NEVER invokes startDrag", () => {
    const fire = vi.fn();
    const startDrag = vi.fn();
    const e = makeEvent("touch", 100, 100);
    beginCellPointer(e, fire, startDrag);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(fire).toHaveBeenCalledTimes(1);
    // The whole point of task 75 — touch must NOT enable drag-paint.
    expect(startDrag).not.toHaveBeenCalled();
  });

  it("cancels the long-press when the finger moves beyond tolerance", () => {
    const fire = vi.fn();
    const startDrag = vi.fn();
    const e = makeEvent("touch", 100, 100);
    beginCellPointer(e, fire, startDrag);

    // Simulate a finger drift of > LONG_PRESS_MOVE_TOLERANCE px:
    const drift = LONG_PRESS_MOVE_TOLERANCE + 5;
    window.dispatchEvent(
      new (globalThis as unknown as { PointerEvent: typeof Event }).PointerEvent(
        "pointermove",
        {
          clientX: 100 + drift,
          clientY: 100,
        } as PointerEventInit,
      ),
    );
    // Advance past the threshold — the timer should have been cancelled.
    vi.advanceTimersByTime(LONG_PRESS_MS + 50);
    expect(fire).not.toHaveBeenCalled();
    expect(startDrag).not.toHaveBeenCalled();
  });

  it("does NOT cancel the long-press for a tiny finger jitter within tolerance", () => {
    const fire = vi.fn();
    const startDrag = vi.fn();
    const e = makeEvent("touch", 100, 100);
    beginCellPointer(e, fire, startDrag);

    // Within the move tolerance — must still fire.
    const tinyJitter = LONG_PRESS_MOVE_TOLERANCE - 1;
    window.dispatchEvent(
      new (globalThis as unknown as { PointerEvent: typeof Event }).PointerEvent(
        "pointermove",
        {
          clientX: 100 + tinyJitter,
          clientY: 100 + tinyJitter,
        } as PointerEventInit,
      ),
    );
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(startDrag).not.toHaveBeenCalled();
  });

  it("cancels the long-press on pointerup before the threshold", () => {
    const fire = vi.fn();
    const startDrag = vi.fn();
    const e = makeEvent("touch", 100, 100);
    beginCellPointer(e, fire, startDrag);

    // User lifts their finger before LONG_PRESS_MS — a quick tap.
    window.dispatchEvent(
      new (globalThis as unknown as { PointerEvent: typeof Event }).PointerEvent(
        "pointerup",
        {
          clientX: 100,
          clientY: 100,
        } as PointerEventInit,
      ),
    );
    vi.advanceTimersByTime(LONG_PRESS_MS + 50);
    expect(fire).not.toHaveBeenCalled();
    expect(startDrag).not.toHaveBeenCalled();
  });

  it("cancels the long-press on pointercancel (touch interrupted)", () => {
    const fire = vi.fn();
    const startDrag = vi.fn();
    const e = makeEvent("touch", 100, 100);
    beginCellPointer(e, fire, startDrag);

    window.dispatchEvent(
      new (globalThis as unknown as { PointerEvent: typeof Event }).PointerEvent(
        "pointercancel",
        {} as PointerEventInit,
      ),
    );
    vi.advanceTimersByTime(LONG_PRESS_MS + 50);
    expect(fire).not.toHaveBeenCalled();
    expect(startDrag).not.toHaveBeenCalled();
  });
});

describe("LONG_PRESS_MS / LONG_PRESS_MOVE_TOLERANCE — constant lock-in", () => {
  // These constants are part of the touch UX contract. Changing them
  // can cause "no buzz when I touched the screen" / "phantom paints
  // when I scrolled" regressions, so pin the values explicitly.
  it("LONG_PRESS_MS stays at 350 ms (haptic-buzz threshold)", () => {
    expect(LONG_PRESS_MS).toBe(350);
  });

  it("LONG_PRESS_MOVE_TOLERANCE stays at 10 px (cancel-on-drift threshold)", () => {
    expect(LONG_PRESS_MOVE_TOLERANCE).toBe(10);
  });
});
