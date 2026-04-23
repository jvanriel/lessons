/**
 * EU VAT-number shape validation.
 *
 * Format-only (regex) check — enough to catch typos and force a
 * country-plus-digits shape. We do NOT hit VIES or other lookup
 * services from here; that belongs in a background job if we ever
 * need it. Non-EU countries return `true` when the string is non-empty
 * so we don't block pros in e.g. UK / CH from saving.
 *
 * All inputs should be normalised to upper-case, no whitespace, no
 * dots or dashes — see `normalizeVat`.
 */

const EU_VAT_SHAPES: Record<string, RegExp> = {
  AT: /^ATU\d{8}$/,
  BE: /^BE0\d{9}$/,
  BG: /^BG\d{9,10}$/,
  CY: /^CY\d{8}[A-Z]$/,
  CZ: /^CZ\d{8,10}$/,
  DE: /^DE\d{9}$/,
  DK: /^DK\d{8}$/,
  EE: /^EE\d{9}$/,
  EL: /^EL\d{9}$/,
  ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^FI\d{8}$/,
  FR: /^FR[A-Z0-9]{2}\d{9}$/,
  HR: /^HR\d{11}$/,
  HU: /^HU\d{8}$/,
  IE: /^IE\d{7}[A-Z]{1,2}$/,
  IT: /^IT\d{11}$/,
  LT: /^LT(\d{9}|\d{12})$/,
  LU: /^LU\d{8}$/,
  LV: /^LV\d{11}$/,
  MT: /^MT\d{8}$/,
  NL: /^NL\d{9}B\d{2}$/,
  PL: /^PL\d{10}$/,
  PT: /^PT\d{9}$/,
  RO: /^RO\d{2,10}$/,
  SE: /^SE\d{12}$/,
  SI: /^SI\d{8}$/,
  SK: /^SK\d{10}$/,
  // GR uses EL prefix officially but typed as GR is common.
  GR: /^GR\d{9}$/,
};

export function normalizeVat(raw: string): string {
  return raw.replace(/[\s.\-]/g, "").toUpperCase();
}

/**
 * Returns true when shape matches the country prefix, or when the
 * prefix isn't in our EU table but the string is non-empty (we don't
 * gate non-EU pros).
 */
export function isValidVatShape(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const v = normalizeVat(raw);
  if (v.length < 4) return false;
  const prefix = v.slice(0, 2);
  const shape = EU_VAT_SHAPES[prefix];
  if (!shape) {
    // Unknown prefix — accept as long as it's alphanumerics + prefix letters.
    return /^[A-Z]{2}[A-Z0-9]{2,20}$/.test(v);
  }
  return shape.test(v);
}
