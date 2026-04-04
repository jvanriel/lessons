import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import { getCmsData } from "@/lib/cms";
import CmsBlock from "@/components/cms/CmsBlock";
import CmsPageInit from "@/components/cms/CmsPageInit";

export const metadata = {
  title: "For Students — Golf Lessons",
  description:
    "Sign up for free and book lessons with certified golf professionals. Get personalized coaching, tips, videos, and more.",
};

const PAGE = "for-students";

const featureIcons = [
  <svg key="1" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>,
  <svg key="2" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>,
  <svg key="3" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>,
  <svg key="4" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>,
  <svg key="5" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>,
  <svg key="6" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>,
];

export default async function ForStudentsPage() {
  const locale = await getLocale();
  const cms = await getCmsData(PAGE, locale);

  return (
    <div className="bg-cream">
      <CmsPageInit pageSlug={PAGE} blocks={cms} />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <CmsBlock page={PAGE} block="hero.badge" content={cms["hero.badge"]} fallback={t("students.badge", locale)} as="span" className="inline-block rounded-full bg-green-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-green-700" />
        <CmsBlock page={PAGE} block="hero.title" content={cms["hero.title"]} fallback={t("students.hero.title", locale)} as="h1" className="mt-6 font-display text-4xl font-semibold tracking-tight text-green-900 sm:text-5xl" />
        <CmsBlock page={PAGE} block="hero.subtitle" content={cms["hero.subtitle"]} fallback={t("students.hero.subtitle", locale)} as="p" className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-green-700" />
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link href="/register" className="rounded-md bg-gold-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gold-500">
            <CmsBlock page={PAGE} block="hero.cta" content={cms["hero.cta"]} fallback={t("students.hero.cta", locale)} />
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-green-100 bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <CmsBlock page={PAGE} block="features.heading" content={cms["features.heading"]} fallback={t("students.features.heading", locale)} as="h2" className="text-center font-display text-3xl font-semibold text-green-900" />
          <CmsBlock page={PAGE} block="features.subheading" content={cms["features.subheading"]} fallback={t("students.features.subheading", locale)} as="p" className="mx-auto mt-4 max-w-2xl text-center text-green-600" />
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="rounded-xl border border-green-200 bg-white p-6 hover:border-green-300 transition-colors">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-50 text-green-600">{featureIcons[n - 1]}</div>
                <CmsBlock page={PAGE} block={`feature${n}.title`} content={cms[`feature${n}.title`]} fallback={t(`students.feature${n}.title`, locale)} as="h3" className="font-display text-lg font-medium text-green-800" />
                <CmsBlock page={PAGE} block={`feature${n}.desc`} content={cms[`feature${n}.desc`]} fallback={t(`students.feature${n}.desc`, locale)} as="p" className="mt-2 text-sm leading-relaxed text-green-600" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="border-t border-green-100 bg-green-50/50 py-20">
        <div className="mx-auto max-w-4xl px-6">
          <CmsBlock page={PAGE} block="steps.heading" content={cms["steps.heading"]} fallback={t("students.steps.heading", locale)} as="h2" className="text-center font-display text-3xl font-semibold text-green-900" />
          <div className="mt-12 space-y-8">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="flex gap-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-600 font-display text-lg font-semibold text-white">{n}</div>
                <div>
                  <CmsBlock page={PAGE} block={`step${n}.title`} content={cms[`step${n}.title`]} fallback={t(`students.step${n}.title`, locale)} as="h3" className="font-display text-lg font-medium text-green-800" />
                  <CmsBlock page={PAGE} block={`step${n}.desc`} content={cms[`step${n}.desc`]} fallback={t(`students.step${n}.desc`, locale)} as="p" className="mt-1 text-sm leading-relaxed text-green-600" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-green-100 bg-white py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <CmsBlock page={PAGE} block="cta.title" content={cms["cta.title"]} fallback={t("students.cta.title", locale)} as="h2" className="font-display text-3xl font-semibold text-green-900" />
          <CmsBlock page={PAGE} block="cta.desc" content={cms["cta.desc"]} fallback={t("students.cta.desc", locale)} as="p" className="mt-4 text-green-700" />
          <Link href="/register" className="mt-8 inline-block rounded-md bg-gold-600 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-gold-500">
            <CmsBlock page={PAGE} block="cta.button" content={cms["cta.button"]} fallback={t("students.cta.button", locale)} />
          </Link>
        </div>
      </section>
    </div>
  );
}
