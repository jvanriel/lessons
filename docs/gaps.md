# Gap Analysis — Pre-Launch

Last updated: 2026-05-02

Living document tracking what's left before golflessons.be can go live.
Cross-reference for sprint planning and Nadine's testing feedback.

## 🔴 Go-live blockers

### 1. Pro-authored content + translations + CMS architecture review

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

### Booking engine — open audit items

(All open audit items closed as of 2026-05-02 — see Recently shipped
sweep below for the dynamic hour-range fix.)

### Test coverage gaps

(All booking-engine test gaps closed as of 2026-05-02 — see Recently
shipped sweep below for the slot-uniqueness + cron route handler
integration tests.)

### ~~`db.transaction()` wrapping~~ — done (2026-05-02)

Driver swapped from `neon-http` to `neon-serverless` in v1.1.6. Then
v1.1.7 wrapped all four booking-insert paths (`createBooking`,
`quickCreateBooking`, `createPublicBooking`, `proCreateBooking`) in
`db.transaction()` so booking + participant + (where applicable)
proStudents upsert commit together. Stripe / commission /
notification side-effects stay outside the transaction so a Stripe
error doesn't roll back the booking — the row persists with
`paymentStatus="failed"` for retry, same as before.

### Public booking flow — production readiness

Shipped 2026-04-15 → 04-17. Items to verify before flipping the password gate:

- **Production env vars not in `.env.example`.** The new flow needs four vars in Vercel `production` env:
  - `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (client) and `RECAPTCHA_SECRET_KEY` (server) — Google reCAPTCHA v3
  - `KV_REST_API_URL` and `KV_REST_API_TOKEN` — Upstash Redis (rate limiter backend)

  Verify all four are set in Vercel (`vercel env ls --environment=production`). Without Upstash the rate limiter throws (does NOT fail open) and bookings break; without reCAPTCHA the verifier returns score 0 and bookings still go through (intentional graceful degrade). Add all four to `.env.example` so the next dev knows.
- **No password validation surface on register-from-claim.** The post-claim register flow at `/register?email=…&pro=…` should enforce minimum strength on the password field. Verify the `/api/register` POST already validates (it should from earlier work) and that the wizard surfaces the error inline.
- **Token enumeration on `/booked/t/[token]`.** Endpoint has no rate limit. Token entropy is high (32 bytes) so practical risk is low, but worth a per-IP soft cap once we see real traffic.
- **Upstash failover not handled.** If KV is unreachable the rate limiter throws and the booking action fails. Acceptable given Upstash's SLA, but worth a Sentry alert on `tags.area = "rate-limit"` so we notice quickly.
- **Test suite preconditions are implicit.** `src/lib/__tests__/public-booking-flow.test.ts` requires `DUMMY_PRO` and `DUMMY_STUDENT` env vars + a valid Gmail service account; failures are quiet if either is missing. Document in CI setup before wiring tests into a pipeline.

### Payment flow follow-ups

- **Student "retry payment" UI on a failed booking.** When `createBooking` fires the PaymentIntent off-session and Stripe returns `requires_action` (3DS / SCA) or `failed`, the booking is marked `paymentStatus="requires_action"` or `"failed"` and retained. There's no student-facing UI to complete the 3DS flow or retry a declined card. Needs a small client component on `/member/bookings/[id]` that takes the PaymentIntent `client_secret` and runs `stripe.confirmCardPayment`. Lower priority since off-session usually succeeds on the first try, but the row will sit in limbo until the student interacts.
- **Admin "mark as manually refunded" fallback.** `stripe.refunds.create` can fail (network hiccup, already-refunded, payment too old). Today that's surfaced as a console error in `cancelBooking` but the refund has to be reconciled manually in the Stripe dashboard. Add a button in `/admin/payouts` or `/admin/bookings` to set `paymentStatus="refunded"` + `refundedAt` on a booking after a manual Stripe-side refund.
- **Cash-only commission — edge case handling.** The happy path works but a few corners need follow-up:
  - **Pros without an active subscription** (cancelled / expired / past_due). `stripe.invoiceItems.create` still succeeds — the item sits pending on the customer until the next invoice is generated. If the pro never re-subscribes, we need a way to collect standalone. Low frequency since cash-only pros almost always have active subs.
  - **Cancel after invoice has finalised.** `stripe.invoiceItems.del` returns a 400 "cannot delete finalised item" once the item has been attached to an invoice (monthly/annual cycle fired). Today we log + swallow. Needs a manual credit note from the Stripe dashboard. Low frequency since cancellations usually happen within hours or days of booking.
  - **Pending commission visibility for the pro.** No UI currently surfaces "you owe €N in pending cash-only commissions before your next invoice". Pro will see the line items when the invoice arrives. A `/pro/billing` display of pending commissions is a polish item.
  - **Dedicated commission card on `/pro/earnings`.** Separate from the existing "revenue" card (which tracks online-paid bookings), add a "Commission owed" / "Commission paid" card summarising cash-only commission flowing through the invoice-item path. Purely reporting.
  - **Admin manual-reconciliation UI.** For the Sentry-captured failures above (invoice item creation failed, deletion failed post-finalisation, no stripeCustomerId, etc.), give admin a button in `/admin/payouts` or `/admin/bookings` to (a) manually create an invoice item after the fact, (b) mark a booking's commission as "reconciled manually" without touching Stripe, or (c) trigger a one-off standalone invoice for a pro without an active subscription.
- **Stripe webhook on production** needs the live-mode signing secret set (`STRIPE_WEBHOOK_SECRET`) and the endpoint registered in the Stripe dashboard pointing at `/api/webhooks/stripe`. Sandbox webhook secret is already in `.env.local` for preview.

## 🟢 Polish / post-launch

- More empty states (anywhere with a list that can be empty — `/pro/bookings` calendar, coaching chat, pro/students filter views beyond "all").
- Loading skeletons / optimistic UI in booking wizard and chat.
- Accessibility audit: ARIA on icon buttons, contrast on gold-on-cream, keyboard nav on calendar grids.
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

## Recently shipped (sweep — 2026-05-02, v1.1.0 + v1.1.1 — timezone correctness + version surface)

End-to-end timezone audit + the supporting infrastructure to keep the booking engine honest as non-Brussels pros land.

- **Cancel-deadline TZ bug.** `cancelBooking` parsed lessonStart in server TZ; on Vercel UTC, a 10:00 Brussels lesson stayed cancellable until 12:00 Brussels. Now uses `getProLocationTimezone` + `fromZonedTime`. Cancel client components take a `timezone` prop and pass it to `checkCancellationAllowed`.
- **Slot-uniqueness race.** Partial unique index `lesson_bookings_slot_confirmed_idx` on `(pro_profile_id, pro_location_id, date, start_time) WHERE status='confirmed'` applied to preview + prod. `createBooking`/`quickCreateBooking`/`createPublicBooking` all wrap inserts in try/catch with `isSlotConflictError` and return the friendly "slot just got taken" message.
- **24 h reminder cron TZ.** Cron joins `locations`, uses `fromZonedTime(b.date+b.startTime, b.locationTz)` per booking, passes `tz` through to `buildIcs`. SQL pre-filter widened by ±1 day so any UTC-12..+14 zone is covered.
- **Engine signatures require `tz`.** `computeAvailableSlots`, `checkCancellationAllowed`, `buildIcs`, `buildCancelIcs` no longer default to Brussels. `getProLocationTimezone` throws on missing rows instead of returning Brussels. `BookingsCalendar` `timezone` prop required. 7 cross-TZ tests prove correctness end-to-end (London, Tokyo, NYC, Brussels-DST, NYC-DST).
- **Locations form: real timezone field.** New `<TimezonePicker />` wired into `/pro/locations` (add + edit) and the onboarding wizard. Country-derived inference, validates against `Intl.supportedValuesOf("timeZone")` server-side, no browser-TZ guessing. All read paths (`getMyLocations`, `getProLocations`, `getPublicLocations`, `getAllBookablePros`) surface `timezone`.
- **Schema cleanup.** `locations.timezone` `DEFAULT 'Europe/Brussels'` dropped on both DBs after backfill. Future inserts must specify; a missing value fails loudly at INSERT. Residual `?? "Europe/Brussels"` fallbacks on `proProfiles.defaultTimezone` removed (column is notNull, dead defensive code).
- **Quick Book pricing parity.** `quickCreateBooking` was inserting bookings without `priceCents` / `platformFeeCents` / `paymentStatus`, never firing a PaymentIntent; the pro email hardcoded "Cash on the day" regardless of the pro's setting. Both `createBooking` and `quickCreateBooking` now route through the shared `loadBookingPricing` + `runOffSessionCharge` + `claimCashCommission` helpers in `src/lib/booking-charge.ts`. Pro email re-reads the booking row after the charge so the actual `paymentStatus` lands in the notification.
- **`todayLocal()` callers** (member/bookings, member/dashboard, admin) switched to TZ-aware "today". `member/bookings/page.tsx` does per-booking `todayInTZ(b.locationTimezone)` (cached per TZ); the coarse pages anchor to Europe/Brussels with a comment.
- **`computeSuggestedDate` TZ-aware.** Quick Book suggestion now anchors to the same location TZ as the availability window; late-evening users no longer see a suggestion drift a day before windowStart and get silently stomped.
- **`BookingsCalendar` period filtering.** Pro week view now filters availability by each slot's `validFrom`/`validUntil` window per rendered date, not just by `dayOfWeek`. Multi-period schedules (task 78) no longer paint a summer-only green band on winter weeks. 6 new RTL regression tests pin the boundary cases.
- **`BookingsCalendar` dynamic hour range.** Replaced the hardcoded 07:00–21:00 grid with `computeHourRange(bookings, availability)` that defaults to 07–21 but expands to fit any booking or availability slot outside that band, clamped 0..24 with end-minute round-up so a 21:30 booking widens to 22. 7 new tests (6 unit + 1 render-level for a 22:00 booking on-grid).
- **PWA version detection.** `/sw.js` is now a Next.js route that bakes `BUILD_ID` into both file content and `CACHE_NAME` (per-deploy byte difference → reliable `updatefound`). `/api/version` is `force-dynamic`. `DeploymentChecker` cache-busts the fetch URL on top of `cache: "no-store"` to defeat iOS Safari quirks.
- **About page + changelog.** New `/about` shows app version (semver from `package.json.version`, starting at v1.1.0), build ID, build time, branch + environment in non-prod, manual update-check button, and the rendered `docs/CHANGELOG.md`. Linked from sidebar + mobile More for every authenticated user.
- **Migrations applied to preview + prod:**
  - `lesson_bookings_slot_confirmed_idx` (race-safe slot reservation)
  - `locations.timezone` backfill (no rows changed)
  - `locations.timezone` `DEFAULT` dropped
  - `scripts/verify-tz-migrations.ts` regression-check committed
- **Tests:** 247 cases across 12 pure/UI suites + 20 cases in the Stripe integration suite, 267 total. New unit tests for `decideBookingPricing` (10), `computeSuggestedDate` + `isoDayOfWeekFromDate` (26), `parseChangelog` + `renderItem` (15), `TimezonePicker` (12 RTL), `DeploymentChecker` (4 RTL). Integration adds: `loadBookingPricing` (7) + Phase 8 helper coverage in `stripe-flows.test.ts` (3).
- **Tooling:** `.claude/skills/stage` + `.claude/skills/ship` codify the commit/CHANGELOG/version-bump and merge-to-main flows.

## Recently shipped (sweep — 2026-04-13 → 2026-04-17)

Earlier work that landed before the timezone audit:

- **V1 payment flow** — pros set per-duration prices; booking flow charges the student's saved Stripe payment method off-session (`paymentStatus: pending → paid / requires_action / failed`); 3DS / SCA path leaves the row in `requires_action` for retry; webhook reconciliation; refund-on-cancel-within-window via `stripe.refunds.create`. Confirmation email shows "Amount charged" (locale-aware EUR).
- **Cash-only pros** — `allowBookingWithoutPayment=true` skips the PaymentIntent entirely; the platform commission is billed via `stripe.invoiceItems.create` against the pro's subscription customer and rolls onto their next monthly invoice. Cancel within window deletes the pending invoice item.
- **Public booking at `/book/[proId]`** — zero-friction wizard, no account required. Multi-location pros get a location step (auto-skipped for single-location); single-duration pros skip the duration step. Bookings confirmed immediately; first email is a claim-and-verify magic link.
- **Claim-and-verify flow at `/api/auth/claim-booking`** — 7-day JWT token, no auto-login; verified students land on a token-based read-only booking page `/booked/t/[token]` with a register CTA. Pre-fill registration with name/email/phone from the booking row.
- **Pro-side "email unverified" badge** on `/pro/bookings` (list + calendar) + in-app notification + pro confirmation email when the student hasn't verified yet.
- **reCAPTCHA v3 + Upstash rate limit** — `book_lesson` action with 0.5 score threshold; 5 bookings/hour per IP+email via `Ratelimit.slidingWindow`. Both fail-tolerant.
- **ID-based pro URLs** — `pro_profiles.slug` dropped; routes renamed from `[slug]` to `[proId]`. Already applied to preview + prod.
- **Case-insensitive email uniqueness** — functional `UNIQUE INDEX on LOWER(email)` on `users` and `user_emails`. Applied to preview + prod.
- **Public-booking test suite** — 185 cases in `public-booking-flow.test.ts` covering scenarios 1-9 incl. honeypot, double-booking, multi-location, with Gmail API integration for end-to-end email verification.
- **Four-pass i18n audit** — every user-visible string in member/* and pro/* translated in EN / NL / FR.
- **Welcome-as-pro email** — 4-step onboarding guide wired into `/pro/register`.
- **Subscription prices centralised in `src/lib/pricing.ts`** sourced from `NEXT_PUBLIC_PRO_PRICE_MONTHLY` / `_ANNUAL` env vars.
- **Locale-aware date formatting sweep** (helper + migration of all call sites).
- **Tasks Kanban** — full New-task modal + first-comment-on-create + `tasks.description` column dropped (data migrated to comments).
- **`/dev/gdpr` tool** — dev-only GDPR Article 15 / 17 / 20 handling.
- **Mobile responsiveness audit** — Playwright-verified on 375×812.
- **Health check** — validates configured Stripe price IDs via `stripe.prices.retrieve()` and asserts `.active === true`.
- **Transient-error retries** — Gmail `sendEmail` retries once on socket hang up / ECONNRESET / 5xx; Stripe SDK gets `maxNetworkRetries: 2`; new shared `src/lib/retry.ts` helper wraps `@vercel/blob` `put` calls.
- **Trial-ending + payment-failed webhook emails** wired in.
- **Sentry source map upload** — `silent: !SENTRY_AUTH_TOKEN`.
- **PWA install bootstrap** — swapped raw `<script dangerouslySetInnerHTML>` for `next/script`.
- **`.vercelignore`** — skip `docs/`, `scripts/`, `src/lib/__tests__/` during Vercel upload.

## Open questions

1. **Commission %** — 0% with higher subscription, or % cut?
2. **Refund policy** — auto-refund within cancellation window, no refund outside?
3. **DB driver migration** — green-light moving from `neon-http` to `neon-serverless` (WebSocket) post-launch so we can use transactions? This is the one blocker on real `db.transaction()` support.

## Cross-references

- Nadine's testing feedback lives in the in-app admin Kanban (DB-backed `tasks` + `comments` tables). Read via `/admin/tasks`.
- Payment model decision: `memory/project_payments_model.md`
- Testing accounts: `memory/feedback_testing_accounts.md`
