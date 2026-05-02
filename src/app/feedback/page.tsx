import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import { formatDate } from "@/lib/format-date";
import FeedbackForm from "./FeedbackForm";
import { getMyFeedback } from "./actions";

export const metadata = { title: "Feedback — Golf Lessons" };

export default async function FeedbackPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const locale = await getLocale();
  const myFeedback = await getMyFeedback();

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-3xl font-medium text-green-900">
        {t("feedback.title", locale)}
      </h1>
      <p className="mt-2 text-sm text-green-600">
        {t("feedback.subtitle", locale)}
      </p>

      <section className="mt-8 rounded-xl border border-green-200 bg-white p-5">
        <h2 className="font-display text-lg font-medium text-green-900">
          {t("feedback.formHeading", locale)}
        </h2>
        <p className="mt-1 text-sm text-green-500">
          {t("feedback.formHint", locale)}
        </p>
        <div className="mt-4">
          <FeedbackForm locale={locale} />
        </div>
      </section>

      {myFeedback.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-lg font-medium text-green-900">
            {t("feedback.historyHeading", locale)}
          </h2>
          <ol className="mt-4 space-y-4">
            {myFeedback.map((f) => (
              <li
                key={f.id}
                className="rounded-xl border border-green-200 bg-white p-5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs uppercase text-green-500">
                    {formatDate(f.createdAt, locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                  <span
                    className={
                      f.status === "responded"
                        ? "rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800"
                        : f.status === "closed"
                          ? "rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                          : "rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
                    }
                  >
                    {t(`feedback.status.${f.status}`, locale)}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-green-900">
                  {f.message}
                </p>
                {f.adminResponse && (
                  <div className="mt-4 rounded-lg border-l-4 border-green-700 bg-green-50/60 px-4 py-3">
                    <p className="text-xs uppercase text-green-500">
                      {t("feedback.responseLabel", locale)}
                      {f.respondedAt && (
                        <span className="ml-2 normal-case text-green-400">
                          ·{" "}
                          {formatDate(f.respondedAt, locale, {
                            dateStyle: "medium",
                          })}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-green-900">
                      {f.adminResponse}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
