/**
 * Strip formatting from a raw phone input — spaces, hyphens, dots,
 * parentheses — so the server sees the same E.164 shape regardless of
 * what the client typed or pasted. Case is preserved (phone numbers
 * don't use letters but we don't force-upper).
 *
 * Example: "+32 475 62-49 22" → "+32475624922"
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/[\s.\-()]/g, "");
}

/**
 * Lightweight E.164 shape check — `+` followed by 8-15 digits. The
 * real validation runs on the client via libphonenumber-js (see
 * `PhoneField` component); this helper is defence-in-depth against
 * direct form-post abuse and is cheap to run on every server action.
 *
 * Tolerant of whitespace / dashes / dots in the input — they're
 * stripped before the shape check. Do NOT import libphonenumber-js
 * here: its metadata bundle blows up Turbopack dev compile times on
 * hot routes.
 */
export function looksLikeE164(phone: string | null | undefined): boolean {
  const normalized = normalizePhone(phone);
  return /^\+[1-9]\d{7,14}$/.test(normalized);
}
