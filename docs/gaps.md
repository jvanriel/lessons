# Gap Analysis — Pre-Launch

Last updated: 2026-04-13 (late afternoon)

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

### ~~2. Trial-ending + payment-failed webhook emails~~ — **done (stale entry)**

Both handlers in `src/app/api/webhooks/stripe/route.ts` are fully
wired: `handleTrialWillEnd` calls `buildTrialEndingEmail` +
`getTrialEndingSubject`, and `handleInvoicePaymentFailed` calls
`buildPaymentFailedEmail` + `getPaymentFailedSubject`. Both templates
exist in EN / NL / FR in `src/lib/email-templates.ts` (TRIAL_ENDING_STRINGS
and PAYMENT_FAILED_STRINGS records). Each email reads the recipient's
preferredLocale from the user row before rendering. The trial-ending
date now uses the locale-aware `formatDate()` helper for consistency
with the rest of the codebase.

### 3. Pre-launch site password hardcoded

- `src/middleware.ts:12` — `SITE_PASSWORD = "prolessons"`. Rotate or remove gate before public launch.

### 4. DNS Belgium registrant fix

- Deadline ~**2026-04-24** (10 days out). Vercel needs to handle. See memory `project_dns_belgium`.

### 5. Pro-authored content + translations + CMS architecture review (urgent)

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

**Stopgap shipped (commit fe47f70 → next push)**: a small italic notice on `/pros/[slug]` and `/pros/[slug]/[pageSlug]` saying "This pro writes their content in their preferred language. Multilingual support is coming soon." in EN/NL/FR. This is honest but not a real fix.

**Recommended next step**: 1-hour design review to pick an approach. My initial lean is **auto-translate via DeepL or Claude**, cached in a `pro_content_translations` table keyed on `(table, id, field, locale)`, regenerated on edit. Avoids forcing pros into a 3-tab editor and works for existing content immediately. Roughly half a day of work plus a small monthly API bill.

## 🟡 Should-fix before launch

- **`db.transaction()`** wrapping in `createBooking()` — multi-step inserts (booking + participant + relationship) can leave partial state on failure. **Blocked**: the current `drizzle-orm/neon-http` driver doesn't support multi-statement transactions. Move to `neon-serverless` (WebSocket) or `pg` first, then re-introduce. Initial attempt in commit `ea60e63` broke the booking flow (Nadine's task #12) and was reverted in `b95dc35`.
- ~~**GDPR data export/delete endpoints**~~ — **done (dev-only stopgap)**. `/dev/gdpr` (dev role required) lets us look up any user by email, see a per-table summary of what data we hold on them, export everything as a single JSON blob (Article 15 / 20), or soft-delete + anonymise their account (Article 17). Deletion hard-deletes push subscriptions, notifications, and comment reactions; soft-deletes comments with a redacted content marker; anonymises the user row and linked emails; and retains lesson_bookings + lesson_participants + stripe_events for tax/audit legitimate-interest reasons. Every deletion is audit-logged to the `events` table with `type = "gdpr.user_deleted"`. This is a **dev-facing tool**, not a self-service user-facing endpoint — when a real GDPR request comes in, dev looks it up manually. Promoting to self-service (profile → "Export my data" / "Delete my account") is a post-launch polish item.
- **Mobile responsiveness audit** — `AvailabilityEditor` 7×48 grid and `BookingWizard` 6-step wizard untested on real phones.
- ~~**Stripe webhook payload typed as `any`**~~ — **done**. Replaced the `type StripeObject = any` alias with proper `Stripe.Checkout.Session` / `Stripe.Subscription` / `Stripe.Invoice` handler signatures + a local `SubscriptionWithPeriod` helper type that patches `current_period_end` / `trial_end` back on (the fields moved in recent Stripe API versions but our account is still on the pre-move version).
- ~~**Health check Stripe signals**~~ — **done**. Health `stripe` check already verified `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_*` env vars + called `stripe.balance.retrieve()`. Now also calls `stripe.prices.retrieve()` for both the monthly and annual plan IDs and asserts `.active === true` on each. Would have caught the `SENTRY-ORANGE-ZEBRA-A` incident where env vars held stale price IDs.
- ~~**Sentry source map upload**~~ — **done (stale entry)**. `next.config.ts:40` is already `silent: !process.env.SENTRY_AUTH_TOKEN` — gated on the auth token rather than `CI`, so source map uploads are loud whenever they're actually being attempted.
- ~~**Locale-aware date formatting — residuals**~~ — **done**. `src/app/(member)/member/bookings/actions.ts` cancel-deadline error is now locale-aware (reads cookie via `getLocale()`, formats via `formatDate()`, uses the new `memberBookings.cancelTooLate` translation key with `{deadline}` placeholder). `src/components/TimezoneNote.tsx` now derives the short timezone abbreviation via `Intl.DateTimeFormat(navigator.language, ...).formatToParts()` instead of a hardcoded `"en-US"` string-split. Admin-side hardcoded locales (`ContentPanel.tsx`, `UserManager`, `payouts`) remain intentionally English-only.

## 🟢 Polish / post-launch

- More empty states (anywhere with a list that can be empty — `/pro/bookings` calendar, coaching chat, pro/students filter views beyond "all").
- Loading skeletons / optimistic UI in booking wizard and chat.
- Accessibility audit: ARIA on icon buttons, contrast on gold-on-cream, keyboard nav on calendar grids.
- Test coverage beyond `src/lib/__tests__/lesson-slots.test.ts` — API endpoints, payment flow, webhooks.
- Comment moderation tools (flagging + admin review).
- Image optimization (`next/image` audit).
- **Drop dead schema columns** `proProfiles.stripeConnectAccountId`, `stripeConnectOnboarded` — Connect is rejected, these never get populated. Migration is risk-free but no visible benefit pre-launch.
- **Pro discovery / filtering on `/pros`** (Nadine task #24) — currently a flat list of every published pro. Acceptable while we launch with 2-3 pros, but won't scale past ~10. A proper implementation needs:
  - Lat/lng on `pro_locations` (schema migration)
  - Geocoding service (Nominatim free vs Google paid) to populate lat/lng on location create
  - Filter UI on `/pros`: city dropdown + radius slider, ideally with sort-by-distance
  - Decision deferred — will do a proper implementation soon, post-launch.
- Nadine's deferred sub-issues from task #6:
  - Embedded `/pros` browser in onboarding instead of flat list.
  - Re-enabling email field after registration (requires verify-new-email flow). **Note**: shipped as a typo-fix-only path in commit 66125d2 (task #23). A full email-change-after-verification flow is still post-launch.

## Open questions

1. **Site password** — keep gate post-launch or open up?
2. **Commission %** — 0% with higher subscription, or % cut?
3. **Refund policy** — auto-refund within cancellation window, no refund outside?
4. **DB driver migration** — green-light moving from `neon-http` to `neon-serverless` (WebSocket) post-launch so we can use transactions?

## Cross-references

- Nadine's testing feedback lives in the in-app admin Kanban (DB-backed `tasks` + `comments` tables). Read via `/admin/tasks`.
- Payment model decision: `memory/project_payments_model.md`
- Testing accounts: `memory/feedback_testing_accounts.md`
- DNS deadline: `memory/project_dns_belgium.md`
