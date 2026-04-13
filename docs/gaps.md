# Gap Analysis — Pre-Launch

Last updated: 2026-04-13

Living document tracking what's left before golflessons.be can go live.
Cross-reference for sprint planning and Nadine's testing feedback.

## Done since initial gap analysis

- **Stripe Connect blocker** — resolved by decision: direct platform Stripe + manual SEPA payouts. No Connect onboarding needed.
- **Nadine's test accounts** — `dummy-pro-dickens@golflessons.be` and `dummy-student-dickens@golflessons.be` confirmed; inboxes readable via Gmail.
- **i18n gaps in onboarding wizard** — steps 3-5 (ChooseProsStep, SchedulingStep, PaymentStep) translated; language switcher race fixed; registration persists `preferredLocale`.
- **Contact page** (`/contact`) — fixes 3 dead CTAs across the marketing site (homepage "Neem contact op" / "Meer informatie" and `/for-pros` "Aan de slag").
- **Wizard escape hatch** — "Maybe later" button so users aren't trapped in the onboarding wizard.
- **Kanban "To Test" column** + 4-col layout fix + tighter UI.

## 🔴 Go-live blockers

### 1. V1 payment flow (Sprint B — the big one)
- PaymentIntent on platform Stripe account at booking confirmation (no `transfer_data`, no `application_fee_amount`).
- Booking wizard payment step — Stripe Checkout (simpler) vs Elements.
- Webhook handlers: `payment_intent.succeeded` → mark booking `paymentStatus: paid`; `payment_intent.payment_failed` → mark `failed` + email student.
- Idempotency on retries to avoid double-charging.
- Refund flow: cancellations within window auto-refund; outside window no refund (document policy).
- Bancontact support (Belgian market) — already partially scaffolded in SetupIntent code.
- Admin payouts view — aggregate paid bookings per pro, mark batches as paid out, execute SEPA transfer manually from platform account.
- Commission decision (0% + higher subscription, or % cut).

### 2. Trial-ending + payment-failed webhook emails
- `src/app/api/webhooks/stripe/route.ts:217,269` — both still `TODO`.
- Gmail-API `sendEmail` (`src/lib/mail.ts`) is fully implemented; just needs templates + wiring.

### 3. `/api/ai` endpoint
- Has `TODO` and **no auth**. Either delete or secure before public launch.

### 4. Pre-launch site password hardcoded
- `src/middleware.ts:12` — `SITE_PASSWORD = "prolessons"`. Rotate or remove gate before public launch.

### 5. DNS Belgium registrant fix
- Deadline ~**2026-04-24** (10 days out). Vercel needs to handle. See memory `project_dns_belgium`.

## 🟡 Should-fix before launch

- **Rate limiting** on `/api/register`, `/api/auth/*`, payment endpoints. Brute-force / enumeration risk.
- **`db.transaction()`** wrapping in `createBooking()` — multi-step inserts (booking + participant + relationship) can leave partial state on failure.
- **`robots.txt` + `app/sitemap.ts`** for SEO of pro pages. No sitemap = pro profiles invisible to search engines.
- **GDPR data export/delete endpoints** — privacy policy promises them; nothing exists. Article 15/17/20 compliance.
- **Per-segment `error.tsx`** boundaries for `(pro)`, `(member)`, `(admin)` — currently one root error page for everything.
- **Mobile responsiveness audit** — `AvailabilityEditor` 7×48 grid and `BookingWizard` 6-step wizard untested on real phones.
- **Stripe webhook payload typed as `any`** — `src/app/api/webhooks/stripe/route.ts:11`. Type narrowing for safety.
- **Health check** doesn't verify webhook secret presence or other Stripe production signals.
- **Update `pros.feature2.desc`** copy in EN+NL — still says "Stripe Connect" which is now wrong (we use direct + SEPA).
- **Drop dead schema columns** `proProfiles.stripeConnectAccountId`, `stripeConnectOnboarded`. Separate migration, not urgent.
- **Sentry source map upload** — `next.config.ts:37` has `silent: !process.env.CI`. Verify Vercel sets `CI=1` or sourcemaps silently fail to upload, leaving production errors as minified noise.

## 🟢 Polish / post-launch

- Empty states (no bookings, no students, no pros).
- Loading skeletons / optimistic UI in booking wizard and chat.
- Accessibility audit: ARIA on icon buttons, contrast on gold-on-cream, keyboard nav on calendar grids.
- Test coverage beyond `src/lib/__tests__/lesson-slots.test.ts` — API endpoints, payment flow, webhooks.
- `.env.example` documenting required env vars.
- Comment moderation tools (flagging + admin review).
- Image optimization (`next/image` audit).
- Nadine's deferred sub-issues from task #6:
  - Embedded `/pros` browser in onboarding instead of flat list.
  - Region / radius filtering on `/pros`.
  - Re-enabling email field after registration (requires verify-new-email flow).

## Open questions

1. **Vercel Sev 1** — status?
2. **Site password** — keep gate post-launch or open up?
3. **`/api/ai`** — what is it, keep or delete?
4. **Commission %** — 0% with higher subscription, or % cut?
5. **Refund policy** — auto-refund within cancellation window, no refund outside?

## Cross-references

- Nadine's testing feedback lives in the in-app admin Kanban (DB-backed `tasks` + `comments` tables). Read via `/admin/tasks`.
- Payment model decision: `memory/project_payments_model.md`
- Testing accounts: `memory/feedback_testing_accounts.md`
- DNS deadline: `memory/project_dns_belgium.md`
