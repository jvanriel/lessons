# Gap Analysis — Pre-Launch

Last updated: 2026-04-17

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
- **Coupled with the new public booking flow**: `/book/[slug]` and `/booked/t/[token]` are not in the middleware bypass matcher (`src/middleware.ts:84-87`), so they sit behind the password gate today. Removing the gate at launch automatically opens them. If we want public booking to go live earlier, either add `book` and `booked` to the matcher exclusion, or rotate the password and share with early-access pros.

### ~~2. DNS Belgium registrant fix~~ — **resolved 2026-04-17**

Registrant info corrected via Vercel before the 2026-04-24 deadline.

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

- **`db.transaction()` wrapping in `createBooking()`** — multi-step inserts (booking + participant + relationship) can leave partial state on failure. **Blocked**: the current `drizzle-orm/neon-http` driver doesn't support multi-statement transactions. Move to `neon-serverless` (WebSocket) or `pg` first, then re-introduce. Initial attempt in commit `ea60e63` broke the booking flow (Nadine's task #12) and was reverted in `b95dc35`. The proper fix is a driver migration — see Open Questions #4. **Note**: the public booking action `/book/[slug]/actions.ts` has the same multi-row insert pattern (user + booking + participant + pro_students) and inherits this gap.

### Pro slug → ID migration — run on production

Drop `pro_profiles.slug` on the production DB before deploying the slug-refactor code; otherwise the deployed code will reference a non-existent column and every pro insert will fail (slug was `NOT NULL UNIQUE` and the new code doesn't supply it). Already applied to preview.

```bash
POSTGRES_URL="postgres://prod-..." pnpm tsx scripts/drop-pro-slug-column.ts
```

The script is idempotent (it noop's if the column is already gone). After this runs, the existing pro rows keep their `id` and the new URL pattern (`/book/24`, `/pros/24`, `/member/book/24`) takes effect on next deploy. No redirect table for old slugs — pre-launch only, no real student traffic depended on them.

### Public booking flow — production readiness

Shipped 2026-04-15 → 04-17 (see Recently shipped). Items to verify before flipping the password gate:

- **Production env vars not in `.env.example`.** The new flow needs four vars in Vercel `production` env:
  - `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (client) and `RECAPTCHA_SECRET_KEY` (server) — Google reCAPTCHA v3
  - `KV_REST_API_URL` and `KV_REST_API_TOKEN` — Upstash Redis (rate limiter backend)

  Verify all four are set in Vercel (`vercel env ls --environment=production`). Without Upstash the rate limiter throws (does NOT fail open) and bookings break; without reCAPTCHA the verifier returns score 0 and bookings still go through (intentional graceful degrade). Add all four to `.env.example` so the next dev knows.
- **No password validation surface on register-from-claim.** The post-claim register flow at `/register?email=…&pro=…` should enforce minimum strength on the password field. Verify the `/api/register` POST already validates (it should from earlier work) and that the wizard surfaces the error inline.
- **Token enumeration on `/booked/t/[token]`.** Endpoint has no rate limit. Token entropy is high (32 bytes) so practical risk is low, but worth a per-IP soft cap once we see real traffic.
- **Upstash failover not handled.** If KV is unreachable the rate limiter throws and the booking action fails. Acceptable given Upstash's SLA, but worth a Sentry alert on `tags.area = "rate-limit"` so we notice quickly.
- **Test suite preconditions are implicit.** `src/lib/__tests__/public-booking-flow.test.ts` requires `DUMMY_PRO` and `DUMMY_STUDENT` env vars + a valid Gmail service account; failures are quiet if either is missing. Document in CI setup before wiring tests into a pipeline.

### Sprint B follow-ups (payment flow)

- **Student "retry payment" UI on a failed booking.** When `createBooking` fires the PaymentIntent off-session and Stripe returns `requires_action` (3DS / SCA) or `failed`, the booking is marked `paymentStatus="requires_action"` or `"failed"` and retained. There's no student-facing UI to complete the 3DS flow or retry a declined card. Needs a small client component on `/member/bookings/[id]` that takes the PaymentIntent `client_secret` and runs `stripe.confirmCardPayment`. Lower priority since off-session usually succeeds on the first try, but the row will sit in limbo until the student interacts.
- **Admin "mark as manually refunded" fallback.** `stripe.refunds.create` can fail (network hiccup, already-refunded, payment too old). Today that's surfaced as a console error in `cancelBooking` but the refund has to be reconciled manually in the Stripe dashboard. Add a button in `/admin/payouts` or `/admin/bookings` to set `paymentStatus="refunded"` + `refundedAt` on a booking after a manual Stripe-side refund.
- ~~**Cash-only pros (`allowBookingWithoutPayment`)**~~ — **done**. Cash-only pros (with `allowBookingWithoutPayment=true`) now get `paymentStatus="manual"` on the booking row, the PaymentIntent is skipped entirely, and the confirmation email shows "Payable on site" instead of "Amount charged" (translated in EN/NL/FR). The refund-on-cancel path skips these since `paymentStatus === "manual"` never matches the `"paid"` branch. `/pro/earnings` was already filtering by `paymentStatus = 'paid'`, so manual bookings correctly don't count toward the pro's platform-charged revenue.
- ~~**Cash-only commission collection**~~ — **done**. Cash-only bookings now bill our commission to the pro automatically via `stripe.invoiceItems.create()` attached to the pro's existing subscription customer. The item rolls onto their next monthly/annual invoice alongside the subscription fee — no separate charge, no new pro-side UX. `lesson_bookings.stripe_invoice_item_id` stores the returned ID for reversal at cancel-within-window time via `stripe.invoiceItems.del()`. `calculatePlatformFee` is env-var driven (`NEXT_PUBLIC_PLATFORM_FEE_PERCENT`, default 2.5%). Failures are captured to Sentry with `tags.area = "cash-commission"` and swallowed.
- **Cash-only commission — edge case handling**. The happy path works but a few corners need follow-up:
  - **Pros without an active subscription** (cancelled / expired / past_due). `stripe.invoiceItems.create` still succeeds — the item sits pending on the customer until the next invoice is generated. If the pro never re-subscribes, we need a way to collect standalone. Low frequency since cash-only pros almost always have active subs.
  - **Cancel after invoice has finalised.** `stripe.invoiceItems.del` returns a 400 "cannot delete finalised item" once the item has been attached to an invoice (monthly/annual cycle fired). Today we log + swallow. Needs a manual credit note from the Stripe dashboard. Low frequency since cancellations usually happen within hours or days of booking.
  - **Pending commission visibility for the pro.** No UI currently surfaces "you owe €N in pending cash-only commissions before your next invoice". Pro will see the line items when the invoice arrives. A `/pro/billing` display of pending commissions is a polish item.
  - **Dedicated commission card on `/pro/earnings`.** Separate from the existing "revenue" card (which tracks online-paid bookings), add a "Commission owed" / "Commission paid" card summarising cash-only commission flowing through the invoice-item path. Purely reporting.
  - **Admin manual-reconciliation UI.** For the Sentry-captured failures above (invoice item creation failed, deletion failed post-finalisation, no stripeCustomerId, etc.), give admin a button in `/admin/payouts` or `/admin/bookings` to (a) manually create an invoice item after the fact, (b) mark a booking's commission as "reconciled manually" without touching Stripe, or (c) trigger a one-off standalone invoice for a pro without an active subscription.
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

## Recently shipped (sweep — 2026-04-17, ID-based pro URLs)

- **Vanity slugs replaced with sequence-number URLs** — `pro_profiles.slug` column dropped; route directories renamed from `[slug]` to `[proId]` for `/book/`, `/pros/`, `/(member)/member/book/`. URLs go from `/book/claude-test-pro` to `/book/24`. `pickUniqueProSlug` and `slugifyProName` helpers in `src/lib/pro.ts` deleted. Sitemap, internal Link refs, onboarding, profile editor, register, choose-pros, dashboard quick-rebook, ProPagesList, JoinButton, both seed scripts, and both integration test suites all updated. Migration: `scripts/drop-pro-slug-column.ts` (idempotent). **Run on production before deploy** — see should-fix.

## Recently shipped (sweep — 2026-04-15 → 2026-04-17, public booking flow)

- **Public booking at `/book/[slug]`** — zero-friction wizard, no account required. Multi-location pros get a location step (auto-skipped for single-location); single-duration pros skip the duration step. Phone field uses `libphonenumber-js` (Belgium default, E.164 storage). Bookings confirmed immediately, `paymentStatus="manual"` (Phase A — payment integration on the public path is post-launch).
- **Claim flow at `/api/auth/claim-booking`** — email-verify-only token (7-day JWT, no auto-login). Verified students land on a token-based read-only booking page `/booked/t/[token]` with a register CTA.
- **Pre-fill registration from booking** — `/register` wizard pre-populates name/email/phone from the booking row; scheduling step dropped.
- **Pro-side "email unverified" badge** — surfaces on `/pro/bookings` (list + calendar), in-app notification, and the pro confirmation email when the student hasn't verified.
- **reCAPTCHA v3 + Upstash rate limit** — `book_lesson` action with 0.5 score threshold; 5 bookings/hour per IP+email via `Ratelimit.slidingWindow`. Both fail-tolerant: 3s timeout on `grecaptcha.ready()` (mobile / content blockers), missing token treated as score 0.
- **Case-insensitive email uniqueness** — functional `UNIQUE INDEX on LOWER(email)` on `users` and `user_emails`. One-shot migration `scripts/migrate-email-lower-unique.ts`, applied to preview + prod.
- **Public-booking test suite** — 185 cases in `src/lib/__tests__/public-booking-flow.test.ts` covering scenarios 1-9 (new/unverified/verified branches, honeypot, double-booking, multi-location), with Gmail API integration for end-to-end email verification. Seed via `pnpm tsx scripts/seed-claude-dummies.ts` (creates `dummy-pro-claude@golflessons.be` + `dummy-student-claude@golflessons.be` with 2 locations).
- **Build perf** — removed `lucide-react` (-38 MB) and 3 dead mockup pages (`booking`, `pro-profile`, `student-page`); added `.vercelignore` to skip `docs/`, `scripts/`, and `src/lib/__tests__/` during Vercel upload.
- **Docs**: `docs/public-booking-flow.md` (10 scenarios + FAQ + email checklist + multi-location), `docs/money-flows.md` (full payment flows for student + pro + cash-only paths).

## Recently shipped (sweep — 2026-04-13)

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
