import { PageLoading } from "@/components/Spinner";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

export default async function AdminLoading() {
  const locale = await getLocale();
  return <PageLoading message={t("common.loading", locale)} />;
}
