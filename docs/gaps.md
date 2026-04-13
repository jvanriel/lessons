# Gap Analysis — Pre-Launch

Last updated: 2026-04-13

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

### 2. Trial-ending + payment-failed webhook emails

- `src/app/api/webhooks/stripe/route.ts:217,269` — both still `TODO`.
- Gmail-API `sendEmail` (`src/lib/mail.ts`) is fully implemented; just needs templates + wiring.

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
- **GDPR data export/delete endpoints** — privacy policy promises them; nothing exists. Article 15/17/20 compliance.
- **Mobile responsiveness audit** — `AvailabilityEditor` 7×48 grid and `BookingWizard` 6-step wizard untested on real phones.
- **Stripe webhook payload typed as `any`** — `src/app/api/webhooks/stripe/route.ts:11`. Type narrowing for safety.
- **Health check** doesn't verify webhook secret presence or other Stripe production signals.
- **Sentry source map upload** — `next.config.ts:37` has `silent: !process.env.CI`. Verify Vercel sets `CI=1` or sourcemaps silently fail to upload, leaving production errors as minified noise.
- **Locale-aware date formatting sweep** — `formatDate(locale)` helper exists and is wired into `/member/bookings`, `/member/dashboard`, the booking wizard, `/pro/bookings` (BookingsView + BookingsCalendar), `/pro/students/StudentBookings`, `/pro/earnings`, `/member/dashboard/CancelBookingDialog`, and `/member/dashboard/QuickRebook`. ~20 other files still call `toLocaleDateString("en-US", ...)` directly. Remaining: admin-side (UserManager, ContentPanel, payouts), pro-side (`AvailabilityEditor`, `EditStudentDialog`, `ProQuickBook`), various smaller dialogs.
- **Pro-side editor component translations** — page chrome on `/pro/profile`, `/pro/locations`, `/pro/availability` is now translated (`000d7ec`). The big editor components themselves still have English labels and helper text: `LocationManager`, `AvailabilityEditor`, `EditStudentDialog`, `ProQuickBook`, `StudentManager`. Each is a focused 30-50 string sweep; together they're maybe a half day. Highest visibility next: `LocationManager` (pros use it during onboarding) and `AvailabilityEditor` (the 7×48 grid is core to scheduling).
- **Welcome-as-pro email** — pros currently get the verification email and land on `/pro/subscribe` immediately, but no warm welcome message. Student welcome already exists in `email-templates.ts` (`buildWelcomeEmail`); just needs pro-specific copy in 3 locales.

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
