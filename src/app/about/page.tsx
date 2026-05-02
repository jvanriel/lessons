import { readFile } from "node:fs/promises";
import path from "node:path";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import { formatDate } from "@/lib/format-date";
import {
  parseChangelog,
  renderItem,
  isItemVisibleTo,
  type ChangelogEntry,
} from "@/lib/changelog";
import { getSession } from "@/lib/auth";
import { CheckForUpdatesButton } from "./CheckForUpdatesButton";

export const metadata = { title: "About — Golf Lessons" };

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const BUILD_COMMIT_SHA = process.env.NEXT_PUBLIC_BUILD_COMMIT_SHA ?? "";
const BUILD_BRANCH = process.env.NEXT_PUBLIC_BUILD_BRANCH ?? "local";
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";
const VERCEL_ENV = process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development";

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
  const session = await getSession();
  const userRoles = session?.roles ?? [];
  const allEntries = await loadChangelog();

  // Filter items per the viewer's roles. Untagged items are visible
  // to everyone (including signed-out visitors); tagged items only
  // to users with one of the listed roles. Hide a whole entry when
  // every item under it is filtered out, so we don't render an
  // empty card "v1.1.X" with no bullets.
  const entries = allEntries
    .map((e) => ({
      ...e,
      items: e.items.filter((i) => isItemVisibleTo(i, userRoles)),
    }))
    .filter((e) => e.items.length > 0);

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
              <li
                // `date` alone collides when multiple versions ship the
                // same day — combine with the heading label (e.g.
                // version string) for a stable unique key.
                key={`${e.date}-${e.label}`}
                className="rounded-xl border border-green-200 bg-white p-5"
              >
                <h3 className="font-display text-base font-medium text-green-800">
                  {formatDate(e.date, locale, { dateStyle: "long" })}
                  {e.label && (
                    <span className="ml-2 text-sm font-normal text-green-500">
                      {e.label}
                    </span>
                  )}
                </h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-green-700 marker:text-green-300">
                  {e.items.map((item, i) => (
                    <li
                      key={i}
                      // Tiny well-defined parser output, not user content.
                      // Restricted to escaped text + <strong>.
                      dangerouslySetInnerHTML={{ __html: renderItem(item.text) }}
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
