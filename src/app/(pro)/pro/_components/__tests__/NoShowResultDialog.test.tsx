// @vitest-environment happy-dom
/**
 * Behaviour tests for the post-action no-show result dialog (task
 * 155 phase 4 polish). Replaces the browser-native alert() that was
 * blocking the event loop + couldn't be styled + couldn't surface
 * the Stripe Payment Link URL for a copy-paste fallback.
 *
 * Two variants:
 *   - success: green title, optional settlementUrl rendered as a
 *     copyable link
 *   - error: red title, server error message verbatim
 *
 * Run: pnpm vitest run src/app/\(pro\)/pro/_components/__tests__/NoShowResultDialog.test.tsx
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NoShowResultDialog } from "@/app/(pro)/pro/_components/NoShowResultDialog";

afterEach(() => {
  cleanup();
});

const SETTLEMENT_URL =
  "https://buy.stripe.com/test_abc123?prefilled_email=dummy-student%40example.com";

describe("NoShowResultDialog — success variant", () => {
  it("renders the localized success title", () => {
    render(
      <NoShowResultDialog
        variant="success"
        message="Payment link sent to the golfer."
        onClose={vi.fn()}
        locale="en"
      />,
    );
    expect(screen.getByText("No-show recorded")).toBeTruthy();
  });

  it("renders the message body verbatim", () => {
    render(
      <NoShowResultDialog
        variant="success"
        message="Payment link sent to the golfer."
        onClose={vi.fn()}
        locale="en"
      />,
    );
    expect(
      screen.getByText("Payment link sent to the golfer."),
    ).toBeTruthy();
  });

  it("surfaces the settlementUrl as a clickable anchor when provided", () => {
    render(
      <NoShowResultDialog
        variant="success"
        message="Payment link sent to the golfer."
        settlementUrl={SETTLEMENT_URL}
        onClose={vi.fn()}
        locale="en"
      />,
    );
    const anchor = screen.getByRole("link", { name: SETTLEMENT_URL });
    expect(anchor).toBeTruthy();
    expect((anchor as HTMLAnchorElement).href).toBe(SETTLEMENT_URL);
    // target=_blank with rel=noopener noreferrer — opening in a new
    // tab so the pro doesn't lose the calendar context, and the
    // security flags Stripe expects on payment links.
    expect((anchor as HTMLAnchorElement).target).toBe("_blank");
    expect((anchor as HTMLAnchorElement).rel.toLowerCase()).toContain(
      "noopener",
    );
  });

  it("omits the payment-link block when no settlementUrl is passed", () => {
    render(
      <NoShowResultDialog
        variant="success"
        message="No-show recorded."
        onClose={vi.fn()}
        locale="en"
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/Payment link/)).toBeNull();
  });

  it("renders the localized success title in nl", () => {
    render(
      <NoShowResultDialog
        variant="success"
        message="Betaallink is naar de golfer gestuurd."
        onClose={vi.fn()}
        locale="nl"
      />,
    );
    expect(screen.getByText("No-show geregistreerd")).toBeTruthy();
  });

  it("renders the localized payment-link label in fr", () => {
    render(
      <NoShowResultDialog
        variant="success"
        message="No-show enregistré."
        settlementUrl={SETTLEMENT_URL}
        onClose={vi.fn()}
        locale="fr"
      />,
    );
    expect(screen.getByText("Lien de paiement")).toBeTruthy();
  });
});

describe("NoShowResultDialog — error variant", () => {
  it("renders the localized error title", () => {
    render(
      <NoShowResultDialog
        variant="error"
        message="Stripe is unreachable right now."
        onClose={vi.fn()}
        locale="en"
      />,
    );
    expect(screen.getByText("Couldn't mark as no-show")).toBeTruthy();
  });

  it("renders the server-action error message verbatim", () => {
    render(
      <NoShowResultDialog
        variant="error"
        message="Booking not found."
        onClose={vi.fn()}
        locale="en"
      />,
    );
    expect(screen.getByText("Booking not found.")).toBeTruthy();
  });

  it("ignores settlementUrl on the error variant (defense in depth)", () => {
    // A regression that surfaces a stale URL from a previous attempt
    // could lead the pro to think the action partially succeeded.
    // Lock that the URL block doesn't render in error state even if
    // the caller passes one in.
    render(
      <NoShowResultDialog
        variant="error"
        message="Stripe is unreachable right now."
        settlementUrl={SETTLEMENT_URL}
        onClose={vi.fn()}
        locale="en"
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("NoShowResultDialog — copy-to-clipboard", () => {
  it("calls navigator.clipboard.writeText with the settlementUrl when the copy button is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // happy-dom doesn't ship a navigator.clipboard implementation —
    // stub one. defineProperty so the spy is preserved across the
    // dialog's async handler.
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <NoShowResultDialog
        variant="success"
        message="Payment link sent to the golfer."
        settlementUrl={SETTLEMENT_URL}
        onClose={vi.fn()}
        locale="en"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));
    // Wait a microtask for the async handler to call writeText.
    await new Promise((r) => setTimeout(r, 0));
    expect(writeText).toHaveBeenCalledWith(SETTLEMENT_URL);
  });

  it("flips the button label to 'Copied!' after a successful copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <NoShowResultDialog
        variant="success"
        message="Payment link sent."
        settlementUrl={SETTLEMENT_URL}
        onClose={vi.fn()}
        locale="en"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));
    // Wait for the async writeText to resolve and the resulting
    // setState to commit. The flip from "Copy" → "Copied!" is the
    // visible signal that the clipboard call succeeded.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /copied/i })).toBeTruthy();
    });
  });

  it("does NOT crash when navigator.clipboard.writeText rejects (e.g. insecure context)", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("not allowed"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <NoShowResultDialog
        variant="success"
        message="Payment link sent."
        settlementUrl={SETTLEMENT_URL}
        onClose={vi.fn()}
        locale="en"
      />,
    );

    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));
    }).not.toThrow();
    // After the rejection, the label stays as 'Copy' (no "Copied!"
    // confirmation). The URL is still visible as a fallback.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByRole("button", { name: /^copy$/i })).toBeTruthy();
  });

  it("renders the localized copy label in NL", () => {
    render(
      <NoShowResultDialog
        variant="success"
        message="Betaallink is naar de golfer gestuurd."
        settlementUrl={SETTLEMENT_URL}
        onClose={vi.fn()}
        locale="nl"
      />,
    );
    expect(screen.getByRole("button", { name: /kopieer/i })).toBeTruthy();
  });

  it("renders the localized copy label in FR", () => {
    render(
      <NoShowResultDialog
        variant="success"
        message="Lien de paiement envoyé au golfeur."
        settlementUrl={SETTLEMENT_URL}
        onClose={vi.fn()}
        locale="fr"
      />,
    );
    expect(screen.getByRole("button", { name: /copier/i })).toBeTruthy();
  });
});

describe("NoShowResultDialog — close behaviour", () => {
  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <NoShowResultDialog
        variant="success"
        message="Done."
        onClose={onClose}
        locale="en"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on backdrop click but NOT on inner click", () => {
    const onClose = vi.fn();
    const { container } = render(
      <NoShowResultDialog
        variant="success"
        message="Done."
        onClose={onClose}
        locale="en"
      />,
    );
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop, { target: backdrop });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Done."));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
