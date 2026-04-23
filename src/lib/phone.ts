/**
 * Lightweight E.164 shape check — `+` followed by 8-15 digits. The real
 * validation runs on the client via libphonenumber-js (see `PhoneField`
 * component). This helper is defence-in-depth against direct form-post
 * abuse and is cheap to run on every server action. Do NOT import
 * libphonenumber-js here: its metadata bundle blows up Turbopack dev
 * compile times on hot routes.
 */
export function looksLikeE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}
