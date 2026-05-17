/**
 * IBAN validation. Originally we ran only a loose shape check
 * (country + check digits + 4–30 alphanumeric BBAN), which accepted
 * anything ≥ 8 chars as "valid" and hid the form error the moment a
 * pro typed an obviously-incomplete IBAN (task 131).
 *
 * Now we enforce:
 *   1. Country-specific total length.
 *   2. mod-97 = 1 checksum (ISO/IEC 7064 standard).
 *
 * Country-specific lengths come from the official IBAN registry
 * (SWIFT). Not every country in existence is covered; pros from a
 * country we don't list yet fall through to a generic 15–34 length
 * check — still tighter than the pre-fix any-≥-8 acceptance — and
 * still get the mod-97 gate.
 */

// Source: IBAN registry (SWIFT IBAN_Registry_Release.pdf).
// Only the countries our pros are likely to hit. Add more as needed.
const IBAN_LENGTHS: Record<string, number> = {
  AD: 24,
  AE: 23,
  AL: 28,
  AT: 20,
  AZ: 28,
  BA: 20,
  BE: 16,
  BG: 22,
  BH: 22,
  BR: 29,
  BY: 28,
  CH: 21,
  CR: 22,
  CY: 28,
  CZ: 24,
  DE: 22,
  DK: 18,
  DO: 28,
  EE: 20,
  EG: 29,
  ES: 24,
  FI: 18,
  FO: 18,
  FR: 27,
  GB: 22,
  GE: 22,
  GI: 23,
  GL: 18,
  GR: 27,
  GT: 28,
  HR: 21,
  HU: 28,
  IE: 22,
  IL: 23,
  IS: 26,
  IT: 27,
  JO: 30,
  KW: 30,
  KZ: 20,
  LB: 28,
  LC: 32,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  MC: 27,
  MD: 24,
  ME: 22,
  MK: 19,
  MR: 27,
  MT: 31,
  MU: 30,
  NL: 18,
  NO: 15,
  PK: 24,
  PL: 28,
  PS: 29,
  PT: 25,
  QA: 29,
  RO: 24,
  RS: 22,
  SA: 24,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
  TN: 24,
  TR: 26,
  UA: 29,
  VG: 24,
  XK: 20,
};

export function normalizeIban(raw: string): string {
  return raw.replace(/\s/g, "").toUpperCase();
}

function mod97(iban: string): number {
  // Move the four leading characters (country + check digits) to the
  // end, expand letters into 2-digit numbers (A=10, B=11, ..., Z=35),
  // then compute mod 97 in chunks so we never overflow a JS number.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let expanded = "";
  for (const ch of rearranged) {
    if (ch >= "0" && ch <= "9") {
      expanded += ch;
    } else if (ch >= "A" && ch <= "Z") {
      expanded += String(ch.charCodeAt(0) - 55);
    } else {
      return -1;
    }
  }
  let remainder = 0;
  for (let i = 0; i < expanded.length; i += 7) {
    const chunk = String(remainder) + expanded.slice(i, i + 7);
    remainder = Number(chunk) % 97;
  }
  return remainder;
}

export function isValidIban(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const iban = normalizeIban(raw);
  // Shape: 2 letters + 2 digits + 11–30 alphanumerics, total 15–34.
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.length < 15 || iban.length > 34) return false;
  // Country-specific length, when known.
  const country = iban.slice(0, 2);
  const expected = IBAN_LENGTHS[country];
  if (expected !== undefined && iban.length !== expected) return false;
  // Checksum.
  return mod97(iban) === 1;
}
