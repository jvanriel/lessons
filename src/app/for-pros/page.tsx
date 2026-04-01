import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

export const metadata = {
  title: "For Pros — Golf Lessons",
  description:
    "Grow your coaching business. Manage bookings, share tips and videos, and build lasting relationships with your students.",
};

const features = [
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
      </svg>
    ),
    titleKey: "pros.feature1.title",
    descKey: "pros.feature1.desc",
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
      </svg>
    ),
    titleKey: "pros.feature2.title",
    descKey: "pros.feature2.desc",
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    ),
    titleKey: "pros.feature3.title",
    descKey: "pros.feature3.desc",
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
    titleKey: "pros.feature4.title",
    descKey: "pros.feature4.desc",
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
      </svg>
    ),
    titleKey: "pros.feature5.title",
    descKey: "pros.feature5.desc",
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
    titleKey: "pros.feature6.title",
    descKey: "pros.feature6.desc",
  },
];

export default async function ForProsPage() {
  const locale = await getLocale();

  return (
    <div className="bg-cream">
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <span className="inline-block rounded-full bg-gold-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-gold-700">
          {t("pros.badge", locale)}
        </span>
        <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight text-green-900 sm:text-5xl">
          {t("pros.hero.title", locale)}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-green-700">
          {t("pros.hero.subtitle", locale)}
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/contact"
            className="rounded-md bg-gold-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gold-500"
          >
            {t("pros.hero.cta", locale)}
          </Link>
        </div>
      </section>

      {/* Platform features */}
      <section className="border-t border-green-100 bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center font-display text-3xl font-semibold text-green-900">
            {t("pros.features.heading", locale)}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-green-600">
            {t("pros.features.subheading", locale)}
          </p>
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <div
                key={i}
                className="rounded-xl border border-green-200 bg-white p-6 hover:border-green-300 transition-colors"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gold-50 text-gold-600">
                  {f.icon}
                </div>
                <h3 className="font-display text-lg font-medium text-green-800">
                  {t(f.titleKey, locale)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-green-600">
                  {t(f.descKey, locale)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* More than booking */}
      <section className="border-t border-green-100 bg-green-50/50 py-20">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center font-display text-3xl font-semibold text-green-900">
            {t("pros.beyond.heading", locale)}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-green-700">
            {t("pros.beyond.subheading", locale)}
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="rounded-xl border border-green-200 bg-white p-5"
              >
                <h3 className="font-display text-base font-medium text-green-800">
                  {t(`pros.beyond${n}.title`, locale)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-green-600">
                  {t(`pros.beyond${n}.desc`, locale)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing hint + CTA */}
      <section className="border-t border-green-100 bg-white py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="font-display text-3xl font-semibold text-green-900">
            {t("pros.cta.title", locale)}
          </h2>
          <p className="mt-4 text-green-700">
            {t("pros.cta.desc", locale)}
          </p>
          <Link
            href="/contact"
            className="mt-8 inline-block rounded-md bg-gold-600 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-gold-500"
          >
            {t("pros.cta.button", locale)}
          </Link>
        </div>
      </section>
    </div>
  );
}
