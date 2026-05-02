/**
 * Minimal Markdown parser for `docs/CHANGELOG.md`.
 *
 * The file format is hand-curated and intentionally narrow:
 *
 *   - Sections start with `## YYYY-MM-DD ...` headings (anything after
 *     the date is treated as part of the heading line and ignored).
 *   - Items are top-level `- ...` bullets that may wrap across
 *     continuation lines.
 *   - An optional `[role]` or `[role1,role2]` prefix on a bullet
 *     restricts visibility to users with one of those roles. Untagged
 *     bullets are visible to everyone. See `parseItemRoles`.
 *   - Anything before the first `## YYYY-MM-DD` heading is the file
 *     intro and gets dropped (it's there for human readers of the
 *     raw file, not for the rendered About page).
 *   - Inline `**bold**` is supported. Everything else is plain text.
 *
 * Pulled out of `src/app/about/page.tsx` so the parsing rules can be
 * unit-tested without spinning up Next.js + the file-system reader.
 */

import type { UserRole } from "@/lib/auth";

export interface ChangelogItem {
  /** Bullet text with the role tag stripped. */
  text: string;
  /**
   * Roles allowed to see this item. `null` means "everyone" (the
   * untagged default). An empty array would mean "no one" but the
   * parser never produces that — at least one valid role is required
   * inside the brackets, otherwise the brackets are treated as plain
   * text and `roles` falls back to `null`.
   */
  roles: UserRole[] | null;
}

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
   * carries the cleaned text and an optional role-restriction list.
   * Call `renderItem()` on `text` to turn it into safe HTML.
   */
  items: ChangelogItem[];
}

const VALID_ROLES: ReadonlySet<UserRole> = new Set([
  "member",
  "pro",
  "admin",
  "dev",
]);

/**
 * Split a `[role,role2] body text` prefix off a bullet. Returns the
 * original text + `roles=null` when the bullet has no valid prefix
 * (so plain `[note]` or `[TODO]` text passes through unchanged).
 */
export function parseItemRoles(raw: string): ChangelogItem {
  const m = /^\[([a-z,\s]+)\]\s+(.+)$/i.exec(raw);
  if (!m) return { text: raw, roles: null };
  const candidates = m[1]
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  const roles = candidates.filter((r): r is UserRole =>
    VALID_ROLES.has(r as UserRole),
  );
  // If any candidate failed to validate, treat the whole prefix as
  // plain text — better to over-show a typo'd entry than to silently
  // drop it for everyone.
  if (roles.length === 0 || roles.length !== candidates.length) {
    return { text: raw, roles: null };
  }
  return { text: m[2], roles };
}

/**
 * True if a user with `userRoles` should see `item`. Untagged items
 * (`item.roles === null`) are visible to everyone, including signed-
 * out visitors. Tagged items require the viewer to have at least one
 * of the listed roles.
 */
export function isItemVisibleTo(
  item: ChangelogItem,
  userRoles: readonly UserRole[],
): boolean {
  if (item.roles === null) return true;
  return item.roles.some((r) => userRoles.includes(r));
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
    const raw = buffer.join(" ").trim();
    current.items.push(parseItemRoles(raw));
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
