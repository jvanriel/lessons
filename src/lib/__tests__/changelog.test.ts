import { describe, expect, it } from "vitest";
import {
  parseChangelog,
  renderItem,
  parseItemRoles,
  isItemVisibleTo,
} from "@/lib/changelog";

const open = (text: string) => ({ text, roles: null });

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
        label: "",
        items: [open("First bullet."), open("Second bullet."), open("Third bullet.")],
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
      { date: "2026-05-02", label: "", items: [open("Newest.")] },
      { date: "2026-04-17", label: "", items: [open("Middle.")] },
      { date: "2026-04-13", label: "", items: [open("Oldest.")] },
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
        label: "",
        items: [
          open("**Bold lead.** First sentence on a wrapped line. And a third line."),
          open("Second bullet (single line)."),
        ],
      },
    ]);
  });

  it("captures the heading suffix after `—` as the entry label", () => {
    const md = `## 2026-05-02 — v1.1.0

- Entry under v1.1.0.
`;
    expect(parseChangelog(md)).toEqual([
      { date: "2026-05-02", label: "v1.1.0", items: [open("Entry under v1.1.0.")] },
    ]);
  });

  it("captures the suffix after a hyphen separator", () => {
    const md = `## 2026-05-02 - v1.1.0
- Entry.
`;
    expect(parseChangelog(md)).toEqual([
      { date: "2026-05-02", label: "v1.1.0", items: [open("Entry.")] },
    ]);
  });

  it("captures the suffix after a colon separator", () => {
    const md = `## 2026-05-02: launch
- Launch entry.
`;
    expect(parseChangelog(md)).toEqual([
      { date: "2026-05-02", label: "launch", items: [open("Launch entry.")] },
    ]);
  });

  it("multiple entries on the same date keep distinct labels", () => {
    const md = `## 2026-05-02 — v1.1.2
- Newest.

## 2026-05-02 — v1.1.1
- Older.

## 2026-05-02 — v1.1.0
- Oldest.
`;
    expect(parseChangelog(md)).toEqual([
      { date: "2026-05-02", label: "v1.1.2", items: [open("Newest.")] },
      { date: "2026-05-02", label: "v1.1.1", items: [open("Older.")] },
      { date: "2026-05-02", label: "v1.1.0", items: [open("Oldest.")] },
    ]);
  });

  it("ignores non-`##` headings inside an entry's body", () => {
    const md = `## 2026-05-02

- A bullet.

### Subhead inside (not a date)
- Another bullet.
`;
    expect(parseChangelog(md)).toEqual([
      {
        date: "2026-05-02",
        label: "",
        items: [open("A bullet."), open("Another bullet.")],
      },
    ]);
  });

  it("flushes the last bullet at end-of-file even without a trailing newline", () => {
    const md = `## 2026-05-02
- Just one bullet`;
    expect(parseChangelog(md)).toEqual([
      { date: "2026-05-02", label: "", items: [open("Just one bullet")] },
    ]);
  });

  it("ignores a heading that doesn't start with a YYYY-MM-DD date", () => {
    const md = `## Unreleased
- Foo.

## 2026-05-02
- Real entry.
`;
    expect(parseChangelog(md)).toEqual([
      { date: "2026-05-02", label: "", items: [open("Real entry.")] },
    ]);
  });

  it("attaches role tags to bullets that have a [role] prefix", () => {
    const md = `## 2026-05-02
- [admin] Admin-only thing.
- [pro,member] Visible to pros and members.
- Plain item visible to everyone.
`;
    expect(parseChangelog(md)).toEqual([
      {
        date: "2026-05-02",
        label: "",
        items: [
          { text: "Admin-only thing.", roles: ["admin"] },
          { text: "Visible to pros and members.", roles: ["pro", "member"] },
          { text: "Plain item visible to everyone.", roles: null },
        ],
      },
    ]);
  });
});

describe("parseItemRoles", () => {
  it("returns roles=null for an untagged bullet", () => {
    expect(parseItemRoles("Plain text item.")).toEqual({
      text: "Plain text item.",
      roles: null,
    });
  });

  it("extracts a single-role tag", () => {
    expect(parseItemRoles("[admin] Admin-only.")).toEqual({
      text: "Admin-only.",
      roles: ["admin"],
    });
  });

  it("extracts a multi-role tag", () => {
    expect(parseItemRoles("[pro,admin] For pros and admins.")).toEqual({
      text: "For pros and admins.",
      roles: ["pro", "admin"],
    });
  });

  it("is case-insensitive on the role names", () => {
    expect(parseItemRoles("[PRO,Admin] mixed case")).toEqual({
      text: "mixed case",
      roles: ["pro", "admin"],
    });
  });

  it("tolerates whitespace inside the brackets", () => {
    expect(parseItemRoles("[ pro , admin ] spaced")).toEqual({
      text: "spaced",
      roles: ["pro", "admin"],
    });
  });

  it("falls back to plain text when ANY role inside the brackets is unknown", () => {
    // Better to over-show a typo'd entry than to silently filter it
    // out for everyone.
    expect(parseItemRoles("[pro,typo] mixed valid+invalid")).toEqual({
      text: "[pro,typo] mixed valid+invalid",
      roles: null,
    });
  });

  it("falls back to plain text for a non-role bracketed prefix", () => {
    // Lots of changelog text uses brackets for non-role purposes.
    expect(parseItemRoles("[TODO] Refactor.")).toEqual({
      text: "[TODO] Refactor.",
      roles: null,
    });
  });

  it("does NOT match a [role] that appears mid-text", () => {
    expect(parseItemRoles("Mid sentence [pro] tag.")).toEqual({
      text: "Mid sentence [pro] tag.",
      roles: null,
    });
  });
});

describe("isItemVisibleTo", () => {
  const ANON: never[] = [];

  it("shows untagged items to anonymous viewers", () => {
    expect(isItemVisibleTo({ text: "Hi", roles: null }, ANON)).toBe(true);
  });

  it("hides tagged items from anonymous viewers", () => {
    expect(isItemVisibleTo({ text: "Hi", roles: ["pro"] }, ANON)).toBe(false);
  });

  it("shows tagged items to a viewer with the matching role", () => {
    expect(
      isItemVisibleTo({ text: "Hi", roles: ["pro"] }, ["pro"]),
    ).toBe(true);
  });

  it("shows multi-role items to a viewer with any matching role", () => {
    expect(
      isItemVisibleTo({ text: "Hi", roles: ["pro", "admin"] }, ["admin"]),
    ).toBe(true);
  });

  it("hides tagged items from a viewer who doesn't have any of the roles", () => {
    expect(
      isItemVisibleTo({ text: "Hi", roles: ["admin"] }, ["member"]),
    ).toBe(false);
  });

  it("a member-only item is hidden from a pro-only viewer", () => {
    expect(
      isItemVisibleTo({ text: "Hi", roles: ["member"] }, ["pro"]),
    ).toBe(false);
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
    expect(renderItem("**<script>**")).toBe(
      "<strong>&lt;script&gt;</strong>",
    );
  });

  it("does not introduce HTML for an unmatched leading `**`", () => {
    expect(renderItem("**foo bar")).toBe("**foo bar");
  });

  it("leaves plain text untouched", () => {
    expect(renderItem("Just a sentence.")).toBe("Just a sentence.");
  });
});
