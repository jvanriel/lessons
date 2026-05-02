import { describe, expect, it } from "vitest";
import { parseChangelog, renderItem } from "@/lib/changelog";

describe("parseChangelog", () => {
  it("returns no entries for an empty file", () => {
    expect(parseChangelog("")).toEqual([]);
  });

  it("returns no entries when there's only an intro paragraph", () => {
    // The file's intro lives before the first `## YYYY-MM-DD` heading
    // and is dropped — nothing user-visible.
    expect(
      parseChangelog(
        "# Changelog\n\nEnd-user-visible changes shipped to the platform.\n\n",
      ),
    ).toEqual([]);
  });

  it("parses a single entry with bullets in source order", () => {
    const md = `# Changelog

## 2026-05-02

- First bullet.
- Second bullet.
- Third bullet.
`;
    expect(parseChangelog(md)).toEqual([
      {
        date: "2026-05-02",
        items: ["First bullet.", "Second bullet.", "Third bullet."],
      },
    ]);
  });

  it("parses multiple entries newest-first as written", () => {
    const md = `# Changelog

## 2026-05-02
- Newest.

## 2026-04-17
- Middle.

## 2026-04-13
- Oldest.
`;
    expect(parseChangelog(md)).toEqual([
      { date: "2026-05-02", items: ["Newest."] },
      { date: "2026-04-17", items: ["Middle."] },
      { date: "2026-04-13", items: ["Oldest."] },
    ]);
  });

  it("joins continuation lines into a single bullet", () => {
    // Multi-line bullets — common in our format because we wrap at
    // ~70 chars for git/diff readability.
    const md = `## 2026-05-02

- **Bold lead.** First sentence
  on a wrapped line.
  And a third line.
- Second bullet (single line).
`;
    expect(parseChangelog(md)).toEqual([
      {
        date: "2026-05-02",
        items: [
          "**Bold lead.** First sentence on a wrapped line. And a third line.",
          "Second bullet (single line).",
        ],
      },
    ]);
  });

  it("treats `## YYYY-MM-DD — title` heading line as the date heading", () => {
    // We sometimes append " — v1.1.0" or similar after the date in
    // the heading line. The parser must still capture the date.
    const md = `## 2026-05-02 — v1.1.0

- Entry under v1.1.0.
`;
    expect(parseChangelog(md)).toEqual([
      { date: "2026-05-02", items: ["Entry under v1.1.0."] },
    ]);
  });

  it("ignores non-`##` headings inside an entry's body", () => {
    // A stray `### Subhead` shouldn't open a new entry. The parser
    // only recognises level-2 headings whose text starts with a date.
    const md = `## 2026-05-02

- A bullet.

### Subhead inside (not a date)
- Another bullet.
`;
    expect(parseChangelog(md)).toEqual([
      {
        date: "2026-05-02",
        items: ["A bullet.", "Another bullet."],
      },
    ]);
  });

  it("flushes the last bullet at end-of-file even without a trailing newline", () => {
    const md = `## 2026-05-02
- Just one bullet`;
    expect(parseChangelog(md)).toEqual([
      { date: "2026-05-02", items: ["Just one bullet"] },
    ]);
  });

  it("ignores a heading that doesn't start with a YYYY-MM-DD date", () => {
    // A `## Unreleased` style heading should not produce an entry.
    const md = `## Unreleased
- Foo.

## 2026-05-02
- Real entry.
`;
    expect(parseChangelog(md)).toEqual([
      { date: "2026-05-02", items: ["Real entry."] },
    ]);
  });
});

describe("renderItem", () => {
  it("escapes ampersands, less-than, greater-than", () => {
    expect(renderItem("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });

  it("renders **bold** as <strong>", () => {
    expect(renderItem("**Hello** world.")).toBe(
      "<strong>Hello</strong> world.",
    );
  });

  it("supports multiple bold runs in one item", () => {
    expect(renderItem("**A** and **B**.")).toBe(
      "<strong>A</strong> and <strong>B</strong>.",
    );
  });

  it("escapes HTML inside the bold marker too", () => {
    // The escape pass runs before the bold pass, so `<` and `>` in
    // the bold text are already neutralised by the time the regex
    // runs. The bold pattern itself doesn't allow `*` inside, so a
    // payload like `**<script>**` becomes `<strong>&lt;script&gt;</strong>`.
    expect(renderItem("**<script>**")).toBe(
      "<strong>&lt;script&gt;</strong>",
    );
  });

  it("does not introduce HTML for an unmatched leading `**`", () => {
    // `**foo` (no closing `**`) is just plain text — the regex
    // requires both ends.
    expect(renderItem("**foo bar")).toBe("**foo bar");
  });

  it("leaves plain text untouched", () => {
    expect(renderItem("Just a sentence.")).toBe("Just a sentence.");
  });
});
