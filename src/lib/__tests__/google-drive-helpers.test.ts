/**
 * Unit tests for the Drive integration helpers (task 124).
 *
 *   - stripQuotesAndTrim — guards against Vercel pastes that wrap
 *     env vars in quotes. Without this the PEM parser blows up
 *     with "DECODER routines::unsupported" and the whole Drive
 *     flow silently dies. This was the bug that triggered the
 *     follow-up commit 8ec67c1 right after task 124 first shipped.
 *
 *   - buildTaskFolderName — formats the per-task folder name shown
 *     in Drive ("Task #<id> — <title>"). Escapes single quotes
 *     because the name flows into a Drive q-filter; an unescaped
 *     apostrophe would close the literal mid-query and either 404
 *     or list the wrong folder. Title is clamped at 80 chars so a
 *     pasted essay-length title doesn't make the Drive UI horrible.
 *
 *   - GOOGLE_DOC_MIME — pin the three native-MIME strings; using
 *     "application/vnd.google-apps.document" vs the Office MIME is
 *     the difference between "real native Doc that opens in Drive"
 *     and "Office file uploaded as a binary blob". This is also
 *     what the /api/admin/tasks/google-create route reflects back
 *     as the comment's contentType.
 *
 * Run: pnpm vitest run src/lib/__tests__/google-drive-helpers.test.ts
 */
import { describe, it, expect, vi } from "vitest";
import {
  stripQuotesAndTrim,
  buildTaskFolderName,
} from "@/lib/google-drive-helpers";

// google-drive.ts is server-only; we only need GOOGLE_DOC_MIME from
// it for the constant lock-in tests, so silence the marker.
vi.mock("server-only", () => ({}));

const { GOOGLE_DOC_MIME } = await import("@/lib/google-drive");

describe("stripQuotesAndTrim", () => {
  it("returns '' for undefined", () => {
    expect(stripQuotesAndTrim(undefined)).toBe("");
  });

  it("returns '' for empty string", () => {
    expect(stripQuotesAndTrim("")).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(stripQuotesAndTrim("   foo   ")).toBe("foo");
  });

  it("strips matching double quotes", () => {
    expect(stripQuotesAndTrim('"value"')).toBe("value");
  });

  it("strips matching single quotes", () => {
    expect(stripQuotesAndTrim("'value'")).toBe("value");
  });

  it("strips quotes AND trims internal whitespace", () => {
    expect(stripQuotesAndTrim('"  value  "')).toBe("value");
  });

  it("leaves unmatched quotes alone (only strips matching pairs)", () => {
    expect(stripQuotesAndTrim('"value')).toBe('"value');
    expect(stripQuotesAndTrim('value"')).toBe('value"');
    expect(stripQuotesAndTrim("'value")).toBe("'value");
  });

  it("doesn't mistake one quote type for the other", () => {
    // A starting double and a closing single is NOT a matching pair.
    expect(stripQuotesAndTrim("\"value'")).toBe("\"value'");
  });

  it("handles a multi-line PEM-shaped value the way the Drive client expects", () => {
    // Real-world shape: Vercel pastes wrap the whole PEM in double
    // quotes, including the newline escapes that getCredentials
    // un-escapes downstream. stripQuotesAndTrim only owns the outer
    // quote / whitespace; the \\n→\n substitution happens after.
    const wrapped = '"-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n"';
    expect(stripQuotesAndTrim(wrapped)).toBe(
      "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n",
    );
  });
});

describe("buildTaskFolderName", () => {
  it("formats a task id + title into the Drive folder shape", () => {
    expect(buildTaskFolderName(42, "Pro onboarding")).toBe(
      "Task #42 — Pro onboarding",
    );
  });

  it("clamps the title at 80 characters so the Drive UI stays readable", () => {
    const longTitle = "x".repeat(200);
    const out = buildTaskFolderName(7, longTitle);
    // Format: "Task #7 — " (10 chars) + 80 of x. Total 90.
    expect(out).toBe(`Task #7 — ${"x".repeat(80)}`);
    expect(out.length).toBe(90);
  });

  it("escapes single quotes so the Drive q-filter doesn't break", () => {
    // Regression: without the escape, a folder titled with an
    // apostrophe (e.g. "pro's calendar") would emit
    //   q: name = 'Task #1 — pro's calendar'
    // — Drive parses the inner ' as the end of the literal and
    // returns either nothing or the wrong folder.
    const out = buildTaskFolderName(1, "pro's calendar");
    expect(out).toBe("Task #1 — pro\\'s calendar");
  });

  it("escapes every occurrence of a single quote, not just the first", () => {
    const out = buildTaskFolderName(2, "'a 'b 'c");
    expect(out).toBe("Task #2 — \\'a \\'b \\'c");
  });

  it("doesn't touch double quotes (Drive q-filter doesn't care about them here)", () => {
    const out = buildTaskFolderName(3, 'foo "bar" baz');
    expect(out).toBe('Task #3 — foo "bar" baz');
  });

  it("clamps before escaping so a long title with a trailing apostrophe doesn't get cropped mid-escape", () => {
    // Build a title where char 80 is an apostrophe. The truncation
    // happens first; the resulting 80-char prefix includes the
    // apostrophe at position 79; the escape replaces it with the
    // two-char sequence — final length grows by 1.
    const head = "x".repeat(79);
    const out = buildTaskFolderName(4, `${head}'tail`);
    // Truncated to 80 = head + ' ; then escape → head + \'
    expect(out).toBe(`Task #4 — ${head}\\'`);
  });
});

describe("GOOGLE_DOC_MIME — native-MIME lock-in", () => {
  it("maps document → application/vnd.google-apps.document", () => {
    expect(GOOGLE_DOC_MIME.document).toBe(
      "application/vnd.google-apps.document",
    );
  });

  it("maps spreadsheet → application/vnd.google-apps.spreadsheet", () => {
    expect(GOOGLE_DOC_MIME.spreadsheet).toBe(
      "application/vnd.google-apps.spreadsheet",
    );
  });

  it("maps presentation → application/vnd.google-apps.presentation", () => {
    expect(GOOGLE_DOC_MIME.presentation).toBe(
      "application/vnd.google-apps.presentation",
    );
  });

  it("has exactly three entries (no rogue additions)", () => {
    // If we ever add a new type (e.g. 'drawing'), this test will fail
    // and force a deliberate update to the API route's VALID_TYPES
    // set as well — the two must stay aligned.
    expect(Object.keys(GOOGLE_DOC_MIME)).toEqual([
      "document",
      "spreadsheet",
      "presentation",
    ]);
  });

  it("uses native google-apps MIMEs, NOT the Office (binary upload) MIMEs", () => {
    // Regression guard. The integration's whole point is that we
    // create a real Drive-native Doc/Sheet/Slides, not an Office
    // file that Drive treats as a binary blob.
    for (const v of Object.values(GOOGLE_DOC_MIME)) {
      expect(v).toMatch(/^application\/vnd\.google-apps\./);
    }
  });
});
