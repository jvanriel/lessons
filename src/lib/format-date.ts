import type { Locale } from "@/lib/i18n";

const LOCALE_TAGS: Record<Locale, string> = {
  nl: "nl-BE",
  fr: "fr-BE",
  en: "en-GB",
};

/**
 * Format an ISO date string ("YYYY-MM-DD") or Date for display in the user's
 * preferred locale. Belgian date conventions for nl/fr.
 */
export function formatDate(
  input: string | Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }
): string {
  const date =
    typeof input === "string" ? new Date(input + "T00:00:00") : input;
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], options).format(date);
}
