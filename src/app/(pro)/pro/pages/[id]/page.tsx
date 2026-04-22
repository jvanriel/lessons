import { notFound } from "next/navigation";
import { requireProProfile } from "@/lib/pro";
import { getProPage } from "../actions";
import { getLocale } from "@/lib/locale";
import type { ProPageSection, ProPageTranslation } from "@/lib/db/schema";
import PageEditor from "./PageEditor";

export const metadata = { title: "Edit page — Golf Lessons" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProPageEditorRoute({ params }: Props) {
  const { profile } = await requireProProfile();
  if (!profile) notFound();

  const { id } = await params;
  const pageId = Number.parseInt(id, 10);
  if (!Number.isFinite(pageId)) notFound();

  const page = await getProPage(pageId);
  if (!page) notFound();

  const locale = await getLocale();

  return (
    <PageEditor
      proId={profile.id}
      locale={locale}
      page={{
        id: page.id,
        slug: page.slug,
        title: page.title,
        metaDescription: page.metaDescription,
        heroImage: page.heroImage,
        intro: page.intro,
        sections: (page.sections as ProPageSection[] | null) ?? [],
        ctaLabel: page.ctaLabel,
        ctaUrl: page.ctaUrl,
        ctaEmail: page.ctaEmail,
        translations:
          (page.translations as Record<string, ProPageTranslation> | null) ??
          {},
        published: page.published,
      }}
    />
  );
}
