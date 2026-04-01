import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

export default async function Home() {
  const locale = await getLocale();

  return (
    <div className="bg-cream">
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h1 className="font-display text-5xl font-semibold tracking-tight text-green-900 sm:text-6xl">
          {t("home.hero.title", locale)}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-green-700">
          {t("home.hero.subtitle", locale)}
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/register"
            className="rounded-md bg-gold-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gold-500"
          >
            {t("home.hero.cta", locale)}
          </Link>
          <Link
            href="/contact"
            className="rounded-md border border-green-300 px-6 py-3 text-sm font-medium text-green-700 transition-colors hover:border-green-400 hover:bg-green-50"
          >
            {t("home.hero.contact", locale)}
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-green-100 bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center font-display text-3xl font-semibold text-green-900">
            {t("home.howItWorks", locale)}
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {[
              {
                title: t("home.findPro.title", locale),
                description: t("home.findPro.desc", locale),
              },
              {
                title: t("home.bookLesson.title", locale),
                description: t("home.bookLesson.desc", locale),
              },
              {
                title: t("home.improveGame.title", locale),
                description: t("home.improveGame.desc", locale),
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-green-200 bg-white p-6 hover:border-green-300"
              >
                <h3 className="font-display text-xl font-medium text-green-800">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-green-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-green-100 bg-green-50 py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="font-display text-3xl font-semibold text-green-900">
            {t("home.proCta.title", locale)}
          </h2>
          <p className="mt-4 text-green-700">
            {t("home.proCta.desc", locale)}
          </p>
          <Link
            href="/contact"
            className="mt-8 inline-block rounded-md bg-gold-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gold-500"
          >
            {t("home.proCta.cta", locale)}
          </Link>
        </div>
      </section>
    </div>
  );
}
