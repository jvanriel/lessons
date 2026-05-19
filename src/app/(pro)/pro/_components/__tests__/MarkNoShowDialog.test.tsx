// @vitest-environment happy-dom
/**
 * Behaviour tests for the shared mark-as-no-show confirm dialog
 * (task 155 phase 4). Mirrors CancelBookingDialog's contract but with
 * an amber palette + no-show copy. A regression that swaps the
 * confirm action for a cancel (or vice versa) would silently take
 * money from the wrong booking, so the wiring is worth pinning.
 *
 * Run: pnpm vitest run src/app/\(pro\)/pro/_components/__tests__/MarkNoShowDialog.test.tsx
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MarkNoShowDialog } from "@/app/(pro)/pro/_components/MarkNoShowDialog";

afterEach(() => {
  cleanup();
});

const formatDate = (d: string) => `Tue 19 May (${d})`;

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
    <MarkNoShowDialog
      date="2026-05-19"
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

describe("MarkNoShowDialog — confirm + close", () => {
  it("calls onConfirm when the amber 'Mark as no-show' button is clicked", () => {
    const { onConfirm, onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /mark as no-show/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when the 'Cancel' button is clicked", () => {
    const { onConfirm, onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("closes on backdrop click but NOT on inner click (backdropRef guard)", () => {
    const { container, onConfirm, onClose } = renderDialog();
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop, { target: backdrop });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Inner click — date row — must NOT bubble into close.
    fireEvent.click(screen.getByText(/Tue 19 May/));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("MarkNoShowDialog — pending state", () => {
  it("disables both buttons while pending=true", () => {
    renderDialog({ pending: true });
    // The confirm copy flips to "Marking..." when pending.
    const confirm = screen.getByRole("button", { name: /marking/i });
    const keep = screen.getByRole("button", { name: /^cancel$/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect((keep as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders the localized 'Marking...' label in nl", () => {
    renderDialog({ pending: true, locale: "nl" });
    expect(screen.getByRole("button", { name: /bezig/i })).toBeTruthy();
  });

  it("native HTML disabled stops duplicate proMarkNoShow calls mid-flight", () => {
    const { onConfirm } = renderDialog({ pending: true });
    fireEvent.click(screen.getByRole("button", { name: /marking/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("MarkNoShowDialog — student name + date display", () => {
  it("surfaces studentName above the date when provided", () => {
    renderDialog({ studentName: "Nadine Dickens" });
    expect(screen.getByText("Nadine Dickens")).toBeTruthy();
  });

  it("omits the student-name line when no name is passed", () => {
    renderDialog();
    expect(screen.queryByText(/Nadine/)).toBeNull();
  });

  it("renders the start-end time on its own line", () => {
    renderDialog();
    expect(screen.getByText("10:30 - 11:30")).toBeTruthy();
  });

  it("passes the date string through the caller's formatter", () => {
    renderDialog();
    expect(screen.getByText(/Tue 19 May/)).toBeTruthy();
  });
});

describe("MarkNoShowDialog — i18n", () => {
  it("renders the English title + body explaining the paid/unpaid branches", () => {
    renderDialog();
    expect(screen.getByText("Mark as no-show?")).toBeTruthy();
    expect(screen.getByText(/secure payment link/i)).toBeTruthy();
  });

  it("renders the Dutch title + body", () => {
    renderDialog({ locale: "nl" });
    expect(screen.getByText("Markeren als no-show?")).toBeTruthy();
    expect(screen.getByText(/beveiligde betaallink/i)).toBeTruthy();
  });

  it("renders the French title + body", () => {
    renderDialog({ locale: "fr" });
    expect(screen.getByText("Marquer comme no-show ?")).toBeTruthy();
    expect(screen.getByText(/lien de paiement sécurisé/i)).toBeTruthy();
  });
});
