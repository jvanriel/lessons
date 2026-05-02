import { PageLoading } from "@/components/Spinner";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

/**
 * Root-level loading boundary. Next.js renders this in a Suspense
 * fallback while any route segment beneath it (without its own
 * `loading.tsx`) is fetching data or compiling. Keeps users from
 * staring at a blank screen during slow backend responses or after
 * a fresh deploy/cold-start.
 */
export default async function RootLoading() {
  const locale = await getLocale();
  return <PageLoading message={t("common.loading", locale)} />;
}
