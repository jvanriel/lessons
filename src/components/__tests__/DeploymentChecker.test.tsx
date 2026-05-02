// @vitest-environment happy-dom
/**
 * Behaviour tests for the background "new version available" detector.
 *
 * Three things matter for correctness:
 *   1. The fetch URL is cache-busted on top of `cache: "no-store"`,
 *      so iOS PWA / mobile Safari can't serve a stale response after
 *      a process resume.
 *   2. The toast appears when the server-reported buildId differs
 *      from the buildId baked into the running JS.
 *   3. The toast does NOT appear when the IDs match.
 *
 * The component reads `process.env.NEXT_PUBLIC_BUILD_ID` at module-
 * load time, so we pin a known value via env mutation before the
 * import happens.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// Pin BUILD_ID before the component module is imported. The component
// reads this env var at module-evaluation time, so re-importing per
// test is the simplest way to swap it. We use the dynamic-import
// trick inside each test to control timing.
const RUNNING_BUILD_ID = "running-abc";

let lastFetchUrl: string | null = null;

function stubFetch(serverBuildId: string | null) {
  lastFetchUrl = null;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    lastFetchUrl = typeof input === "string" ? input : input.toString();
    if (serverBuildId === null) {
      return new Response("", { status: 500 });
    }
    return new Response(JSON.stringify({ buildId: serverBuildId }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

async function renderChecker() {
  // Fresh import each test so env reads + module-level state stay
  // isolated across cases.
  vi.resetModules();
  process.env.NEXT_PUBLIC_BUILD_ID = RUNNING_BUILD_ID;
  const mod = await import("@/components/DeploymentChecker");
  const Component = mod.default;
  render(<Component />);
}

beforeEach(() => {
  // Stub matchMedia (DeploymentChecker checks for standalone display
  // mode); happy-dom doesn't ship one by default for some queries.
  if (!window.matchMedia) {
    window.matchMedia = (q) =>
      ({
        matches: false,
        media: q,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
  // Stub serviceWorker so the SW.update path doesn't throw — we're
  // testing the API-poll path here, not the SW handoff.
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({
        update: () => {},
        addEventListener: () => {},
      }),
    },
  });
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (globalThis as { fetch?: typeof fetch }).fetch;
});

describe("DeploymentChecker", () => {
  it("cache-busts the /api/version URL with a query string on top of `no-store`", async () => {
    stubFetch(RUNNING_BUILD_ID);
    await renderChecker();
    // Drain the microtask queue + the setTimeout(0)-scoped check().
    await vi.runOnlyPendingTimersAsync();
    expect(lastFetchUrl).toBeTruthy();
    expect(lastFetchUrl!).toMatch(/^\/api\/version\?t=\d+$/);
  });

  it("does not show the toast when server buildId matches running buildId", async () => {
    stubFetch(RUNNING_BUILD_ID);
    await renderChecker();
    await vi.runOnlyPendingTimersAsync();
    // Allow microtasks to flush so React commits the no-update state.
    await Promise.resolve();
    expect(screen.queryByText(/new version is available/i)).toBeNull();
    expect(screen.queryByText(/newer version of the app/i)).toBeNull();
  });

  it("shows the toast when server buildId differs from running buildId", async () => {
    stubFetch("server-xyz");
    await renderChecker();
    await vi.runOnlyPendingTimersAsync();
    // Two flushes: one for the fetch promise, one for setState.
    await Promise.resolve();
    await Promise.resolve();
    // Either the standalone copy or the website copy is acceptable —
    // both indicate the toast rendered.
    const toastShown =
      !!screen.queryByText(/new version is available/i) ||
      !!screen.queryByText(/newer version of the app/i);
    expect(toastShown).toBe(true);
  });

  it("does not show a toast when the API returns an error", async () => {
    stubFetch(null);
    await renderChecker();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(screen.queryByText(/new version/i)).toBeNull();
  });
});
