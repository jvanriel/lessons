import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import { getCmsData } from "@/lib/cms";
import { getSession, hasRole } from "@/lib/auth";
import CmsBlock from "@/components/cms/CmsBlock";
import CmsPageInit from "@/components/cms/CmsPageInit";

const PAGE = "home";

export default async function Home() {
  const session = await getSession();
  if (session) {
    if (hasRole(session, "pro")) redirect("/pro/dashboard");
    if (hasRole(session, "admin")) redirect("/admin/users");
    redirect("/member/dashboard");
  }

  const locale = await getLocale();
  const cms = await getCmsData(PAGE, locale);

  return (
    <div className="bg-cream">
      <CmsPageInit pageSlug={PAGE} blocks={cms} />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <CmsBlock page={PAGE} block="hero.title" content={cms["hero.title"]} fallback={t("home.hero.title", locale)} as="h1" className="font-display text-5xl font-semibold tracking-tight text-green-900 sm:text-6xl" />
        <CmsBlock page={PAGE} block="hero.subtitle" content={cms["hero.subtitle"]} fallback={t("home.hero.subtitle", locale)} as="p" className="mx-auto mt-6 max-w-2xl text-lg text-green-700" />
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link href="/register" className="rounded-md bg-gold-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gold-500">
            <CmsBlock page={PAGE} block="hero.cta" content={cms["hero.cta"]} fallback={t("home.hero.cta", locale)} />
          </Link>
          <Link href="/contact" className="rounded-md border border-green-300 px-6 py-3 text-sm font-medium text-green-700 transition-colors hover:border-green-400 hover:bg-green-50">
            <CmsBlock page={PAGE} block="hero.contact" content={cms["hero.contact"]} fallback={t("home.hero.contact", locale)} />
          </Link>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-green-100 bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <CmsBlock page={PAGE} block="howItWorks.heading" content={cms["howItWorks.heading"]} fallback={t("home.howItWorks", locale)} as="h2" className="text-center font-display text-3xl font-semibold text-green-900" />
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {([
              { block: "howItWorks.step1", tTitle: "home.findPro.title", tDesc: "home.findPro.desc" },
              { block: "howItWorks.step2", tTitle: "home.bookLesson.title", tDesc: "home.bookLesson.desc" },
              { block: "howItWorks.step3", tTitle: "home.improveGame.title", tDesc: "home.improveGame.desc" },
            ]).map((s) => (
              <div key={s.block} className="rounded-xl border border-green-200 bg-white p-6 hover:border-green-300">
                <CmsBlock page={PAGE} block={`${s.block}.title`} content={cms[`${s.block}.title`]} fallback={t(s.tTitle, locale)} as="h3" className="font-display text-xl font-medium text-green-800" />
                <CmsBlock page={PAGE} block={`${s.block}.desc`} content={cms[`${s.block}.desc`]} fallback={t(s.tDesc, locale)} as="p" className="mt-3 text-sm leading-relaxed text-green-600" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-green-100 bg-green-50 py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <CmsBlock page={PAGE} block="proCta.title" content={cms["proCta.title"]} fallback={t("home.proCta.title", locale)} as="h2" className="font-display text-3xl font-semibold text-green-900" />
          <CmsBlock page={PAGE} block="proCta.desc" content={cms["proCta.desc"]} fallback={t("home.proCta.desc", locale)} as="p" className="mt-4 text-green-700" />
          <Link href="/contact" className="mt-8 inline-block rounded-md bg-gold-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gold-500">
            <CmsBlock page={PAGE} block="proCta.cta" content={cms["proCta.cta"]} fallback={t("home.proCta.cta", locale)} />
          </Link>
        </div>
      </section>
    </div>
  );
}
