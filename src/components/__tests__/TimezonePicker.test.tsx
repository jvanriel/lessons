// @vitest-environment happy-dom
/**
 * Behaviour tests for the location-form timezone picker.
 *
 * The picker has three pre-selection sources, in priority order:
 *   1. `value` (edit mode — the row's persisted TZ).
 *   2. `inferred` (caller derived from country, etc.).
 *   3. `fallback` (defaults to "Europe/Brussels").
 *
 * It NEVER consults the browser TZ — that was a fix the user
 * specifically called out: a location's TZ is a property of the
 * place, not the registering device. Tests below pin browser TZ to
 * a non-default value (UTC, via the test runner's `process.env.TZ`)
 * and confirm the picker does NOT pick it up implicitly.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TimezonePicker } from "@/components/TimezonePicker";

beforeEach(() => {
  // Mute the React 19 act() warning that fires from useEffect-driven
  // onChange callbacks in this small synchronous test setup.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  // Vitest doesn't auto-cleanup RTL renders unless the
  // `globals` flag is on; clear the DOM ourselves so each test
  // sees a fresh document body. Without this, hidden inputs from
  // earlier renders pile up and `querySelectorAll` finds N copies.
  cleanup();
  vi.restoreAllMocks();
});

function getHidden(name = "timezone"): HTMLInputElement {
  // The picker submits via a hidden <input>; grabbing it by name is
  // the most reliable way to assert the actual submitted value.
  const inputs = document.querySelectorAll<HTMLInputElement>(
    `input[type="hidden"][name="${name}"]`,
  );
  expect(inputs.length).toBe(1);
  return inputs[0];
}

describe("TimezonePicker — pre-selection priority", () => {
  it("uses `value` when provided (edit mode)", () => {
    render(
      <TimezonePicker
        locale="en"
        value="Europe/London"
        inferred="Europe/Paris"
      />,
    );
    expect(getHidden().value).toBe("Europe/London");
    expect(screen.getByText("Europe/London")).toBeTruthy();
  });

  it("uses `inferred` when no value", () => {
    render(<TimezonePicker locale="en" inferred="Europe/Madrid" />);
    expect(getHidden().value).toBe("Europe/Madrid");
  });

  it("falls back to `fallback` when neither value nor inferred", () => {
    render(<TimezonePicker locale="en" fallback="Asia/Tokyo" />);
    expect(getHidden().value).toBe("Asia/Tokyo");
  });

  it("defaults fallback to Europe/Brussels for the Belgian launch", () => {
    render(<TimezonePicker locale="en" />);
    expect(getHidden().value).toBe("Europe/Brussels");
  });
});

describe("TimezonePicker — country inference + override", () => {
  it("shows the inferred-from hint when displaying the inferred value", () => {
    render(
      <TimezonePicker
        locale="en"
        inferred="Europe/Madrid"
        inferredFromLabel="Spain"
      />,
    );
    // Hint includes the country label after the resolved value.
    expect(screen.getByText(/Spain/)).toBeTruthy();
  });

  it("re-infers when the parent updates `inferred` (and user hasn't overridden)", () => {
    const { rerender } = render(
      <TimezonePicker
        locale="en"
        inferred="Europe/Brussels"
        inferredFromLabel="Belgium"
      />,
    );
    expect(getHidden().value).toBe("Europe/Brussels");
    rerender(
      <TimezonePicker
        locale="en"
        inferred="Europe/Paris"
        inferredFromLabel="France"
      />,
    );
    expect(getHidden().value).toBe("Europe/Paris");
  });

  it("stops following `inferred` once the user explicitly picks something", () => {
    const { rerender } = render(
      <TimezonePicker
        locale="en"
        inferred="Europe/Brussels"
        inferredFromLabel="Belgium"
      />,
    );
    // User opens picker + selects a different zone.
    fireEvent.click(screen.getByText("change"));
    const select = document.querySelector("select")!;
    fireEvent.change(select, { target: { value: "Asia/Tokyo" } });
    expect(getHidden().value).toBe("Asia/Tokyo");

    // Parent now updates inferred (e.g. they typed a new country).
    // Picker must NOT silently overwrite the user's pick.
    rerender(
      <TimezonePicker
        locale="en"
        inferred="Europe/Paris"
        inferredFromLabel="France"
      />,
    );
    expect(getHidden().value).toBe("Asia/Tokyo");
  });
});

describe("TimezonePicker — onChange + submit value", () => {
  it("fires onChange on initial mount with the resolved value", () => {
    const onChange = vi.fn();
    render(
      <TimezonePicker
        locale="en"
        inferred="Europe/Berlin"
        onChange={onChange}
      />,
    );
    // First call should report the inferred default — the parent's
    // React state needs the value even when the user hasn't touched
    // the picker.
    expect(onChange).toHaveBeenCalledWith("Europe/Berlin");
  });

  it("does not fire onChange on initial mount when `value` is set (edit mode)", () => {
    const onChange = vi.fn();
    render(
      <TimezonePicker
        locale="en"
        value="Europe/London"
        onChange={onChange}
      />,
    );
    // In edit mode the parent already knows the value; firing
    // onChange here would be redundant chatter.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("fires onChange when the user picks a new zone", () => {
    const onChange = vi.fn();
    render(
      <TimezonePicker locale="en" inferred="Europe/Brussels" onChange={onChange} />,
    );
    onChange.mockClear();
    fireEvent.click(screen.getByText("change"));
    fireEvent.change(document.querySelector("select")!, {
      target: { value: "Asia/Tokyo" },
    });
    expect(onChange).toHaveBeenCalledWith("Asia/Tokyo");
    expect(getHidden().value).toBe("Asia/Tokyo");
  });
});

describe("TimezonePicker — common zones option list", () => {
  it("expands to a select that includes the common-zones group", () => {
    render(<TimezonePicker locale="en" />);
    fireEvent.click(screen.getByText("change"));
    const groups = document.querySelectorAll("optgroup");
    // Two groups: Common, All.
    expect(groups.length).toBe(2);
    // Both groups have at least one Brussels option somewhere.
    const allOptionValues = Array.from(
      document.querySelectorAll<HTMLOptionElement>("option"),
    ).map((o) => o.value);
    expect(allOptionValues).toContain("Europe/Brussels");
    expect(allOptionValues).toContain("Asia/Tokyo");
  });
});

describe("TimezonePicker — explicitly does NOT consult browser TZ", () => {
  it("ignores the runtime / browser TZ when no value or inferred", () => {
    // The test runner pins TZ=Europe/Brussels in vitest.setup.ts;
    // override it for this test to make sure the picker does not
    // pull from the runtime even when the runtime resolves a zone.
    const original = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      render(<TimezonePicker locale="en" />);
      // Should land on the fallback, NOT America/New_York.
      expect(getHidden().value).toBe("Europe/Brussels");
    } finally {
      process.env.TZ = original;
    }
  });
});
