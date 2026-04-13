# Gap Analysis — Pre-Launch

Last updated: 2026-04-13 (evening)

Living document tracking what's left before golflessons.be can go live.
Cross-reference for sprint planning and Nadine's testing feedback.

## 🔴 Go-live blockers

### 1. V1 payment flow (Sprint B — the big one)

- PaymentIntent on platform Stripe account at booking confirmation (no `transfer_data`, no `application_fee_amount` — direct + SEPA model).
- Booking wizard payment step — Stripe Checkout (simpler) vs Elements.
- Webhook handlers: `payment_intent.succeeded` → mark booking `paymentStatus: paid`; `payment_intent.payment_failed` → mark `failed` + email student.
- Idempotency on retries to avoid double-charging.
- Refund flow: cancellations within window auto-refund; outside window no refund (document policy — needs decision).
- Bancontact support (Belgian market) — already partially scaffolded in SetupIntent code.
- Admin payouts view — aggregate paid bookings per pro, mark batches as paid out, execute SEPA transfer manually from platform account.
- Commission decision (0% + higher subscription, or % cut).

### 2. Pre-launch site password hardcoded

- `src/middleware.ts:12` — `SITE_PASSWORD = "prolessons"`. Rotate or remove gate before public launch.

### 3. DNS Belgium registrant fix

- Deadline ~**2026-04-24** (10 days out). Vercel needs to handle. See memory `project_dns_belgium`.

### 4. Pro-authored content + translations + CMS architecture review

Pros author content in **multiple places** with no translation story:

- `proProfiles.bio` and `proProfiles.specialties` — single text fields, single language
- `pro_pages` (the marketing/flyer pages at `/pros/[slug]/[pageSlug]`) — `title`, `metaDescription`, `intro`, and `sections` (jsonb) all single-language
- `pro_locations.notes` and `priceIndication` — single language
- (`displayName` is fine — names don't translate)

The platform CMS (`cms_blocks`) has per-locale rows but is operated by the platform team, not pros. There's no path for pros to publish content in NL/FR/EN.

**Decisions needed before launch (or before any pro publishes a flyer page):**

1. **Architecture**: per-locale columns vs. translations table vs. CMS-style blocks vs. auto-translation API vs. hybrid?
2. **Pro UX**: are we asking every pro to write 3 versions, or fall back automatically?
3. **Marketing page editor**: the current `/pro/pages` editor has zero locale switching. If we decide pros should write per-locale, the editor needs tabs.
4. **Migration**: existing pro content (Nadine's Dickens accounts) needs a `contentLocale` column or assumption.

**Stopgap shipped**: a small italic notice on `/pros/[slug]` and `/pros/[slug]/[pageSlug]` saying "This pro writes their content in their preferred language. Multilingual support is coming soon." in EN/NL/FR. This is honest but not a real fix.

**Recommended next step**: 1-hour design review to pick an approach. My initial lean is **auto-translate via DeepL or Claude**, cached in a `pro_content_translations` table keyed on `(table, id, field, locale)`, regenerated on edit. Avoids forcing pros into a 3-tab editor and works for existing content immediately. Roughly half a day of work plus a small monthly API bill.

## 🟡 Should-fix before launch

- **`db.transaction()` wrapping in `createBooking()`** — multi-step inserts (booking + participant + relationship) can leave partial state on failure. **Blocked**: the current `drizzle-orm/neon-http` driver doesn't support multi-statement transactions. Move to `neon-serverless` (WebSocket) or `pg` first, then re-introduce. Initial attempt in commit `ea60e63` broke the booking flow (Nadine's task #12) and was reverted in `b95dc35`. The proper fix is a driver migration — see Open Questions #4.

## 🟢 Polish / post-launch

- More empty states (anywhere with a list that can be empty — `/pro/bookings` calendar, coaching chat, pro/students filter views beyond "all").
- Loading skeletons / optimistic UI in booking wizard and chat.
- Accessibility audit: ARIA on icon buttons, contrast on gold-on-cream, keyboard nav on calendar grids.
- Test coverage beyond `src/lib/__tests__/lesson-slots.test.ts` — API endpoints, payment flow, webhooks.
- Comment moderation tools (flagging + admin review).
- Image optimization (`next/image` audit).
- **Promote `/dev/gdpr` to user-facing self-service** — add "Export my data" and "Delete my account" buttons to `/member/profile`. The dev-only tool at `/dev/gdpr` is enough for now (manual lookup + export/delete on request).
- **Mobile day-picker view for `/pro/availability` and `/pro/bookings` calendar** — both grids currently use horizontal scroll on phones (with scroll hints). A dedicated one-day-at-a-time mobile view would be nicer but isn't strictly required.
- **Web-push notification retries** — currently fire-and-forget via `.catch(() => {})`. Transient 503s from APNs/FCM silently drop. Lower priority than the blob/email retries that already shipped.
- **Drop dead schema columns** `proProfiles.stripeConnectAccountId`, `stripeConnectOnboarded` — Connect is rejected, these never get populated. Migration is risk-free but no visible benefit pre-launch.
- **Pro discovery / filtering on `/pros`** (Nadine task #24) — currently a flat list of every published pro. Acceptable while we launch with 2-3 pros, but won't scale past ~10. A proper implementation needs:
  - Lat/lng on `pro_locations` (schema migration)
  - Geocoding service (Nominatim free vs Google paid) to populate lat/lng on location create
  - Filter UI on `/pros`: city dropdown + radius slider, ideally with sort-by-distance
  - Decision deferred — will do a proper implementation soon, post-launch.
- Nadine's deferred sub-issues from task #6:
  - Embedded `/pros` browser in onboarding instead of flat list.
  - Re-enabling email field after registration (requires verify-new-email flow). **Note**: shipped as a typo-fix-only path in commit 66125d2 (task #23). A full email-change-after-verification flow is still post-launch.

## Recently shipped (last big sweep — 2026-04-13)

- Four-pass i18n audit — every user-visible string in member/* and pro/* translated in EN / NL / FR, including app shell (sidebar, bottom nav, install-guide dialog), full booking wizard, all pro-side editors (profile, locations, availability, students incl. help dialog, quick book, cancel booking), `/pro/billing`, `/pro/earnings`, `/pro/bookings` (list + calendar + detail), `/pro/pages`, `/pro/mailings`, `/pro/tasks` chrome, `/pro/onboarding` wizard, `/pro/subscribe`, `/pro/register`, `/member/dashboard` + help dialog + quick rebook, `/member/bookings`, `/member/coaching`, `/member/choose-pros`, `/pros/[slug]`, error boundaries.
- Welcome-as-pro email — 4-step onboarding guide (verify → subscribe → profile → publish) wired into `/pro/register`. Three email locale call-site bugs fixed (old register action, pro-invites-student, pro-resets-student-password).
- Subscription prices centralised in `src/lib/pricing.ts`, sourced from `NEXT_PUBLIC_PRO_PRICE_MONTHLY` / `_ANNUAL` env vars. All hardcoded €12.50 / €125 / €25 / 17% references removed. Locale-aware currency formatting via `formatPrice(amount, locale)`.
- Locale-aware date formatting sweep (helper + migration of all call sites). `/member/bookings/actions.ts` cancel-deadline error and `TimezoneNote.tsx` were the last stragglers.
- Sentry `price_per_hour` numeric→text schema fix (production + preview DB).
- Tasks Kanban: dropped the `description` column (data migrated to comments thread); added a full **New task** modal with title + initial comment + assignees + priority + color + due date + checklist, replacing the inline one-row bar.
- `/dev/gdpr` tool — dev-only GDPR Article 15 / 17 / 20 handling (lookup + JSON export + soft-delete-and-anonymise with audit log).
- Mobile responsiveness audit — Playwright-verified on 375×812. Booking wizard, pro dashboard, pro billing clean. Fixed: KanbanBoard 3-col grid stacks on mobile, StudentManager help-dialog table gets horizontal scroll, availability + bookings calendars got visible "scroll →" hints.
- Stripe webhook type narrowing — replaced `type StripeObject = any` with proper SDK types + a local `SubscriptionWithPeriod` helper.
- Health check — now validates both configured Stripe price IDs via `stripe.prices.retrieve()` and asserts `.active === true` (would have caught SENTRY-ORANGE-ZEBRA-A).
- Transient-error retries — Gmail `sendEmail` retries once on socket hang up / ECONNRESET / 5xx; Stripe SDK gets `maxNetworkRetries: 2`; new shared `src/lib/retry.ts` helper wraps `@vercel/blob` `put` calls on both upload routes.
- Trial-ending + payment-failed webhook emails (already wired in an earlier session — the previous `gaps.md` entry was stale).
- Sentry source map upload — `silent: !SENTRY_AUTH_TOKEN` was already correct.
- PWA install bootstrap — swapped raw `<script dangerouslySetInnerHTML>` for `next/script` to quiet a Next.js 16 warning.
- First-comment seeding on task creation + `tasks.description` column removed (data migrated to comments).

## Open questions

1. **Site password** — keep gate post-launch or open up?
2. **Commission %** — 0% with higher subscription, or % cut?
3. **Refund policy** — auto-refund within cancellation window, no refund outside?
4. **DB driver migration** — green-light moving from `neon-http` to `neon-serverless` (WebSocket) post-launch so we can use transactions? This is the one blocker on real `db.transaction()` support.

## Cross-references

- Nadine's testing feedback lives in the in-app admin Kanban (DB-backed `tasks` + `comments` tables). Read via `/admin/tasks`.
- Payment model decision: `memory/project_payments_model.md`
- Testing accounts: `memory/feedback_testing_accounts.md`
- DNS deadline: `memory/project_dns_belgium.md`
