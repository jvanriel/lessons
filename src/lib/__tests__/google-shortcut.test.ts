/**
 * Unit tests for the Google Drive for Desktop shortcut helpers
 * (task 16 / v1.1.101). Two surfaces:
 *
 *   - isGoogleShortcutName: matches .gdoc/.gsheet/.gslides/.gdraw/
 *     .gform regardless of case. Drives the OS file picker's accept
 *     allowlist AND the runtime check that routes the shortcut JSON
 *     through the Drive attach flow instead of uploading the stub.
 *
 *   - parseGoogleShortcutUrl: pulls `url` out of the JSON stub; null
 *     on parse failure / missing field, so the caller can fall back
 *     to a normal binary upload (where the user will see a real
 *     error rather than a silent skip).
 *
 *   - GOOGLE_SHORTCUT_ACCEPT: the accept-attribute token list. Pin
 *     it so the Comments-tab + New-Task dialog stay in sync.
 *
 * Run: pnpm vitest run src/lib/__tests__/google-shortcut.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  isGoogleShortcutName,
  parseGoogleShortcutUrl,
  GOOGLE_SHORTCUT_ACCEPT,
} from "@/lib/google-shortcut";

describe("isGoogleShortcutName", () => {
  describe("matches every supported extension", () => {
    const SHORTCUTS = [
      "Draaiboek.gdoc",
      "Budget Q2.gsheet",
      "Pitch deck.gslides",
      "Course map.gdraw",
      "Intake survey.gform",
    ];

    it.each(SHORTCUTS)("recognises %s", (name) => {
      expect(isGoogleShortcutName(name)).toBe(true);
    });
  });

  describe("case-insensitive", () => {
    it.each([
      "FILE.GDOC",
      "File.GDoc",
      "file.Gdoc",
      "FILE.GSHEET",
      "FILE.GSLIDES",
    ])("recognises %s regardless of case", (name) => {
      expect(isGoogleShortcutName(name)).toBe(true);
    });
  });

  describe("rejects non-shortcut filenames", () => {
    const NON_SHORTCUTS = [
      "document.pdf",
      "screenshot.png",
      "video.mp4",
      "archive.zip",
      "draaiboek.docx",
      "data.xlsx",
      "presentation.pptx",
      // Extensions that contain a substring but don't end with one:
      "gdoc-helper.ts",
      "gsheet.png",
      "myfile.gdocx",
      // Empty filename:
      "",
      // Just the extension with no name prefix:
      ".gdoc",
    ];

    it.each(
      NON_SHORTCUTS.filter((n) => n !== ".gdoc"),
    )("rejects %s", (name) => {
      expect(isGoogleShortcutName(name)).toBe(false);
    });

    it("matches a bare .gdoc (endsWith catches it)", () => {
      // Sanity: the helper isn't trying to enforce a name-prefix;
      // anything ending in a known extension is a shortcut. Pin
      // the behaviour so a future refactor doesn't accidentally
      // tighten or loosen it.
      expect(isGoogleShortcutName(".gdoc")).toBe(true);
    });
  });
});

describe("parseGoogleShortcutUrl", () => {
  it("extracts the url from a valid Drive shortcut JSON", () => {
    const json = JSON.stringify({
      url: "https://docs.google.com/document/d/abc123/edit",
      resource_id: "document:abc123",
    });
    expect(parseGoogleShortcutUrl(json)).toBe(
      "https://docs.google.com/document/d/abc123/edit",
    );
  });

  it("works on a Sheet shortcut", () => {
    const json = JSON.stringify({
      url: "https://docs.google.com/spreadsheets/d/xyz789/edit#gid=0",
    });
    expect(parseGoogleShortcutUrl(json)).toBe(
      "https://docs.google.com/spreadsheets/d/xyz789/edit#gid=0",
    );
  });

  it("returns null on malformed JSON", () => {
    expect(parseGoogleShortcutUrl("not json at all")).toBeNull();
    expect(parseGoogleShortcutUrl("{")).toBeNull();
    expect(parseGoogleShortcutUrl("")).toBeNull();
  });

  it("returns null when the JSON has no url field", () => {
    expect(parseGoogleShortcutUrl(JSON.stringify({}))).toBeNull();
    expect(
      parseGoogleShortcutUrl(JSON.stringify({ name: "foo" })),
    ).toBeNull();
  });

  it("returns null when the url field is not a string", () => {
    expect(
      parseGoogleShortcutUrl(JSON.stringify({ url: 12345 })),
    ).toBeNull();
    expect(
      parseGoogleShortcutUrl(JSON.stringify({ url: null })),
    ).toBeNull();
    expect(
      parseGoogleShortcutUrl(JSON.stringify({ url: ["a", "b"] })),
    ).toBeNull();
  });

  it("returns null when the url string is empty", () => {
    expect(parseGoogleShortcutUrl(JSON.stringify({ url: "" }))).toBeNull();
  });

  it("returns null when the JSON parses to a non-object", () => {
    expect(parseGoogleShortcutUrl("123")).toBeNull();
    expect(parseGoogleShortcutUrl("null")).toBeNull();
    expect(parseGoogleShortcutUrl('"a string"')).toBeNull();
    expect(parseGoogleShortcutUrl("[1,2,3]")).toBeNull();
  });
});

describe("GOOGLE_SHORTCUT_ACCEPT", () => {
  it("contains every supported extension", () => {
    expect(GOOGLE_SHORTCUT_ACCEPT).toContain(".gdoc");
    expect(GOOGLE_SHORTCUT_ACCEPT).toContain(".gsheet");
    expect(GOOGLE_SHORTCUT_ACCEPT).toContain(".gslides");
    expect(GOOGLE_SHORTCUT_ACCEPT).toContain(".gdraw");
    expect(GOOGLE_SHORTCUT_ACCEPT).toContain(".gform");
  });

  it("is a comma-joined token list (HTML accept-attribute shape)", () => {
    // The file-picker accept attribute expects extensions joined by
    // commas with no spaces. Pin the format so a refactor that joins
    // with ", " or " | " breaks the picker silently.
    const parts = GOOGLE_SHORTCUT_ACCEPT.split(",");
    expect(parts).toHaveLength(5);
    for (const part of parts) {
      expect(part.startsWith(".")).toBe(true);
      expect(part.trim()).toBe(part);
    }
  });
});
