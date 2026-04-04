"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useCms } from "@/components/cms/CmsProvider";
import {
  getCmsBlocks,
  saveCmsBlocks,
  getCmsPageVersions,
  getCmsPageVersion,
  restoreCmsPageVersion,
  type CmsPageVersion,
} from "@/app/(admin)/admin/cms/actions";
import {
  translateBlocks,
  translateAllBlocks,
} from "@/app/(admin)/admin/cms/translate-actions";
import { LOCALES, LOCALE_SHORT, type Locale } from "@/lib/i18n";

const CMS_PAGES: { slug: string; label: string; route: string }[] = [
  { slug: "home", label: "Home", route: "/" },
  { slug: "for-students", label: "For Students", route: "/for-students" },
  { slug: "for-pros", label: "For Pros", route: "/for-pros" },
  { slug: "contact", label: "Contact", route: "/contact" },
];

const ROUTE_TO_SLUG: Record<string, string> = {};
const SLUG_TO_ROUTE: Record<string, string> = {};
for (const p of CMS_PAGES) {
  ROUTE_TO_SLUG[p.route] = p.slug;
  SLUG_TO_ROUTE[p.slug] = p.route;
}

const STATUS_CONFIG = {
  missing: { label: "Missing", cls: "text-red-400 bg-red-400/10 border-red-400/30" },
  stale: { label: "Stale", cls: "text-amber-400 bg-amber-400/10 border-amber-400/30" },
  current: { label: "Current", cls: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" },
};

function CmsBlockField({
  blockKey,
  label,
  multiline,
  translationStatus,
  sourceContent,
  pageSlug,
  locale,
}: {
  blockKey: string;
  label: string;
  multiline?: boolean;
  translationStatus?: "missing" | "stale" | "current";
  sourceContent?: string;
  pageSlug?: string;
  locale?: string;
}) {
  const { getContent, updateDraft, blocks, setActiveBlock } = useCms();
  const value = getContent(blockKey) ?? "";
  const saved = blocks[blockKey] ?? "";
  const isDirty = value !== saved;
  const [showSource, setShowSource] = useState(false);
  const [translating, setTranslating] = useState(false);
  const isTranslation = locale && locale !== "nl";

  async function handleTranslateBlock() {
    if (!pageSlug || !locale) return;
    setTranslating(true);
    const result = await translateBlocks(pageSlug, [blockKey], locale as Locale);
    if (result.translations[blockKey]) {
      updateDraft(blockKey, result.translations[blockKey]);
    }
    setTranslating(false);
  }

  return (
    <div>
      <label className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-green-100/40">
        {label}
        {isDirty && (
          <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
        )}
        {isTranslation && translationStatus && (
          <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[9px] uppercase ${STATUS_CONFIG[translationStatus].cls}`}>
            {STATUS_CONFIG[translationStatus].label}
          </span>
        )}
        {isTranslation && sourceContent && (
          <button
            type="button"
            onClick={() => setShowSource(!showSource)}
            className="text-[10px] text-green-100/30 hover:text-green-100/50"
          >
            {showSource ? "▼" : "▶"} NL
          </button>
        )}
        {isTranslation && (
          <button
            type="button"
            onClick={handleTranslateBlock}
            disabled={translating}
            className="ml-auto flex items-center gap-1 text-[10px] text-gold-500/50 hover:text-gold-200 disabled:opacity-40"
          >
            {translating ? (
              <span className="h-2.5 w-2.5 animate-spin rounded-full border border-gold-400/30 border-t-gold-400" />
            ) : (
              <svg className="h-2.5 w-2.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M2 5h8M5 2v6M10 14l4-4m0 0l-4-4m4 4H6" />
              </svg>
            )}
            Translate
          </button>
        )}
      </label>
      {showSource && sourceContent && (
        <div className="mb-2 rounded border border-green-700/30 bg-green-900/40 px-3 py-2">
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-green-100/30">NL bron</p>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-green-100/50">{sourceContent}</p>
        </div>
      )}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => updateDraft(blockKey, e.target.value)}
          onFocus={() => setActiveBlock(blockKey)}
          rows={3}
          className={`block w-full resize-none rounded border bg-green-900/80 px-2.5 py-1.5 text-xs text-green-100 placeholder-green-100/20 focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/50 ${isDirty ? "border-l-2 border-l-gold-400 border-green-700" : "border-green-700"}`}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => updateDraft(blockKey, e.target.value)}
          onFocus={() => setActiveBlock(blockKey)}
          className={`block w-full rounded border bg-green-900/80 px-2.5 py-1.5 text-xs text-green-100 placeholder-green-100/20 focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/50 ${isDirty ? "border-l-2 border-l-gold-400 border-green-700" : "border-green-700"}`}
        />
      )}
    </div>
  );
}

function HomeEditor() {
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500/60">
          Hero
        </p>
        <div className="space-y-3">
          <CmsBlockField blockKey="hero.title" label="Title" />
          <CmsBlockField blockKey="hero.subtitle" label="Subtitle" multiline />
          <CmsBlockField blockKey="hero.cta" label="CTA Button" />
          <CmsBlockField blockKey="hero.contact" label="Contact Button" />
        </div>
      </div>

      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500/60">
          How It Works
        </p>
        <div className="space-y-3">
          <CmsBlockField blockKey="howItWorks.heading" label="Section Heading" />
          <CmsBlockField blockKey="howItWorks.step1.title" label="Step 1 Title" />
          <CmsBlockField blockKey="howItWorks.step1.desc" label="Step 1 Description" multiline />
          <CmsBlockField blockKey="howItWorks.step2.title" label="Step 2 Title" />
          <CmsBlockField blockKey="howItWorks.step2.desc" label="Step 2 Description" multiline />
          <CmsBlockField blockKey="howItWorks.step3.title" label="Step 3 Title" />
          <CmsBlockField blockKey="howItWorks.step3.desc" label="Step 3 Description" multiline />
        </div>
      </div>

      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500/60">
          Pro CTA
        </p>
        <div className="space-y-3">
          <CmsBlockField blockKey="proCta.title" label="Title" />
          <CmsBlockField blockKey="proCta.desc" label="Description" multiline />
          <CmsBlockField blockKey="proCta.cta" label="Button Text" />
        </div>
      </div>
    </div>
  );
}

function ForStudentsEditor() {
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500/60">
          Hero
        </p>
        <div className="space-y-3">
          <CmsBlockField blockKey="hero.badge" label="Badge" />
          <CmsBlockField blockKey="hero.title" label="Title" />
          <CmsBlockField blockKey="hero.subtitle" label="Subtitle" multiline />
          <CmsBlockField blockKey="hero.cta" label="CTA Button" />
        </div>
      </div>
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500/60">
          Features
        </p>
        <div className="space-y-3">
          <CmsBlockField blockKey="features.heading" label="Heading" />
          <CmsBlockField blockKey="features.subheading" label="Subheading" multiline />
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="space-y-2 rounded border border-green-800/30 p-2">
              <CmsBlockField blockKey={`feature${n}.title`} label={`Feature ${n} Title`} />
              <CmsBlockField blockKey={`feature${n}.desc`} label={`Feature ${n} Desc`} multiline />
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500/60">
          CTA
        </p>
        <div className="space-y-3">
          <CmsBlockField blockKey="cta.title" label="Title" />
          <CmsBlockField blockKey="cta.desc" label="Description" multiline />
          <CmsBlockField blockKey="cta.button" label="Button Text" />
        </div>
      </div>
    </div>
  );
}

function ForProsEditor() {
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500/60">
          Hero
        </p>
        <div className="space-y-3">
          <CmsBlockField blockKey="hero.badge" label="Badge" />
          <CmsBlockField blockKey="hero.title" label="Title" />
          <CmsBlockField blockKey="hero.subtitle" label="Subtitle" multiline />
          <CmsBlockField blockKey="hero.cta" label="CTA Button" />
        </div>
      </div>
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500/60">
          Features
        </p>
        <div className="space-y-3">
          <CmsBlockField blockKey="features.heading" label="Heading" />
          <CmsBlockField blockKey="features.subheading" label="Subheading" multiline />
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="space-y-2 rounded border border-green-800/30 p-2">
              <CmsBlockField blockKey={`feature${n}.title`} label={`Feature ${n} Title`} />
              <CmsBlockField blockKey={`feature${n}.desc`} label={`Feature ${n} Desc`} multiline />
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500/60">
          Beyond Bookings
        </p>
        <div className="space-y-3">
          <CmsBlockField blockKey="beyond.heading" label="Heading" />
          <CmsBlockField blockKey="beyond.subheading" label="Subheading" multiline />
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="space-y-2 rounded border border-green-800/30 p-2">
              <CmsBlockField blockKey={`beyond${n}.title`} label={`Card ${n} Title`} />
              <CmsBlockField blockKey={`beyond${n}.desc`} label={`Card ${n} Desc`} multiline />
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500/60">
          CTA
        </p>
        <div className="space-y-3">
          <CmsBlockField blockKey="cta.title" label="Title" />
          <CmsBlockField blockKey="cta.desc" label="Description" multiline />
          <CmsBlockField blockKey="cta.button" label="Button Text" />
        </div>
      </div>
    </div>
  );
}

function ContactEditor() {
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500/60">
          Contact Page
        </p>
        <div className="space-y-3">
          <CmsBlockField blockKey="contact.title" label="Title" />
          <CmsBlockField blockKey="contact.subtitle" label="Subtitle" multiline />
        </div>
      </div>
    </div>
  );
}

function ReviewDialog({
  changes,
  blocks,
  onClose,
  onPublish,
  saving,
}: {
  changes: { blockKey: string; content: string }[];
  blocks: Record<string, string>;
  onClose: () => void;
  onPublish: () => void;
  saving: boolean;
}) {
  const grouped = useMemo(() => {
    const groups: Record<
      string,
      { key: string; label: string; oldVal: string; newVal: string }[]
    > = {};
    for (const c of changes) {
      const parts = c.blockKey.split(".");
      const cat = parts[0] || "Other";
      const label = parts.slice(1).join(".");
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({
        key: c.blockKey,
        label,
        oldVal: blocks[c.blockKey] ?? "",
        newVal: c.content,
      });
    }
    return groups;
  }, [changes, blocks]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-green-950/95 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-green-700/50 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-500/80">
          Changes ({changes.length})
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-green-100/40 hover:bg-green-800 hover:text-green-100/70"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500/60">
              {category}
            </p>
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.key} className="rounded border border-green-700/30 bg-green-900/40 px-3 py-2">
                  <p className="mb-1 text-[10px] text-green-100/40">{item.label}</p>
                  <div className="space-y-1">
                    {item.oldVal && (
                      <p className="truncate text-xs text-red-400/70 line-through" title={item.oldVal}>
                        {item.oldVal.length > 80 ? item.oldVal.slice(0, 80) + "..." : item.oldVal}
                      </p>
                    )}
                    <p className="truncate text-xs text-emerald-400/70" title={item.newVal}>
                      {item.newVal
                        ? item.newVal.length > 80 ? item.newVal.slice(0, 80) + "..." : item.newVal
                        : "(empty)"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-green-700/50 px-4 py-3">
        <button
          onClick={onPublish}
          disabled={saving}
          className="flex-1 rounded bg-gold-600 px-4 py-2 text-xs font-medium uppercase tracking-wider text-green-950 transition-colors hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Publishing..." : "Publish"}
        </button>
        <button
          onClick={onClose}
          className="rounded border border-green-700 px-4 py-2 text-xs font-medium uppercase tracking-wider text-green-100/60 transition-colors hover:bg-green-800 hover:text-green-100"
        >
          Back
        </button>
      </div>
    </div>
  );
}

// ─── Version Diff ───────────────────────────────────────

function VersionDiff({
  current,
  previous,
}: {
  current: Record<string, string>;
  previous: Record<string, string> | null;
}) {
  const allKeys = new Set([
    ...Object.keys(current),
    ...(previous ? Object.keys(previous) : []),
  ]);

  const changes: {
    key: string;
    type: "added" | "removed" | "changed";
    oldVal?: string;
    newVal?: string;
  }[] = [];

  for (const key of allKeys) {
    if (key.startsWith("_")) continue;
    const cur = current[key];
    const prev = previous?.[key];
    if (prev === undefined && cur !== undefined) {
      changes.push({ key, type: "added", newVal: cur });
    } else if (cur === undefined && prev !== undefined) {
      changes.push({ key, type: "removed", oldVal: prev });
    } else if (cur !== prev) {
      changes.push({ key, type: "changed", oldVal: prev, newVal: cur });
    }
  }

  if (changes.length === 0) {
    return (
      <p className="py-2 text-[10px] text-green-100/40">No changes in this version.</p>
    );
  }

  const shown = changes.slice(0, 20);
  const remaining = changes.length - shown.length;

  return (
    <div className="space-y-2">
      {shown.map((c) => (
        <div key={c.key} className="rounded border border-green-700/30 bg-green-900/40 px-3 py-2">
          <p className="mb-1 text-[10px] text-green-100/40">
            {c.key}
            {c.type === "added" && (
              <span className="ml-2 text-emerald-400">(added)</span>
            )}
            {c.type === "removed" && (
              <span className="ml-2 text-red-400">(removed)</span>
            )}
          </p>
          {c.oldVal && (
            <p className="truncate text-xs text-red-400/70 line-through">
              {c.oldVal.length > 60 ? c.oldVal.slice(0, 60) + "..." : c.oldVal}
            </p>
          )}
          {c.newVal && (
            <p className="truncate text-xs text-emerald-400/70">
              {c.newVal.length > 60 ? c.newVal.slice(0, 60) + "..." : c.newVal}
            </p>
          )}
        </div>
      ))}
      {remaining > 0 && (
        <p className="text-[10px] text-green-100/30">
          ...and {remaining} more changes
        </p>
      )}
    </div>
  );
}

// ─── Version Panel ──────────────────────────────────────

function VersionPanel({
  pageSlug,
  locale,
  onRestore,
}: {
  pageSlug: string;
  locale: string;
  onRestore: () => void;
}) {
  const [versions, setVersions] = useState<CmsPageVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [diffData, setDiffData] = useState<{
    current: Record<string, string>;
    previous: Record<string, string> | null;
  } | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    setLoading(true);
    setExpandedId(null);
    setDiffData(null);
    getCmsPageVersions(pageSlug, locale as Locale).then((v) => {
      setVersions(v);
      setLoading(false);
    });
  }, [pageSlug, locale]);

  async function handleViewDiff(versionId: number, version: number) {
    if (expandedId === versionId) {
      setExpandedId(null);
      setDiffData(null);
      return;
    }

    const currentData = await getCmsPageVersion(versionId);
    if (!currentData) return;

    // Find previous version
    const prevVersion = versions.find(
      (v) => v.version === version - 1 && v.locale === locale
    );
    let previousData: Record<string, string> | null = null;
    if (prevVersion) {
      const prev = await getCmsPageVersion(prevVersion.id);
      previousData = prev?.blocks ?? null;
    }

    setExpandedId(versionId);
    setDiffData({ current: currentData.blocks, previous: previousData });
  }

  async function handleRestore(versionId: number) {
    if (!confirm("Restore this version? Current content will be replaced.")) return;
    setRestoring(true);
    const result = await restoreCmsPageVersion(versionId);
    setRestoring(false);
    if (!result.error) {
      onRestore();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-green-100/20 border-t-gold-400" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <p className="py-4 text-center text-[10px] text-green-100/40">
        No versions yet. Publish to create the first version.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {versions.map((v) => (
        <div key={v.id} className="rounded border border-green-700/30 bg-green-900/30">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="rounded bg-green-800 px-1.5 py-0.5 text-[10px] font-semibold text-green-100/80">
                v{v.version}
              </span>
              <span className="text-[10px] text-green-100/40">
                {new Date(v.publishedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="text-[10px] text-green-100/30">
                {v.blockCount} blocks
              </span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => handleViewDiff(v.id, v.version)}
                className="rounded px-2 py-0.5 text-[10px] text-green-100/50 hover:bg-green-800 hover:text-green-100/80"
              >
                {expandedId === v.id ? "Hide" : "Diff"}
              </button>
              <button
                onClick={() => handleRestore(v.id)}
                disabled={restoring}
                className="rounded px-2 py-0.5 text-[10px] text-gold-400/70 hover:bg-green-800 hover:text-gold-300 disabled:opacity-40"
              >
                Restore
              </button>
            </div>
          </div>
          {v.message && (
            <p className="px-3 pb-2 text-[10px] italic text-green-100/30">
              {v.message}
            </p>
          )}
          {expandedId === v.id && diffData && (
            <div className="border-t border-green-700/20 px-3 py-2">
              <VersionDiff current={diffData.current} previous={diffData.previous} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Content Panel ─────────────────────────────────

export default function ContentPanel() {
  const cms = useCms();
  const [selectedPage, setSelectedPage] = useState<string>(CMS_PAGES[0].slug);
  const [selectedLocale, setSelectedLocale] = useState<Locale>("nl");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [translatingAll, setTranslatingAll] = useState(false);
  const handlePageChange = useCallback(
    (slug: string) => {
      setSelectedPage(slug);
      // Don't navigate — the CmsEditorPage updates the preview iframe via pageSlug
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSaveMessage(null);

    getCmsBlocks(selectedPage, selectedLocale).then((rows) => {
      if (cancelled) return;
      const blockMap: Record<string, string> = {};
      for (const row of rows) {
        blockMap[row.blockKey] = row.content;
      }
      cms.initPage(selectedPage, blockMap);
      cms.setEditing(true);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPage, selectedLocale]);

  useEffect(() => {
    return () => {
      cms.setEditing(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(async () => {
    const changes = cms.getChangedBlocks();
    if (changes.length === 0) return;

    setSaving(true);
    setSaveMessage(null);

    const result = await saveCmsBlocks(selectedPage, changes, selectedLocale);
    if (result.error) {
      setSaveMessage(result.error);
    } else {
      cms.commitDrafts();
      setReviewing(false);
      setSaveMessage("Published");
      setTimeout(() => setSaveMessage(null), 2000);
    }
    setSaving(false);
  }, [cms, selectedPage, selectedLocale]);

  const handleRevert = useCallback(() => {
    cms.revert();
    setSaveMessage(null);
  }, [cms]);

  const handleVersionRestore = useCallback(async () => {
    // Reload blocks from DB after restore
    const rows = await getCmsBlocks(selectedPage, selectedLocale);
    const blockMap: Record<string, string> = {};
    for (const row of rows) {
      blockMap[row.blockKey] = row.content;
    }
    cms.initPage(selectedPage, blockMap);
    setShowVersions(false);
    setSaveMessage("Restored");
    setTimeout(() => setSaveMessage(null), 2000);
  }, [cms, selectedPage, selectedLocale]);

  const handleTranslateAll = useCallback(async () => {
    if (selectedLocale === "nl") return;
    setTranslatingAll(true);
    setSaveMessage(null);
    const result = await translateAllBlocks(selectedPage, selectedLocale);
    if (result.error) {
      setSaveMessage(result.error);
    } else {
      setSaveMessage(`${result.count} block(s) translated`);
      // Reload blocks to show translations
      const rows = await getCmsBlocks(selectedPage, selectedLocale);
      const blockMap: Record<string, string> = {};
      for (const row of rows) {
        blockMap[row.blockKey] = row.content;
      }
      cms.initPage(selectedPage, blockMap);
      setTimeout(() => setSaveMessage(null), 3000);
    }
    setTranslatingAll(false);
  }, [cms, selectedPage, selectedLocale]);

  return (
    <div className="relative flex h-full flex-col">
      {reviewing && (
        <ReviewDialog
          changes={cms.getChangedBlocks()}
          blocks={cms.blocks}
          onClose={() => setReviewing(false)}
          onPublish={handleSave}
          saving={saving}
        />
      )}

      {/* Toolbar */}
      <div className="border-b border-green-700/50">
        <div className="flex items-center justify-between gap-2 px-4 py-1.5">
          <select
            value={selectedPage}
            onChange={(e) => handlePageChange(e.target.value)}
            className="rounded border border-green-700 bg-green-900 px-2 py-1 text-xs text-green-100 focus:border-gold-500 focus:outline-none"
          >
            {CMS_PAGES.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {/* Locale tabs */}
        <div className="flex border-t border-green-700/30 px-4">
          {LOCALES.map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => setSelectedLocale(loc)}
              className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] transition-colors ${
                selectedLocale === loc
                  ? "border-b-2 border-gold-500 text-gold-200"
                  : "text-green-100/40 hover:text-green-100/60"
              }`}
            >
              {LOCALE_SHORT[loc]}
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-100/20 border-t-gold-400" />
          </div>
        ) : (
          <>
            {selectedPage === "home" && <HomeEditor />}
            {selectedPage === "for-students" && <ForStudentsEditor />}
            {selectedPage === "for-pros" && <ForProsEditor />}
            {selectedPage === "contact" && <ContactEditor />}
          </>
        )}
      </div>

      {/* Version history panel */}
      {showVersions && (
        <div className="border-t border-green-700/50 px-4 py-3 max-h-[40%] overflow-y-auto">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500/60">
              Version History
            </p>
            <button
              onClick={() => setShowVersions(false)}
              className="rounded p-1 text-green-100/40 hover:bg-green-800 hover:text-green-100/70"
            >
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
          <VersionPanel
            pageSlug={selectedPage}
            locale={selectedLocale}
            onRestore={handleVersionRestore}
          />
        </div>
      )}

      {/* Action bar */}
      <div className="border-t border-green-700/50 px-4 py-3">
        {saveMessage && (
          <p
            className={`mb-2 text-xs ${
              saveMessage === "Published" || saveMessage === "Restored" || saveMessage.includes("translated")
                ? "text-emerald-400"
                : "text-red-400"
            }`}
          >
            {saveMessage}
          </p>
        )}
        <div className="flex gap-2">
          {/* Publish */}
          <button
            onClick={() => setReviewing(true)}
            disabled={!cms.isDirty || saving}
            className="flex-1 rounded bg-gold-600 px-4 py-2 text-xs font-medium uppercase tracking-wider text-green-950 transition-colors hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Publish
          </button>
          {/* Translate All (non-EN only) */}
          {selectedLocale !== "nl" && (
            <button
              onClick={handleTranslateAll}
              disabled={translatingAll}
              className="rounded border border-gold-600/50 px-3 py-2 text-xs font-medium uppercase tracking-wider text-gold-500 transition-colors hover:text-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
              title="Translate all missing/stale blocks"
            >
              {translatingAll ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 animate-spin rounded-full border border-gold-400/30 border-t-gold-400" />
                  Translating...
                </span>
              ) : (
                "Translate all"
              )}
            </button>
          )}
          {/* Revert */}
          <button
            onClick={handleRevert}
            disabled={!cms.isDirty}
            className={`rounded border px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              cms.isDirty
                ? "border-red-500/50 text-red-400 hover:bg-red-500/10"
                : "border-green-700 text-green-100/60"
            }`}
          >
            Revert
          </button>
          {/* Version history */}
          <button
            onClick={() => setShowVersions(!showVersions)}
            className={`rounded border px-3 py-2 text-xs transition-colors ${
              showVersions
                ? "border-gold-500/50 text-gold-400"
                : "border-green-700 text-green-100/60 hover:bg-green-800 hover:text-green-100"
            }`}
            title="Version history"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M8 4v4l3 2" />
              <circle cx="8" cy="8" r="6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
