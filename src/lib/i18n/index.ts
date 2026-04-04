export const LOCALES = ["nl", "fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "nl";

export function isLocale(value: string): value is Locale {
  return LOCALES.includes(value as Locale);
}

export function getLocaleFromPath(pathname: string): Locale {
  const match = pathname.match(/^\/(en|fr)(\/|$)/);
  return match ? (match[1] as Locale) : DEFAULT_LOCALE;
}

export function stripLocalePrefix(pathname: string): string {
  return pathname.replace(/^\/(en|fr)(\/|$)/, "/") || "/";
}

export function localePath(pathname: string, locale: Locale): string {
  const clean = stripLocalePrefix(pathname);
  if (locale === DEFAULT_LOCALE) return clean;
  return `/${locale}${clean === "/" ? "" : clean}`;
}

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  nl: "Nederlands",
  fr: "Français",
};

export const LOCALE_SHORT: Record<Locale, string> = {
  en: "EN",
  nl: "NL",
  fr: "FR",
};

export function resolveLocale(
  preferredLocale: string | null | undefined
): Locale {
  if (preferredLocale && isLocale(preferredLocale)) return preferredLocale;
  return DEFAULT_LOCALE;
}
