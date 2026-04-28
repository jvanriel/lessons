/**
 * IBAN shape validation — country code (2 letters), 2 check digits, then
 * 11–30 alphanumerics (the country-specific BBAN). This is a format-only
 * check; we do not run the mod-97 checksum here. Server endpoints run the
 * same regex for defence-in-depth.
 */
const IBAN_REGEX = /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/;

export function normalizeIban(raw: string): string {
  return raw.replace(/\s/g, "").toUpperCase();
}

export function isValidIban(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return IBAN_REGEX.test(normalizeIban(raw));
}
