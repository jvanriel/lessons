# Gap Analysis — Pre-Launch

Last updated: 2026-04-13 (evening)

Living document tracking what's left before golflessons.be can go live.
Cross-reference for sprint planning and Nadine's testing feedback.

## 🔴 Go-live blockers

### ~~1. V1 payment flow (Sprint B)~~ — **done** (follow-ups in 🟡)

Shipped in commits `6e4ac54`, `07ad6e2`, `fd9bc90` on 2026-04-13. End-
to-end flow:

1. **Pro side** — per-duration lesson prices live on
   `pro_profiles.lesson_pricing` (jsonb `{ "30": 3500, "60": 6500 }`
   in cents). Onboarding wizard + profile editor both render a per-
   duration € input grid with pro-rated pre-fill on toggle and
   cents↔EUR conversion at the form boundary. DB migration backfilled
   5 preview pros + 3 prod pros with €50/h pro-rated defaults.
2. **Student side** — booking wizard Confirm step shows the computed
   Total in locale-aware currency (`formatPrice(cents/100, locale)`).
   Confirm button is disabled if the pro hasn't priced the selected
   duration, with a "pick another duration" message.
3. **Charge** — `createBooking()` computes `priceCents = lessonPricing
   [duration] * participantCount` plus `platformFeeCents` (from
   `calculatePlatformFee`, now env-var driven via
   `NEXT_PUBLIC_PLATFORM_FEE_PERCENT`, default 2.5%). Inserts the
   booking row with `paymentStatus="pending"`, then fires
   `stripe.paymentIntents.create` with `off_session: true`,
   `confirm: true`, and `idempotencyKey: booking-{id}-v1`. On success
   → `paymentStatus="paid"` + `paidAt`. On 3DS → `"requires_action"`
   (retry UI still TBD). On failure → `"failed"` + Sentry capture,
   booking row retained so the slot stays reserved.
4. **Webhook reconciliation** — `payment_intent.succeeded` idempotently
   flips to `paid`; `payment_intent.payment_failed` flips to `failed`
   and fires `buildPaymentFailedEmail` to the student.
5. **Refund on cancel** — `cancelBooking` checks `paymentStatus` +
   cancellation window; if paid-and-inside-window, fires
   `stripe.refunds.create` with `idempotencyKey: refund-{id}-v1`,
   then flips to `paymentStatus="refunded"` + `refundedAt`. Outside-
   window cancels were already blocked by the cancel-deadline guard
   from the earlier locale-aware error work.
6. **Confirmation email** — `buildStudentBookingConfirmationEmail`
   now includes an "Amount charged" row formatted with
   `Intl.NumberFormat` in the recipient's locale (en-GB / nl-BE /
   fr-BE currency). Pro notification email unchanged — pros see
   amounts in `/pro/earnings`.

**Already in place from earlier sessions** (not touched this sprint):
`MIN_LESSON_PRICE_CENTS`, Bancontact on the student SetupIntent,
admin payouts view at `/admin/payouts` with CSV export aggregated
per pro + IBAN, `/pro/earnings` revenue/fee display, `checkPaymentGate`
payment-required guard during booking, `users.stripeCustomerId` on
Stripe customer creation.

**Commission decision**: stays 2.5% for now, driven by
`NEXT_PUBLIC_PLATFORM_FEE_PERCENT` env var. Change the env var + redeploy
to adjust without code.

### 1. Pre-launch site password hardcoded

- `src/middleware.ts:12` — `SITE_PASSWORD = "prolessons"`. Rotate or remove gate before public launch.

### 2. DNS Belgium registrant fix

- Deadline ~**2026-04-24** (10 days out). Vercel needs to handle. See memory `project_dns_belgium`.

### 3. Pro-authored content + translations + CMS architecture review

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

### Sprint B follow-ups (payment flow)

- **Student "retry payment" UI on a failed booking.** When `createBooking` fires the PaymentIntent off-session and Stripe returns `requires_action` (3DS / SCA) or `failed`, the booking is marked `paymentStatus="requires_action"` or `"failed"` and retained. There's no student-facing UI to complete the 3DS flow or retry a declined card. Needs a small client component on `/member/bookings/[id]` that takes the PaymentIntent `client_secret` and runs `stripe.confirmCardPayment`. Lower priority since off-session usually succeeds on the first try, but the row will sit in limbo until the student interacts.
- **Admin "mark as manually refunded" fallback.** `stripe.refunds.create` can fail (network hiccup, already-refunded, payment too old). Today that's surfaced as a console error in `cancelBooking` but the refund has to be reconciled manually in the Stripe dashboard. Add a button in `/admin/payouts` or `/admin/bookings` to set `paymentStatus="refunded"` + `refundedAt` on a booking after a manual Stripe-side refund.
- ~~**Cash-only pros (`allowBookingWithoutPayment`)**~~ — **done**. Cash-only pros (with `allowBookingWithoutPayment=true`) now get `paymentStatus="manual"` on the booking row, the PaymentIntent is skipped entirely, no platform fee is recorded, and the confirmation email shows "Payable on site" instead of "Amount charged" (translated in EN/NL/FR). The refund-on-cancel path also skips these since `paymentStatus === "manual"` never matches the `"paid"` branch. `/pro/earnings` was already filtering by `paymentStatus = 'paid'`, so manual bookings correctly don't count toward the pro's platform-charged revenue.
- **Smoke-test with a Stripe test card on preview** before merging Sprint B to main. Use a 4242 card on `/member/book/[slug]` with dummy student + dummy pro, then walk through: confirm → see Total → hit Confirm → watch Sentry + Stripe dashboard → check `/pro/earnings` after the webhook lands. Then cancel from `/member/bookings` within the window and verify the refund fires.
- **Stripe webhook on production** needs the live-mode signing secret set (`STRIPE_WEBHOOK_SECRET`) and the endpoint registered in the Stripe dashboard pointing at `/api/webhooks/stripe` once Sprint B merges to main. Sandbox webhook secret is already in `.env.local` for preview.

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
