/**
 * Unit tests for parseDriveFileId (task 16). The helper feeds
 * getDriveFileByUrl, which is the entry point for the
 * /api/admin/tasks/google-attach route — both the "paste a Drive
 * link" and the "Drive shortcut intercepted from disk" code paths
 * end up calling parseDriveFileId on whatever URL came in.
 *
 * A regression here is high-impact: a misparse silently drops to
 * the 404 branch in the route, which Nadine would experience as
 * "the file isn't shared with the service account" — a misleading
 * error message that sends her down the wrong rabbit hole.
 *
 * Run: pnpm vitest run src/lib/__tests__/google-drive-parse.test.ts
 */
import { describe, it, expect, vi } from "vitest";

// google-drive.ts is marked server-only because it talks to the
// Workspace API at module-eval time. parseDriveFileId itself is
// pure, so for the unit test we silence the server-only guard.
vi.mock("server-only", () => ({}));

const { parseDriveFileId } = await import("@/lib/google-drive");

describe("parseDriveFileId", () => {
  describe("/d/ URL shape (Docs/Sheets/Slides + drive.google.com)", () => {
    it.each([
      [
        "Google Doc edit URL",
        "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit",
        "1AbCdEfGhIjKlMnOpQrStUvWxYz",
      ],
      [
        "Google Sheet edit URL with fragment",
        "https://docs.google.com/spreadsheets/d/abc123xyz456/edit#gid=0",
        "abc123xyz456",
      ],
      [
        "Google Slides view URL",
        "https://docs.google.com/presentation/d/PRES_ID_HERE/view",
        "PRES_ID_HERE",
      ],
      [
        "drive.google.com file URL",
        "https://drive.google.com/file/d/FILE_ID_WITH-DASHES_AND_UNDER/view?usp=sharing",
        "FILE_ID_WITH-DASHES_AND_UNDER",
      ],
    ])("extracts the id from %s", (_label, url, expected) => {
      expect(parseDriveFileId(url)).toBe(expected);
    });
  });

  describe("?id= query-string shape (legacy drive.google.com/open)", () => {
    it("extracts the id from drive.google.com/open?id=…", () => {
      const url = "https://drive.google.com/open?id=ABC123DEFG456HIJK";
      expect(parseDriveFileId(url)).toBe("ABC123DEFG456HIJK");
    });

    it("extracts the id from a URL with multiple query params", () => {
      const url =
        "https://drive.google.com/open?usp=sharing&id=XYZ789&authuser=0";
      expect(parseDriveFileId(url)).toBe("XYZ789");
    });
  });

  describe("rejects malformed or non-Drive URLs", () => {
    it.each([
      ["empty string", ""],
      ["plain text", "not a url"],
      ["non-Drive URL without /d/ or ?id=", "https://example.com/some/path"],
      ["Drive URL without an id segment", "https://drive.google.com/"],
      [
        "ID too short for the /d/ regex (minimum 10 chars)",
        "https://docs.google.com/document/d/short/edit",
      ],
    ])("returns null for %s", (_label, url) => {
      expect(parseDriveFileId(url)).toBeNull();
    });
  });

  describe("regression guards", () => {
    it("doesn't confuse a folder URL for a file URL — folders aren't /d/", () => {
      // Drive folders use /folders/<id>, not /d/<id>. We expect null
      // because the helper only handles file shapes. If we ever
      // change that, the test fails and forces a deliberate decision.
      const folder = "https://drive.google.com/drive/folders/FOLDER_ID_123";
      expect(parseDriveFileId(folder)).toBeNull();
    });

    it("respects the 10-char minimum so short paths don't false-match", () => {
      // The /d/ regex requires {10,} chars on the id; anything
      // shorter is almost certainly not a Drive id. Lock this in so
      // a careless edit to /d\/([a-zA-Z0-9_-]+)/ doesn't let bogus
      // strings through.
      expect(
        parseDriveFileId("https://docs.google.com/document/d/abc/edit"),
      ).toBeNull();
      expect(
        parseDriveFileId("https://docs.google.com/document/d/abcdef/edit"),
      ).toBeNull();
      expect(
        parseDriveFileId("https://docs.google.com/document/d/abcdefghij/edit"),
      ).toBe("abcdefghij");
    });

    it("handles underscores and dashes in the id (Drive ids legitimately contain both)", () => {
      const id = "abc_def-ghi_jkl-MNO_PQR-stu";
      const url = `https://docs.google.com/document/d/${id}/edit`;
      expect(parseDriveFileId(url)).toBe(id);
    });
  });
});
