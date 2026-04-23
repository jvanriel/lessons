# Pro Pages — parked pre-launch

> **Status:** built but hidden from navigation as of 2026-04-23. Revisit after launch.

## What it is

A lightweight CMS that lets a pro author one or more mini-sites — think golf-camp flyers, "about me" pages, limited offers — without an external page builder. The feature lives at `/pro/pages` (list) and `/pro/pages/[id]` (editor).

Each page is:

- A row in `pro_pages` with `type` (`flyer` or `profile`), `title`, `metaDescription`, `heroImage`, `intro`, `sections[]`, `ctaLabel` / `ctaUrl` / `ctaEmail`, `translations` (NL/EN/FR overrides), and `published` (draft vs live).
- A JSON `sections[]` array where each entry is `{ id, type, title?, content?, media?, mediaPosition?, visible }` with `type` in `text | gallery | video | pricing | testimonial`.
- Editable via a TipTap-powered rich-text editor with auto-save, a 2-column iframe preview (mobile/tablet/desktop), and NL → EN/FR auto-translation via Claude.

## Why it's parked

- Not on the critical path for launch. The core flows are booking, payment, and coaching relationships; pros can reach new students via their public profile (`/pros/[id]`) and mailings without a separate page builder.
- The editor is built but under-tested end-to-end. Publishing a page today routes to `/p/[slug]` style URLs; we haven't confirmed SEO, cache invalidation on publish, or what happens when two pros pick colliding slugs.
- Adds a support surface (rich-text XSS, image uploads, translation cost) that we don't want to carry through launch triage.

## What's disabled

- Sidebar drawer link to `/pro/pages` is removed (`src/components/app/AppSidebar.tsx`).
- Routes still compile and render. A pro who types the URL directly can still use the editor — we're not blocking it, just not advertising it.
- Public rendering (if any) should be reviewed before launch — audit `/p/*` and `/pros/[id]/pages/*` if they exist, and decide whether to 404 or keep.

## Code locations

- `src/app/(pro)/pro/pages/page.tsx` — list
- `src/app/(pro)/pro/pages/[id]/page.tsx` + `PageEditor.tsx` + `PagePreview.tsx` — editor
- `src/app/(pro)/pro/pages/actions.ts` — CRUD server actions
- `src/app/(pro)/pro/pages/translate-actions.ts` — Claude-powered NL → EN/FR
- `src/components/RichTextEditor.tsx` + `src/lib/sanitize-html.ts` — TipTap wrapper and DOMPurify sanitiser
- `src/lib/db/schema.ts` — `proPages` table, `ProPageSection`, `ProPageTranslation`
- Translation keys under `proPages.*` in `src/lib/i18n/translations.ts`

## Before re-enabling

1. Decide the final URL scheme for public pages and nail down slug uniqueness across pros.
2. Audit sanitisation — a pro can paste arbitrary HTML; `sanitize-html.ts` is in place but needs a second look.
3. Add rate limits / cost caps on the translate action (Claude calls are on our bill).
4. Smoke-test auto-save under flaky network and the published-page cache invalidation path.
5. Re-add the drawer entry in `AppSidebar.tsx` (the "Pages" item was in the pro section, between Profile and Mailings).
