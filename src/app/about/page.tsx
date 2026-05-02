import { readFile } from "node:fs/promises";
import path from "node:path";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import { formatDate } from "@/lib/format-date";
import { CheckForUpdatesButton } from "./CheckForUpdatesButton";

export const metadata = { title: "About — Golf Lessons" };

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const BUILD_COMMIT_SHA = process.env.NEXT_PUBLIC_BUILD_COMMIT_SHA ?? "";
const BUILD_BRANCH = process.env.NEXT_PUBLIC_BUILD_BRANCH ?? "local";
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";
const VERCEL_ENV = process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development";

interface ChangelogEntry {
  date: string; // YYYY-MM-DD
  /** Bullet items, each one a paragraph of HTML-escaped text with a
   *  leading **bold** preserved when present in the source. */
  items: string[];
}

/**
 * Minimal parser for the changelog's hand-curated format. Source is
 * `docs/CHANGELOG.md`; sections start with `## YYYY-MM-DD ...`, items
 * are top-level `- ...` bullets that may wrap onto continuation lines.
 * Anything before the first `##` heading is the file intro and gets
 * dropped. Inline `**bold**` is recognised; everything else is treated
 * as plain text (no link / code / list-nesting support — the format is
 * flat by convention).
 */
function parseChangelog(md: string): ChangelogEntry[] {
  const out: ChangelogEntry[] = [];
  const lines = md.split("\n");
  let current: ChangelogEntry | null = null;
  let buffer: string[] = [];

  function flushBullet() {
    if (!current || buffer.length === 0) return;
    current.items.push(buffer.join(" ").trim());
    buffer = [];
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^##\s+(\d{4}-\d{2}-\d{2})/.exec(line);
    if (heading) {
      flushBullet();
      if (current) out.push(current);
      current = { date: heading[1], items: [] };
      continue;
    }
    if (!current) continue; // skip pre-first-heading intro
    if (line.startsWith("- ")) {
      flushBullet();
      buffer.push(line.slice(2));
    } else if (line.trim() === "") {
      flushBullet();
    } else if (buffer.length > 0) {
      // continuation line of the current bullet
      buffer.push(line.trim());
    }
  }
  flushBullet();
  if (current) out.push(current);
  return out;
}

/** Escape HTML and turn `**bold**` runs into `<strong>` markers. */
function renderItem(text: string): string {
  const esc = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return esc.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

async function loadChangelog(): Promise<ChangelogEntry[]> {
  try {
    const p = path.join(process.cwd(), "docs", "CHANGELOG.md");
    const md = await readFile(p, "utf8");
    return parseChangelog(md);
  } catch {
    return [];
  }
}

export default async function AboutPage() {
  const locale = await getLocale();
  const entries = await loadChangelog();

  const isProduction = VERCEL_ENV === "production";

  // Build-time formatting: when the env var is set we get a proper
  // ISO instant; locally it's empty and we just render "—".
  let buildTimeFormatted = "—";
  if (BUILD_TIME) {
    try {
      buildTimeFormatted = formatDate(new Date(BUILD_TIME), locale, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      buildTimeFormatted = BUILD_TIME;
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl font-medium text-green-900">
        {t("about.title", locale)}
      </h1>
      <p className="mt-1 text-sm text-green-600">
        {t("about.subtitle", locale)}
      </p>

      <section className="mt-8 rounded-xl border border-green-200 bg-white p-5">
        <h2 className="font-display text-lg font-medium text-green-900">
          {t("about.versionHeading", locale)}
        </h2>
        <p className="mt-2 font-display text-3xl font-medium text-green-900">
          v{APP_VERSION}
        </p>
        <dl className="mt-4 grid gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-green-500">{t("about.buildId", locale)}</dt>
          <dd className="font-mono text-green-900">
            {BUILD_ID}
            {BUILD_COMMIT_SHA && BUILD_COMMIT_SHA !== BUILD_ID && (
              <span className="ml-2 text-xs text-green-400">
                ({BUILD_COMMIT_SHA.slice(0, 12)})
              </span>
            )}
          </dd>

          <dt className="text-green-500">{t("about.buildTime", locale)}</dt>
          <dd className="text-green-900">{buildTimeFormatted}</dd>

          {!isProduction && (
            <>
              <dt className="text-green-500">{t("about.branch", locale)}</dt>
              <dd className="font-mono text-green-900">{BUILD_BRANCH}</dd>

              <dt className="text-green-500">{t("about.environment", locale)}</dt>
              <dd className="font-mono text-green-900">{VERCEL_ENV}</dd>
            </>
          )}
        </dl>

        <div className="mt-5">
          <CheckForUpdatesButton locale={locale} runningBuildId={BUILD_ID} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-medium text-green-900">
          {t("about.changelogHeading", locale)}
        </h2>
        {entries.length === 0 ? (
          <p className="mt-2 text-sm text-green-500">
            {t("about.changelogEmpty", locale)}
          </p>
        ) : (
          <ol className="mt-4 space-y-6">
            {entries.map((e) => (
              <li key={e.date} className="rounded-xl border border-green-200 bg-white p-5">
                <h3 className="font-display text-base font-medium text-green-800">
                  {formatDate(e.date, locale, {
                    dateStyle: "long",
                  })}
                </h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-green-700 marker:text-green-300">
                  {e.items.map((item, i) => (
                    <li
                      key={i}
                      // Tiny well-defined parser output, not user content.
                      // Restricted to escaped text + <strong>.
                      dangerouslySetInnerHTML={{ __html: renderItem(item) }}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
