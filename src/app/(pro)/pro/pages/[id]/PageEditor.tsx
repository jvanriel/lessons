"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveProPage, togglePublishProPage } from "../actions";
import {
  translateProPage,
  saveProPageTranslation,
} from "../translate-actions";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";
import { LOCALES } from "@/lib/i18n";
import type { ProPageSection, ProPageTranslation } from "@/lib/db/schema";
import RichTextEditor from "@/components/RichTextEditor";
import PagePreview from "./PagePreview";

interface EditablePage {
  id: number;
  slug: string;
  title: string;
  metaDescription: string | null;
  heroImage: string | null;
  intro: string | null;
  sections: ProPageSection[];
  ctaLabel: string | null;
  ctaUrl: string | null;
  ctaEmail: string | null;
  translations: Record<string, ProPageTranslation>;
  published: boolean;
}

const SOURCE_LOCALE: Locale = "nl";

type SaveStatus = "idle" | "saving" | "saved" | "error";

// Inputs that are harmless to keep as uncontrolled textareas but we
// still want to tokenise into the shared state — use these small wrappers
// so each field renders cheaply.
const fieldClass =
  "mt-1 w-full rounded-md border border-green-300 bg-white px-3 py-2 text-sm text-green-900 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";
const textareaClass =
  "mt-1 w-full rounded-md border border-green-300 bg-white px-3 py-2 text-sm text-green-900 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

export default function PageEditor({
  proId,
  locale,
  page: initialPage,
}: {
  proId: number;
  locale: Locale;
  page: EditablePage;
}) {
  const router = useRouter();
  const [page, setPage] = useState<EditablePage>(initialPage);
  const [translations, setTranslations] = useState<
    Record<string, ProPageTranslation>
  >(initialPage.translations ?? {});
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [publishPending, startPublishTransition] = useTransition();

  // Which locale the editor is currently showing. NL is always the
  // source of truth; EN/FR edit the stored translation overrides.
  const [viewLocale, setViewLocale] = useState<Locale>(SOURCE_LOCALE);
  const [translatePending, setTranslatePending] = useState<Locale | null>(null);
  // Bumps whenever the backing DB has been updated. The preview iframe
  // keys off this so it only reloads once a change has landed in the
  // store, not on every keystroke.
  const [previewVersion, setPreviewVersion] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const firstRunRef = useRef(true);
  const translationDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const translationFirstRunRef = useRef(true);

  // Debounced auto-save for the source (NL) fields. Skips first mount.
  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setStatus("saving");
      setError(null);
      const result = await saveProPage({
        pageId: page.id,
        title: page.title,
        metaDescription: page.metaDescription,
        heroImage: page.heroImage,
        intro: page.intro,
        sections: page.sections,
        ctaLabel: page.ctaLabel,
        ctaUrl: page.ctaUrl,
        ctaEmail: page.ctaEmail,
      });
      if (result.error) {
        setStatus("error");
        setError(result.error);
      } else {
        setStatus("saved");
        setPreviewVersion((v) => v + 1);
        setTimeout(() => setStatus("idle"), 1500);
      }
    }, 2000);
    return () => clearTimeout(debounceRef.current);
  }, [page]);

  // Debounced auto-save for translations. Writes whichever locale the
  // editor is currently showing — the user only edits one at a time.
  useEffect(() => {
    if (translationFirstRunRef.current) {
      translationFirstRunRef.current = false;
      return;
    }
    if (viewLocale === SOURCE_LOCALE) return;
    clearTimeout(translationDebounceRef.current);
    const snapshot = translations[viewLocale] ?? {};
    const locale = viewLocale;
    translationDebounceRef.current = setTimeout(async () => {
      setStatus("saving");
      setError(null);
      const result = await saveProPageTranslation(page.id, locale, snapshot);
      if (result.error) {
        setStatus("error");
        setError(result.error);
      } else {
        setStatus("saved");
        setPreviewVersion((v) => v + 1);
        setTimeout(() => setStatus("idle"), 1500);
      }
    }, 2000);
    return () => clearTimeout(translationDebounceRef.current);
  }, [translations, viewLocale, page.id]);

  const isTranslating = viewLocale !== SOURCE_LOCALE;
  const currentTranslation: ProPageTranslation =
    translations[viewLocale] ?? {};

  const update = useCallback(
    <K extends keyof EditablePage>(key: K, value: EditablePage[K]) => {
      setPage((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const updateSection = useCallback(
    (sectionId: string, patch: Partial<ProPageSection>) => {
      setPage((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId ? { ...s, ...patch } : s,
        ),
      }));
    },
    [],
  );

  // ─── Translation helpers ──────────────────────────
  type TranslatableField = "title" | "metaDescription" | "intro" | "ctaLabel";

  function displayField(key: TranslatableField): string {
    const source = (page[key] ?? "") as string;
    if (!isTranslating) return source;
    return currentTranslation[key] ?? "";
  }

  function setField(key: TranslatableField, value: string) {
    if (!isTranslating) {
      update(key, value as EditablePage[TranslatableField]);
      return;
    }
    setTranslations((prev) => ({
      ...prev,
      [viewLocale]: { ...(prev[viewLocale] ?? {}), [key]: value },
    }));
  }

  function displaySectionField(
    sectionId: string,
    field: "title" | "content",
    sourceValue: string,
  ): string {
    if (!isTranslating) return sourceValue;
    return currentTranslation.sections?.[sectionId]?.[field] ?? "";
  }

  function setSectionField(
    sectionId: string,
    field: "title" | "content",
    value: string,
  ) {
    if (!isTranslating) {
      updateSection(sectionId, { [field]: value });
      return;
    }
    setTranslations((prev) => {
      const loc: ProPageTranslation = { ...(prev[viewLocale] ?? {}) };
      const secs = { ...(loc.sections ?? {}) };
      secs[sectionId] = { ...(secs[sectionId] ?? {}), [field]: value };
      loc.sections = secs;
      return { ...prev, [viewLocale]: loc };
    });
  }

  async function handleTranslate() {
    if (!isTranslating) return;
    setTranslatePending(viewLocale);
    setError(null);
    // Make sure any unsaved source edits are persisted before Claude
    // reads from the DB.
    await saveProPage({
      pageId: page.id,
      title: page.title,
      metaDescription: page.metaDescription,
      heroImage: page.heroImage,
      intro: page.intro,
      sections: page.sections,
      ctaLabel: page.ctaLabel,
      ctaUrl: page.ctaUrl,
      ctaEmail: page.ctaEmail,
    });
    const result = await translateProPage(page.id, viewLocale);
    setTranslatePending(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const addSection = useCallback((type: ProPageSection["type"]) => {
    setPage((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          id: crypto.randomUUID().slice(0, 8),
          type,
          title: "",
          content: "",
          media: [],
          mediaPosition: "right",
          visible: true,
        },
      ],
    }));
  }, []);

  const removeSection = useCallback((sectionId: string) => {
    setPage((prev) => ({
      ...prev,
      sections: prev.sections.filter((s) => s.id !== sectionId),
    }));
  }, []);

  const moveSection = useCallback((sectionId: string, dir: -1 | 1) => {
    setPage((prev) => {
      const idx = prev.sections.findIndex((s) => s.id === sectionId);
      if (idx < 0) return prev;
      const next = [...prev.sections];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= next.length) return prev;
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return { ...prev, sections: next };
    });
  }, []);

  function handleTogglePublish() {
    startPublishTransition(async () => {
      // Make sure the latest state is on the server before publishing
      await saveProPage({
        pageId: page.id,
        title: page.title,
        metaDescription: page.metaDescription,
        heroImage: page.heroImage,
        intro: page.intro,
        sections: page.sections,
        ctaLabel: page.ctaLabel,
        ctaUrl: page.ctaUrl,
        ctaEmail: page.ctaEmail,
      });
      const result = await togglePublishProPage(page.id, !page.published);
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      setPage((prev) => ({ ...prev, published: !prev.published }));
      router.refresh();
    });
  }

  async function handleHeroUpload(file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("pageId", String(page.id));
    const res = await fetch("/api/pro/pages/upload-media", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    update("heroImage", data.url as string);
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/pro/pages"
            className="mb-1 inline-flex items-center gap-1 text-xs text-green-500 hover:text-green-700"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            {t("proPages.back", locale)}
          </Link>
          <h1 className="font-display text-2xl font-semibold text-green-900">
            {page.title || t("proPages.untitled", locale)}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} locale={locale} />
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              page.published
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {page.published ? t("proPages.published", locale) : t("proPages.draft", locale)}
          </span>
          <button
            type="button"
            onClick={handleTogglePublish}
            disabled={publishPending}
            className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
              page.published
                ? "border-amber-300 bg-white text-amber-700 hover:bg-amber-50"
                : "border-green-600 bg-green-600 text-white hover:bg-green-500"
            }`}
          >
            {page.published
              ? t("proPages.unpublish", locale)
              : t("proPages.publish", locale)}
          </button>
          {page.published && (
            <Link
              href={`/pros/${proId}/${page.slug}`}
              target="_blank"
              className="text-xs font-medium text-gold-600 hover:text-gold-500"
            >
              {t("proPages.view", locale)} →
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 lg:grid lg:grid-cols-[1fr,minmax(0,520px)] lg:gap-6 lg:items-start">
        <div className="min-w-0">

      {/* Locale tabs */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {LOCALES.map((l) => {
          const isActive = l === viewLocale;
          return (
            <button
              key={l}
              type="button"
              onClick={() => setViewLocale(l)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-green-800 text-white"
                  : "bg-green-50 text-green-600 hover:bg-green-100"
              }`}
            >
              {l === SOURCE_LOCALE
                ? `${l.toUpperCase()} · ${t("proPages.source", locale)}`
                : l.toUpperCase()}
            </button>
          );
        })}
        {isTranslating && (
          <button
            type="button"
            onClick={handleTranslate}
            disabled={translatePending === viewLocale}
            className="ml-auto rounded-md border border-gold-300 bg-gold-50 px-3 py-1 text-xs font-medium text-gold-700 hover:bg-gold-100 disabled:opacity-50"
          >
            {translatePending === viewLocale
              ? t("proPages.translating", locale)
              : t("proPages.translateFromNl", locale)}
          </button>
        )}
      </div>
      {isTranslating && (
        <p className="mt-2 text-xs text-green-500">
          {t("proPages.translationHint", locale)}
        </p>
      )}

      {/* ── Basics ─────────────────────────────────── */}
      <section className="mt-6 rounded-xl border border-green-200 bg-white p-6">
        <h2 className="font-display text-lg font-medium text-green-900">
          {t("proPages.sectionBasics", locale)}
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-green-700">
              {t("proPages.titleLabel", locale)}
            </label>
            <input
              value={displayField("title")}
              onChange={(e) => setField("title", e.target.value)}
              className={fieldClass}
              placeholder={isTranslating ? page.title : undefined}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-green-700">
              {t("proPages.metaLabel", locale)}
            </label>
            <input
              value={displayField("metaDescription")}
              onChange={(e) => setField("metaDescription", e.target.value)}
              maxLength={300}
              placeholder={
                isTranslating
                  ? page.metaDescription ?? t("proPages.metaPlaceholder", locale)
                  : t("proPages.metaPlaceholder", locale)
              }
              className={fieldClass}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-green-700">
            {t("proPages.introLabel", locale)}
          </label>
          <RichTextEditor
            key={`intro-${viewLocale}`}
            content={displayField("intro")}
            onChange={(html) => setField("intro", html)}
            placeholder={t("proPages.introPlaceholder", locale)}
            minHeight={100}
          />
        </div>

        {/* Hero image — media is shared across locales, only editable
            in the source view. */}
        <div className={`mt-4 ${isTranslating ? "opacity-60 pointer-events-none" : ""}`}>
          <label className="block text-xs font-medium text-green-700">
            {t("proPages.heroLabel", locale)}
          </label>
          <div className="mt-2 flex items-start gap-4">
            {page.heroImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={page.heroImage}
                alt=""
                className="h-28 w-44 rounded-md object-cover ring-1 ring-green-200"
              />
            ) : (
              <div className="flex h-28 w-44 items-center justify-center rounded-md border border-dashed border-green-300 bg-green-50/40 text-xs text-green-500">
                {t("proPages.heroEmpty", locale)}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50">
                {page.heroImage
                  ? t("proPages.heroReplace", locale)
                  : t("proPages.heroUpload", locale)}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try {
                      await handleHeroUpload(file);
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                />
              </label>
              {page.heroImage && (
                <button
                  type="button"
                  onClick={() => update("heroImage", null)}
                  className="text-xs text-red-500 hover:text-red-600"
                >
                  {t("proPages.heroRemove", locale)}
                </button>
              )}
              <p className="text-[11px] text-green-500">
                {t("proPages.heroHint", locale)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Sections ────────────────────────────── */}
      <section className="mt-6 rounded-xl border border-green-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-medium text-green-900">
            {t("proPages.sectionsLabel", locale).replace(
              "{n}",
              String(page.sections.length),
            )}
          </h2>
        </div>

        <div className="mt-4 space-y-3">
          {page.sections.map((section, idx) => (
            <SectionRow
              key={section.id}
              section={section}
              index={idx}
              total={page.sections.length}
              pageId={page.id}
              locale={locale}
              viewLocale={viewLocale}
              isTranslating={isTranslating}
              sectionTitleValue={displaySectionField(
                section.id,
                "title",
                section.title ?? "",
              )}
              sectionContentValue={displaySectionField(
                section.id,
                "content",
                section.content ?? "",
              )}
              onSectionTitleChange={(v) => setSectionField(section.id, "title", v)}
              onSectionContentChange={(v) =>
                setSectionField(section.id, "content", v)
              }
              onUpdate={(patch) => updateSection(section.id, patch)}
              onRemove={() => removeSection(section.id)}
              onMove={(dir) => moveSection(section.id, dir)}
              onUploadError={(msg) => setError(msg)}
            />
          ))}
          {page.sections.length === 0 && (
            <p className="rounded-lg border border-dashed border-green-200 bg-green-50/40 px-4 py-6 text-center text-xs text-green-500">
              {t("proPages.sectionsEmpty", locale)}
            </p>
          )}
        </div>

        {!isTranslating && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => addSection("text")}
              className="rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
            >
              + {t("proPages.addText", locale)}
            </button>
            <button
              type="button"
              onClick={() => addSection("gallery")}
              className="rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
            >
              + {t("proPages.addGallery", locale)}
            </button>
            <button
              type="button"
              onClick={() => addSection("video")}
              className="rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
            >
              + {t("proPages.addVideo", locale)}
            </button>
          </div>
        )}
      </section>

      {/* ── CTA ─────────────────────────────────── */}
      <section className="mt-6 rounded-xl border border-green-200 bg-white p-6">
        <h2 className="font-display text-lg font-medium text-green-900">
          {t("proPages.ctaSection", locale)}
        </h2>
        <p className="mt-1 text-xs text-green-500">
          {t("proPages.ctaHint", locale)}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-green-700">
              {t("proPages.ctaLabelLabel", locale)}
            </label>
            <input
              value={displayField("ctaLabel")}
              onChange={(e) => setField("ctaLabel", e.target.value)}
              placeholder={isTranslating ? page.ctaLabel ?? undefined : undefined}
              className={fieldClass}
            />
          </div>
          <div className={isTranslating ? "opacity-60 pointer-events-none" : ""}>
            <label className="block text-xs font-medium text-green-700">
              {t("proPages.ctaUrlLabel", locale)}
            </label>
            <input
              value={page.ctaUrl ?? ""}
              onChange={(e) => update("ctaUrl", e.target.value)}
              placeholder="https://..."
              className={fieldClass}
            />
          </div>
          <div className={isTranslating ? "opacity-60 pointer-events-none" : ""}>
            <label className="block text-xs font-medium text-green-700">
              {t("proPages.ctaEmailLabel", locale)}
            </label>
            <input
              value={page.ctaEmail ?? ""}
              onChange={(e) => update("ctaEmail", e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
      </section>
        </div>

        <aside className="mt-6 min-w-0 lg:sticky lg:top-6 lg:mt-0 lg:h-[calc(100vh-3rem)]">
          <PagePreview
            previewUrl={`/pros/${proId}/${page.slug}`}
            version={previewVersion}
            locale={viewLocale}
          />
        </aside>
      </div>
    </div>
  );
}

function StatusBadge({ status, locale }: { status: SaveStatus; locale: Locale }) {
  if (status === "saving") {
    return (
      <span className="text-xs text-green-500 animate-pulse">
        {t("proPages.savingStatus", locale)}
      </span>
    );
  }
  if (status === "saved") {
    return <span className="text-xs text-green-600">{t("proPages.savedStatus", locale)}</span>;
  }
  if (status === "error") {
    return <span className="text-xs text-red-600">{t("proPages.errorStatus", locale)}</span>;
  }
  return null;
}

function SectionRow({
  section,
  index,
  total,
  pageId,
  locale,
  viewLocale,
  isTranslating,
  sectionTitleValue,
  sectionContentValue,
  onSectionTitleChange,
  onSectionContentChange,
  onUpdate,
  onRemove,
  onMove,
  onUploadError,
}: {
  section: ProPageSection;
  index: number;
  total: number;
  pageId: number;
  locale: Locale;
  viewLocale: Locale;
  isTranslating: boolean;
  sectionTitleValue: string;
  sectionContentValue: string;
  onSectionTitleChange: (value: string) => void;
  onSectionContentChange: (value: string) => void;
  onUpdate: (patch: Partial<ProPageSection>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onUploadError: (msg: string) => void;
}) {
  async function uploadFile(file: File): Promise<string> {
    const form = new FormData();
    form.append("file", file);
    form.append("pageId", String(pageId));
    const res = await fetch("/api/pro/pages/upload-media", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data.url as string;
  }

  return (
    <div className="rounded-lg border border-green-200 bg-green-50/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded bg-green-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-800">
            {t(`proPages.type.${section.type}`, locale)}
          </span>
          {!isTranslating && (
            <label className="flex items-center gap-1 text-xs text-green-700">
              <input
                type="checkbox"
                checked={section.visible}
                onChange={(e) => onUpdate({ visible: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-green-300 accent-[#c4a035]"
              />
              {t("proPages.visible", locale)}
            </label>
          )}
        </div>
        {!isTranslating && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={index === 0}
              className="rounded border border-green-200 bg-white px-1.5 py-0.5 text-[11px] text-green-600 hover:bg-green-50 disabled:opacity-30"
              title={t("proPages.moveUp", locale)}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={index === total - 1}
              className="rounded border border-green-200 bg-white px-1.5 py-0.5 text-[11px] text-green-600 hover:bg-green-50 disabled:opacity-30"
              title={t("proPages.moveDown", locale)}
            >
              ↓
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="rounded border border-red-200 bg-white px-2 py-0.5 text-[11px] text-red-500 hover:bg-red-50"
            >
              {t("proPages.removeSection", locale)}
            </button>
          </div>
        )}
      </div>

      <div className="mt-3">
        <label className="block text-xs font-medium text-green-700">
          {t("proPages.sectionTitle", locale)}
        </label>
        <input
          value={sectionTitleValue}
          onChange={(e) => onSectionTitleChange(e.target.value)}
          placeholder={isTranslating ? section.title ?? "" : undefined}
          className={fieldClass}
        />
      </div>

      {section.type === "text" && (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-green-700">
            {t("proPages.sectionContent", locale)}
          </label>
          <RichTextEditor
            key={`${section.id}-${viewLocale}`}
            content={sectionContentValue}
            onChange={(html) => onSectionContentChange(html)}
            minHeight={120}
          />
        </div>
      )}

      {section.type === "video" && (
        <div className={`mt-3 ${isTranslating ? "opacity-60 pointer-events-none" : ""}`}>
          <label className="block text-xs font-medium text-green-700">
            {t("proPages.videoUrlLabel", locale)}
          </label>
          <input
            value={section.media?.[0] ?? ""}
            onChange={(e) => onUpdate({ media: [e.target.value] })}
            placeholder="https://www.youtube.com/embed/..."
            className={fieldClass}
          />
        </div>
      )}

      {section.type === "gallery" && (
        <div className={`mt-3 ${isTranslating ? "opacity-60 pointer-events-none" : ""}`}>
          <label className="block text-xs font-medium text-green-700">
            {t("proPages.galleryLabel", locale)}
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(section.media ?? []).map((url, i) => (
              <div key={`${url}-${i}`} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="h-24 w-full rounded-md object-cover ring-1 ring-green-200"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = [...(section.media ?? [])];
                    next.splice(i, 1);
                    onUpdate({ media: next });
                  }}
                  className="absolute right-1 top-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] text-red-500 shadow hover:bg-red-50"
                >
                  ×
                </button>
              </div>
            ))}
            <label className="flex h-24 cursor-pointer items-center justify-center rounded-md border border-dashed border-green-300 bg-white text-xs font-medium text-green-600 hover:bg-green-50">
              + {t("proPages.addImage", locale)}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    const url = await uploadFile(file);
                    onUpdate({ media: [...(section.media ?? []), url] });
                  } catch (err) {
                    onUploadError((err as Error).message);
                  }
                }}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
