/**
 * Minimal Markdown parser for `docs/CHANGELOG.md`.
 *
 * The file format is hand-curated and intentionally narrow:
 *
 *   - Sections start with `## YYYY-MM-DD ...` headings (anything after
 *     the date is treated as part of the heading line and ignored).
 *   - Items are top-level `- ...` bullets that may wrap across
 *     continuation lines.
 *   - Anything before the first `## YYYY-MM-DD` heading is the file
 *     intro and gets dropped (it's there for human readers of the
 *     raw file, not for the rendered About page).
 *   - Inline `**bold**` is supported. Everything else is plain text.
 *
 * Pulled out of `src/app/about/page.tsx` so the parsing rules can be
 * unit-tested without spinning up Next.js + the file-system reader.
 */

export interface ChangelogEntry {
  /** ISO date string from the heading (`YYYY-MM-DD`). */
  date: string;
  /**
   * Optional text following the date in the heading, with the leading
   * separator (em-dash, hyphen, colon) and surrounding whitespace
   * stripped. For `## 2026-05-02 — v1.1.2` this is `"v1.1.2"`. Empty
   * string when the heading is just a bare date. Used together with
   * `date` to give each entry a unique key when multiple versions
   * ship on the same day.
   */
  label: string;
  /**
   * Bullet items in order of appearance under this heading. Each item
   * is the raw markdown — call `renderItem()` to turn it into safe
   * HTML for display.
   */
  items: string[];
}

/**
 * Parse changelog markdown into structured entries. See file-level
 * comment for the format. Entries are returned in source order
 * (newest-first if the file is maintained that way; the parser does
 * not reorder).
 */
export function parseChangelog(md: string): ChangelogEntry[] {
  const out: ChangelogEntry[] = [];
  const lines = md.split("\n");
  let current: ChangelogEntry | null = null;
  let buffer: string[] = [];

  function flushBullet() {
    if (!current || buffer.length === 0) return;
    current.items.push(buffer.join(" ").trim());
    buffer = [];
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    // Capture the date AND any trailing text after a separator
    // (em-dash `—`, hyphen `-`, or colon `:`). The trailing text is
    // typically a version like `v1.1.2`, used as part of the entry's
    // unique React key so multiple same-date entries don't collide.
    const heading = /^##\s+(\d{4}-\d{2}-\d{2})\s*(?:[—\-:]\s*(.+?))?\s*$/.exec(
      line,
    );
    if (heading) {
      flushBullet();
      if (current) out.push(current);
      current = { date: heading[1], label: (heading[2] ?? "").trim(), items: [] };
      continue;
    }
    if (!current) continue; // skip pre-first-heading intro
    if (line.startsWith("- ")) {
      flushBullet();
      buffer.push(line.slice(2));
    } else if (line.trim() === "") {
      flushBullet();
    } else if (buffer.length > 0) {
      // continuation line of the current bullet
      buffer.push(line.trim());
    }
  }
  flushBullet();
  if (current) out.push(current);
  return out;
}

/**
 * Render a single bullet's text as safe HTML: HTML-escape every
 * special character, then re-introduce `<strong>` for `**bold**`
 * runs. The output is intentionally narrow — no links, no nested
 * lists, no code spans — to match what the changelog format
 * actually uses, and to keep the `dangerouslySetInnerHTML` injection
 * surface trivially small.
 */
export function renderItem(text: string): string {
  const esc = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return esc.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}
