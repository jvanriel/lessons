import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { proProfiles, proPages } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import type { ProPageSection, ProPageTranslation } from "@/lib/db/schema";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import { sanitizeHtml } from "@/lib/sanitize-html";

const SOURCE_LOCALE = "nl";

interface Props {
  params: Promise<{ proId: string; pageSlug: string }>;
}

// Styles for HTML rendered out of the TipTap editor. Tailwind
// arbitrary-variant selectors match the tags TipTap emits so we don't
// need a global stylesheet for just this bit of pro-editable content.
const richTextClasses =
  "[&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-green-900 [&_h2]:mt-6 [&_h2]:mb-3" +
  " [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-green-900 [&_h3]:mt-5 [&_h3]:mb-2" +
  " [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2" +
  " [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_li]:my-1" +
  " [&_a]:text-gold-600 [&_a]:underline hover:[&_a]:text-gold-500" +
  " [&_strong]:font-semibold [&_em]:italic";

export async function generateMetadata({ params }: Props) {
  const { proId, pageSlug } = await params;
  const id = Number.parseInt(proId, 10);
  if (!Number.isFinite(id)) return { title: "Not found" };

  const [pro] = await db
    .select({ id: proProfiles.id, displayName: proProfiles.displayName })
    .from(proProfiles)
    .where(and(eq(proProfiles.id, id), eq(proProfiles.published, true), isNull(proProfiles.deletedAt)))
    .limit(1);

  if (!pro) return { title: "Not found" };

  const [page] = await db
    .select({
      title: proPages.title,
      metaDescription: proPages.metaDescription,
      translations: proPages.translations,
    })
    .from(proPages)
    .where(
      and(
        eq(proPages.proProfileId, pro.id),
        eq(proPages.slug, pageSlug),
        eq(proPages.published, true)
      )
    )
    .limit(1);

  if (!page) return { title: "Not found" };

  const locale = await getLocale();
  const translations =
    (page.translations as Record<string, ProPageTranslation> | null) ?? {};
  const tr =
    locale === SOURCE_LOCALE ? null : translations[locale] ?? null;
  const title = tr?.title ?? page.title;
  const metaDescription = tr?.metaDescription ?? page.metaDescription;

  return {
    title: `${title} — ${pro.displayName} — Golf Lessons`,
    description: metaDescription,
  };
}

export default async function ProFlyerPage({ params }: Props) {
  const { proId, pageSlug } = await params;
  const locale = await getLocale();
  const id = Number.parseInt(proId, 10);
  if (!Number.isFinite(id)) notFound();

  const [pro] = await db
    .select({
      id: proProfiles.id,
      displayName: proProfiles.displayName,
      photoUrl: proProfiles.photoUrl,
    })
    .from(proProfiles)
    .where(and(eq(proProfiles.id, id), eq(proProfiles.published, true), isNull(proProfiles.deletedAt)))
    .limit(1);

  if (!pro) notFound();

  const [page] = await db
    .select()
    .from(proPages)
    .where(
      and(
        eq(proPages.proProfileId, pro.id),
        eq(proPages.slug, pageSlug),
        eq(proPages.published, true)
      )
    )
    .limit(1);

  if (!page) notFound();

  const sections = (page.sections ?? []) as ProPageSection[];

  // Pick a translation override for the visitor's locale, falling back
  // to the NL source for any field they haven't translated yet.
  const translations =
    (page.translations as Record<string, ProPageTranslation> | null) ?? {};
  const tr: ProPageTranslation =
    locale === SOURCE_LOCALE ? {} : translations[locale] ?? {};
  const displayTitle = tr.title ?? page.title;
  const displayMeta = tr.metaDescription ?? page.metaDescription;
  const displayIntro = tr.intro ?? page.intro;
  const displayCtaLabel = tr.ctaLabel ?? page.ctaLabel;
  void displayMeta;

  return (
    <div className="bg-cream">
      {/* Hero */}
      <section className="relative">
        {page.heroImage && (
          <div className="absolute inset-0 h-72">
            <img
              src={page.heroImage}
              alt={page.title}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-green-950/60 to-green-950/90" />
          </div>
        )}
        <div
          className={`relative mx-auto max-w-4xl px-6 ${page.heroImage ? "pb-12 pt-20" : "py-16"}`}
        >
          <Link
            href={`/pros/${pro.id}`}
            className="mb-4 inline-flex items-center gap-2 text-sm text-green-100/60 hover:text-gold-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            {pro.displayName}
          </Link>
          <h1
            className={`font-display text-4xl font-semibold ${page.heroImage ? "text-white" : "text-green-900"}`}
          >
            {displayTitle}
          </h1>
        </div>
      </section>

      {/* Language notice + Intro */}
      <section className="mx-auto max-w-4xl px-6 pt-6">
        <p className="text-[11px] italic text-green-400">
          {t("pro.contentLanguageNotice", locale)}
        </p>
      </section>
      {displayIntro && (
        <section className="mx-auto max-w-4xl px-6 pb-10 pt-4">
          <div
            className={`${richTextClasses} text-lg leading-relaxed text-green-700`}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(displayIntro) }}
          />
        </section>
      )}

      {/* Sections */}
      {sections
        .filter((s) => s.visible)
        .map((section) => {
          const trSec = tr.sections?.[section.id];
          const sectionTitle = trSec?.title ?? section.title;
          const sectionContent = trSec?.content ?? section.content;
          return (
          <section
            key={section.id}
            className="mx-auto max-w-4xl border-t border-green-100 px-6 py-10"
          >
            {sectionTitle && (
              <h2 className="font-display text-2xl font-semibold text-green-900">
                {sectionTitle}
              </h2>
            )}
            {section.type === "text" && sectionContent && (
              <div
                className={`${richTextClasses} mt-4 text-sm leading-relaxed text-green-600`}
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(sectionContent),
                }}
              />
            )}
            {section.type === "gallery" &&
              section.media &&
              section.media.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {section.media.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt=""
                      className="rounded-lg object-cover"
                    />
                  ))}
                </div>
              )}
            {section.type === "video" &&
              section.media &&
              section.media[0] && (
                <div className="mt-4 aspect-video overflow-hidden rounded-lg">
                  <iframe
                    src={section.media[0]}
                    className="h-full w-full"
                    allowFullScreen
                  />
                </div>
              )}
            {section.type === "pricing" && section.content && (
              <div className="mt-4 rounded-xl border border-gold-200 bg-gold-50 p-6">
                <p className="whitespace-pre-line text-sm text-green-700">
                  {section.content}
                </p>
              </div>
            )}
            {section.type === "testimonial" && section.content && (
              <blockquote className="mt-4 border-l-4 border-gold-400 pl-4 text-sm italic text-green-600">
                {sectionContent}
              </blockquote>
            )}
          </section>
          );
        })}

      {/* CTA */}
      {(page.ctaLabel || page.ctaUrl || page.ctaEmail) && (
        <section className="border-t border-green-100 bg-white py-16">
          <div className="mx-auto max-w-3xl px-6 text-center">
            {page.ctaUrl ? (
              <Link
                href={page.ctaUrl}
                className="inline-block rounded-md bg-gold-600 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-gold-500"
              >
                {displayCtaLabel || "Learn More"}
              </Link>
            ) : page.ctaEmail ? (
              <a
                href={`mailto:${page.ctaEmail}`}
                className="inline-block rounded-md bg-gold-600 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-gold-500"
              >
                {displayCtaLabel || "Contact"}
              </a>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
