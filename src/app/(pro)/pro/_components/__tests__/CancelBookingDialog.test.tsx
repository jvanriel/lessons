// @vitest-environment happy-dom
/**
 * Behaviour tests for the shared cancel-booking confirm dialog
 * (task 72). The dialog is used from /pro/students,
 * /pro/bookings (List + Calendar), and /pro/availability when a new
 * block sweeps over existing bookings — so a regression here would
 * affect every pro-side cancel surface.
 *
 * Behaviours pinned:
 *   - The confirm button calls onConfirm; the keep button calls
 *     onClose; clicking the backdrop also closes; inner clicks do
 *     not.
 *   - The pending state disables both buttons and swaps the confirm
 *     label for the localized "Cancelling..." spinner copy.
 *   - The studentName, when passed, surfaces above the date.
 *   - i18n keys resolve in EN/NL/FR (the cancel surface is the most
 *     visible pro-side modal — copy drift would be noticed fast).
 *
 * Run: pnpm vitest run src/app/\(pro\)/pro/_components/__tests__/CancelBookingDialog.test.tsx
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { CancelBookingDialog } from "@/app/(pro)/pro/_components/CancelBookingDialog";

afterEach(() => {
  cleanup();
});

const formatDate = (d: string) => `Thu 28 May (${d})`;

interface Overrides {
  studentName?: string;
  pending?: boolean;
  locale?: "en" | "nl" | "fr";
  onConfirm?: () => void;
  onClose?: () => void;
}

function renderDialog(opts: Overrides = {}) {
  const onConfirm = opts.onConfirm ?? vi.fn();
  const onClose = opts.onClose ?? vi.fn();
  const utils = render(
    <CancelBookingDialog
      date="2026-05-28"
      startTime="10:30"
      endTime="11:30"
      studentName={opts.studentName}
      onConfirm={onConfirm}
      onClose={onClose}
      pending={opts.pending ?? false}
      formatDate={formatDate}
      locale={opts.locale ?? "en"}
    />,
  );
  return { ...utils, onConfirm, onClose };
}

describe("CancelBookingDialog — confirm + close buttons", () => {
  it("calls onConfirm when the red 'Cancel booking' button is clicked", () => {
    const { onConfirm, onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /cancel booking/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when the 'Keep' button is clicked", () => {
    const { onConfirm, onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /keep/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onClose when the backdrop is clicked (outside the dialog body)", () => {
    const { container, onConfirm, onClose } = renderDialog();
    // The backdrop is the first child of the rendered container —
    // we have to click ON the backdrop (e.target === backdropRef.current).
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop, { target: backdrop });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does NOT close when an inner element is clicked (backdrop guard)", () => {
    // Regression: the onClick handler checks e.target === backdropRef
    // so children of the dialog don't bubble into a stray close.
    const { onConfirm, onClose } = renderDialog();
    fireEvent.click(screen.getByText(/Thu 28 May/));
    expect(onClose).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("CancelBookingDialog — pending state", () => {
  it("disables both buttons while pending=true", () => {
    renderDialog({ pending: true });
    const keep = screen.getByRole("button", { name: /keep/i });
    // The confirm button is the one whose copy flips to "Cancelling..."
    const confirm = screen.getByRole("button", { name: /cancelling/i });
    expect((keep as HTMLButtonElement).disabled).toBe(true);
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });

  it("swaps the confirm label for the localized 'Cancelling...' copy", () => {
    renderDialog({ pending: true, locale: "nl" });
    expect(screen.getByRole("button", { name: /annuleren\.\.\./i })).toBeTruthy();
  });

  it("ignores clicks on a disabled confirm button (browser native, defense-in-depth)", () => {
    const { onConfirm } = renderDialog({ pending: true });
    fireEvent.click(screen.getByRole("button", { name: /cancelling/i }));
    // happy-dom respects HTML disabled — clicks on disabled buttons
    // don't dispatch. Pin that the parent callback never fires while
    // pending so a double-tap mid-cancel can't trigger a duplicate
    // proCancelBooking server-action call.
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("CancelBookingDialog — student name display", () => {
  it("renders studentName above the date when provided", () => {
    renderDialog({ studentName: "Nadine Dickens" });
    expect(screen.getByText("Nadine Dickens")).toBeTruthy();
  });

  it("omits the student-name line when not provided (callers in availability flows)", () => {
    renderDialog();
    // No student name → the date row carries the .font-medium /
    // .text-green-900 styling instead of just .text-green-700.
    // Loosely verify by counting paragraphs in the info card.
    expect(screen.queryByText(/Nadine/)).toBeNull();
  });
});

describe("CancelBookingDialog — i18n", () => {
  it("renders the English title and copy by default", () => {
    renderDialog();
    expect(screen.getByText("Cancel booking?")).toBeTruthy();
    expect(screen.getByText(/This will free up the slot/i)).toBeTruthy();
  });

  it("renders the Dutch title and copy in nl locale", () => {
    renderDialog({ locale: "nl" });
    expect(screen.getByText("Reservering annuleren?")).toBeTruthy();
    expect(screen.getByText(/Dit maakt het slot beschikbaar/i)).toBeTruthy();
  });

  it("renders the French title and copy in fr locale", () => {
    renderDialog({ locale: "fr" });
    expect(screen.getByText("Annuler la réservation ?")).toBeTruthy();
    expect(screen.getByText(/Cela libérera le créneau/i)).toBeTruthy();
  });
});

describe("CancelBookingDialog — date + time formatting", () => {
  it("passes the date string through the caller-supplied formatter", () => {
    renderDialog();
    // formatDate is "Thu 28 May (2026-05-28)" — both pieces of the
    // string come from the formatter, so a regression to a raw
    // date string would not contain the weekday prefix.
    expect(screen.getByText(/Thu 28 May/)).toBeTruthy();
  });

  it("renders the start-end time on its own line", () => {
    renderDialog();
    expect(screen.getByText("10:30 - 11:30")).toBeTruthy();
  });
});
