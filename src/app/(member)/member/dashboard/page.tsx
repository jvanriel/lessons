import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

export const metadata = { title: "Dashboard — Golf Lessons" };

export default async function MemberDashboard() {
  const session = await getSession();
  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-900">
        {t("member.welcome", locale)}
      </h1>
      <p className="mt-2 text-green-700">{session?.email}</p>
      <div className="mt-8 rounded-xl border border-green-200 bg-white p-6">
        <h2 className="font-display text-xl font-medium text-green-800">
          {t("member.yourLessons", locale)}
        </h2>
        <p className="mt-2 text-sm text-green-600">
          {t("member.noLessons", locale)}
        </p>
      </div>
    </div>
  );
}
