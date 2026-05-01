import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

export const metadata = { title: "Email verified — Golf Lessons" };

export default async function EmailVerifiedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; email?: string }>;
}) {
  const { status, email } = await searchParams;
  const locale = await getLocale();
  const isError = status === "error";

  const title = isError
    ? t("emailVerified.title.error", locale)
    : t("emailVerified.title.success", locale);

  const body = isError
    ? t("emailVerified.body.error", locale)
    : email
      ? t("emailVerified.bodyWithEmail.success", locale).replace(
          "{email}",
          email
        )
      : t("emailVerified.body.success", locale);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#faf7f0] px-6 py-16">
      <div className="w-full max-w-md rounded-xl border border-green-200 bg-white p-8 text-center shadow-sm">
        {isError ? (
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <svg
              className="h-7 w-7 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </div>
        ) : (
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold-100">
            <svg
              className="h-7 w-7 text-gold-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m4.5 12.75 6 6 9-13.5"
              />
            </svg>
          </div>
        )}

        <h1 className="mt-5 font-display text-2xl font-semibold text-green-950">
          {title}
        </h1>
        <p className="mt-3 text-sm text-green-700/80">{body}</p>

        <div className="mt-7">
          <Link
            href="/login"
            className="inline-block rounded-md bg-gold-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-500"
          >
            {t("emailVerified.signIn", locale)}
          </Link>
        </div>
      </div>
    </main>
  );
}
