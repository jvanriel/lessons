import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { proProfiles, proPages } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { ProPageSection } from "@/lib/db/schema";

interface Props {
  params: Promise<{ slug: string; pageSlug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug, pageSlug } = await params;

  const [pro] = await db
    .select({ id: proProfiles.id, displayName: proProfiles.displayName })
    .from(proProfiles)
    .where(and(eq(proProfiles.slug, slug), eq(proProfiles.published, true)))
    .limit(1);

  if (!pro) return { title: "Not found" };

  const [page] = await db
    .select({ title: proPages.title, metaDescription: proPages.metaDescription })
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

  return {
    title: `${page.title} — ${pro.displayName} — Golf Lessons`,
    description: page.metaDescription,
  };
}

export default async function ProFlyerPage({ params }: Props) {
  const { slug, pageSlug } = await params;

  const [pro] = await db
    .select({
      id: proProfiles.id,
      displayName: proProfiles.displayName,
      photoUrl: proProfiles.photoUrl,
      slug: proProfiles.slug,
    })
    .from(proProfiles)
    .where(and(eq(proProfiles.slug, slug), eq(proProfiles.published, true)))
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
            href={`/pros/${pro.slug}`}
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
            {page.title}
          </h1>
        </div>
      </section>

      {/* Intro */}
      {page.intro && (
        <section className="mx-auto max-w-4xl px-6 py-10">
          <p className="whitespace-pre-line text-lg leading-relaxed text-green-700">
            {page.intro}
          </p>
        </section>
      )}

      {/* Sections */}
      {sections
        .filter((s) => s.visible)
        .map((section) => (
          <section
            key={section.id}
            className="mx-auto max-w-4xl border-t border-green-100 px-6 py-10"
          >
            {section.title && (
              <h2 className="font-display text-2xl font-semibold text-green-900">
                {section.title}
              </h2>
            )}
            {section.type === "text" && section.content && (
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-green-600">
                {section.content}
              </p>
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
                {section.content}
              </blockquote>
            )}
          </section>
        ))}

      {/* CTA */}
      {(page.ctaLabel || page.ctaUrl || page.ctaEmail) && (
        <section className="border-t border-green-100 bg-white py-16">
          <div className="mx-auto max-w-3xl px-6 text-center">
            {page.ctaUrl ? (
              <Link
                href={page.ctaUrl}
                className="inline-block rounded-md bg-gold-600 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-gold-500"
              >
                {page.ctaLabel || "Learn More"}
              </Link>
            ) : page.ctaEmail ? (
              <a
                href={`mailto:${page.ctaEmail}`}
                className="inline-block rounded-md bg-gold-600 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-gold-500"
              >
                {page.ctaLabel || "Contact"}
              </a>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
