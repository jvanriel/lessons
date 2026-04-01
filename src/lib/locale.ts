import { cookies } from "next/headers";
import { isLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("locale")?.value ?? DEFAULT_LOCALE;
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}
