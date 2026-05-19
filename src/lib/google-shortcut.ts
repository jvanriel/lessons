/**
 * Google Drive for Desktop represents native Google files (Docs,
 * Sheets, Slides, Drawings, Forms) on the local filesystem as small
 * JSON shortcut files. Their extensions — .gdoc, .gsheet, .gslides,
 * .gdraw, .gform — aren't standard MIME types, so the OS file picker
 * hides them unless the `accept` allowlist names the extensions
 * explicitly.
 *
 * When the user picks one, the file is a 1-KB JSON stub containing a
 * `url` field pointing at the cloud document. Uploading the stub to
 * Blob would store the JSON, not the actual document — we have to
 * intercept it, parse the embedded URL, and route through the Drive
 * attach API so the cloud file gets linked instead.
 *
 * (task 16 retest — Nadine's Drive folder shows .gdoc/.gsheet files
 * as "no extension" in Windows Explorer; before the fix the file
 * picker hid them.)
 */

const GOOGLE_SHORTCUT_EXTENSIONS = [
  ".gdoc",
  ".gsheet",
  ".gslides",
  ".gdraw",
  ".gform",
] as const;

/**
 * The `accept` allowlist token a `<input type="file">` needs to
 * surface every Google Drive shortcut type in the OS file picker.
 * Importing this from one place keeps the Comments-tab and New-Task
 * dialog in sync.
 */
export const GOOGLE_SHORTCUT_ACCEPT = GOOGLE_SHORTCUT_EXTENSIONS.join(",");

/**
 * True when the given filename is a Google Drive for Desktop shortcut
 * (.gdoc, .gsheet, .gslides, .gdraw, .gform). Comparison is case-
 * insensitive — Windows preserves whatever case the user typed.
 */
export function isGoogleShortcutName(name: string): boolean {
  const lowered = name.toLowerCase();
  return GOOGLE_SHORTCUT_EXTENSIONS.some((ext) => lowered.endsWith(ext));
}

/**
 * Pull the cloud URL out of a Drive shortcut's JSON payload. Returns
 * null when the text isn't valid JSON or the `url` field is missing /
 * non-string. The caller is expected to fall back to a normal binary
 * upload when this returns null, so the user still sees a real error
 * (likely "type not allowed") rather than a silent skip.
 */
export function parseGoogleShortcutUrl(json: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const url = (parsed as { url?: unknown }).url;
  return typeof url === "string" && url.length > 0 ? url : null;
}
