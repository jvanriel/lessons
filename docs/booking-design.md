# Booking design

How the lesson-booking system works end to end. Aimed at a new
contributor reading the code for the first time, or a future-you
trying to remember why a particular row exists.

This doc describes the **current implementation**. Per-flow happy-path
stories live in:

- `docs/public-booking-flow.md` — the unauthenticated wizard, claim
  flow, multi-location branches, manual test scenarios.
- `docs/money-flows.md` — Stripe payments, commission, refunds,
  cash-only billing.
- `docs/booking-correctness.md` — how we prove bookings land on the
  right day under multi-TZ + DST conditions.
- `docs/gaps.md` — open audit items + what's been shipped lately.

## Mental model

> A **booking** is a (`pro`, `location`, `date`, `startTime` →
> `endTime`) row that says "this pro will teach this student in this
> place at this wall-clock time." Every wall-clock value is in the
> **location's** IANA timezone — never the server's, never the
> student's, never UTC.

Every other piece of the system follows from that:

- **Availability** is a recurring weekly grid per (`pro`, `location`),
  optionally bounded by date ranges (multi-period schedules), with
  per-date overrides for vacation / extra hours / blocked hours.
- **Slots** are the duration-sized intervals the engine computes for
  a given date by intersecting templates, overrides and existing
  bookings.
- **Pricing + payment** is layered on top of the booking row —
  shared between every entry path so an online-pay pro's student
  always gets charged, regardless of which UI created the row.
- **Cancellation** + **reminders** read the same wall-clock time and
  convert it to a UTC instant via the location's TZ.

## Data model

The booking surface lives in seven Postgres tables. Schema is in
`src/lib/db/schema.ts`; field-level docs are in the source.

```
locations                   pro_profiles                users
   │ name, address,            │ displayName, bio,         │ name, email,
   │ city, country,            │ lessonPricing,            │ phone,
   │ timezone (NOT NULL)       │ extraStudentPricing,      │ stripeCustomerId
   │                           │ allowBookingWithout-      │
   │                           │   Payment, bookingNotice, │
   │                           │   bookingHorizon,         │
   │                           │   cancellationHours,      │
   │                           │   defaultTimezone         │
   │                           │                           │
   ▼                           ▼                           ▼
┌───────────────┐         ┌──────────────────┐       ┌────────────────────┐
│ pro_locations │ ◄────── │ pro_availability │       │ lesson_bookings    │
│ (junction)    │         │ (weekly grid)    │       │ ────────────────── │
│ ──────────────│         │ ──────────────── │       │ proProfileId,      │
│ proProfileId, │         │ proLocationId,   │       │ proLocationId,     │
│ locationId,   │         │ dayOfWeek,       │       │ bookedById,        │
│ active,       │         │ startTime,       │       │ date, startTime,   │
│ sortOrder,    │         │ endTime,         │       │ endTime,           │
│ notes,        │         │ validFrom,       │       │ status, notes,     │
│ price-        │         │ validUntil       │       │ priceCents,        │
│   Indication  │         └──────────────────┘       │ platformFeeCents,  │
└───────────────┘                                    │ paymentStatus,     │
       ▲                                             │ stripePI Id,       │
       │                                             │ stripeInvoiceItem, │
       │  ┌─────────────────────────────┐            │ paidAt, refundedAt,│
       └──│ pro_availability_overrides  │            │ cancelledAt,       │
          │ (per-date adds / blocks)    │            │ manageToken        │
          │ ─────────────────────────── │            └────────────────────┘
          │ proLocationId (nullable),   │
          │ date,                       │            ┌────────────────────┐
          │ type ("blocked"/"available"),            │ lesson_participants│
          │ startTime, endTime,         │            │ ────────────────── │
          │ reason                      │            │ bookingId,         │
          └─────────────────────────────┘            │ firstName, last,   │
                                                     │ email, phone       │
          ┌─────────────────────────────┐            └────────────────────┘
          │ pro_schedule_periods        │
          │ (period defs for task 78)   │
          │ ─────────────────────────── │
          │ proProfileId,               │
          │ validFrom, validUntil       │
          └─────────────────────────────┘
```

### Why each table exists

- **`locations`** — physical place. One canonical `timezone`, shared
  by every pro who teaches there. NOT NULL after the 2026-05-02
  schema cleanup; every insert path now writes an explicit IANA zone
  validated by `isValidIanaTimezone()` (`src/lib/timezones.ts`).
- **`pro_locations`** — junction. Lets two pros share a location row
  without forking pricing/notes. `active` flag hides a location from
  the booking flow without deleting it; `sortOrder` controls the
  picker.
- **`pro_availability`** — the recurring weekly template. One row per
  (pro, location, dayOfWeek, time-window). `validFrom` / `validUntil`
  bound the row to a schedule period (multi-period support — task 78).
- **`pro_schedule_periods`** — authoritative period definitions, so
  empty periods (vacation / closed) can persist without slot rows.
  The slot engine reads `pro_availability` directly; the period table
  is editor metadata.
- **`pro_availability_overrides`** — date-specific adjustments.
  `type='blocked'` removes hours, `type='available'` adds hours.
  `proLocationId` nullable: a null override applies to every location
  the pro teaches at (whole-day vacation across all clubs).
- **`lesson_bookings`** — confirmed bookings. Holds the `date` /
  `startTime` / `endTime` wall-clock-in-location-TZ values, plus all
  pricing + Stripe state.
- **`lesson_participants`** — the actual students in the lesson, with
  their contact details. One row per attendee. The `bookedBy` user
  on the booking row may differ from the participant (a student
  booking on behalf of a friend).

## Timezones (Model A — location-anchored)

This is **the** correctness story for booking times. See
`docs/booking-correctness.md` for the long version; the short one:

1. Every wall-clock time stored in the DB (booking, availability,
   override, schedule period bound) is in the **location's** IANA
   timezone.
2. Every read that compares to "now" goes through
   `fromZonedTime(date+time, locationTz)` from `date-fns-tz` to get a
   UTC instant.
3. Every ICS DTSTART/DTEND emits the same UTC instant with the
   trailing `Z` so calendar apps don't reinterpret the wall clock.

The slot engine + ICS path are TZ-clean (covered by 7 cross-TZ tests
in `lesson-slots.test.ts` for London, Tokyo, NYC, Brussels-DST,
NYC-DST). The audit in 2026-05 cleaned up the **callers** that had
re-implemented local-time parsing or compared against the server's
`todayLocal()` — see gaps.md §0 for the full list.

`getProLocationTimezone(proLocationId)` (`src/lib/pro.ts`) is the
canonical resolver. It throws on missing rows rather than returning
Brussels — silent fallbacks were the bug class we eliminated.

## Slot computation engine

`src/lib/lesson-slots.ts` is the single source of truth for "what
slots can a student book on this date?" Pure functions, fully
unit-tested (`lesson-slots.test.ts`, 109 cases).

### `computeAvailableSlots`

```ts
function computeAvailableSlots(
  dateStr: string,                      // YYYY-MM-DD in location TZ
  templates: AvailabilityTemplate[],    // weekly grid
  overrides: AvailabilityOverride[],    // per-date adjustments
  bookings: ExistingBooking[],          // already-booked slots on this date
  bookingNoticeHours: number,           // pro's notice setting
  duration: number,                     // requested lesson duration in minutes
  now: Date | undefined,                // injectable; pass undefined for real now
  timezone: string,                     // REQUIRED — location's IANA zone
): AvailableSlot[]
```

Algorithm, in order:

1. **Day-of-week filter.** Convert the date string to ISO day-of-week
   (Monday = 0..Sunday = 6) and pick template rows that match. Filter
   out templates whose `validFrom`/`validUntil` window doesn't cover
   the date.
2. **Apply overrides.** `type='blocked'` subtracts the override's
   time window from the union of remaining template windows
   (full-day blocks empty the array). `type='available'` appends a
   new window.
3. **Subtract bookings.** Each existing confirmed booking removes its
   `[startTime, endTime)` from every overlapping window.
4. **Slice into duration-sized slots.** Walk each remaining window in
   30-minute increments and emit `[cursor, cursor+duration]` pairs
   that fit.
5. **Filter by booking notice.** Compute `thresholdMs = now +
   bookingNoticeHours`. Each candidate slot is converted to a UTC
   instant via `fromZonedTime(date+startTime, timezone)`; only slots
   whose UTC start is **strictly after** the threshold survive.

### Engine signatures all require `tz`

After the 2026-05 audit:

- `computeAvailableSlots(..., timezone: string)`
- `checkCancellationAllowed(..., timezone: string)`
- `buildIcs({ ..., tz: string })`
- `buildCancelIcs({ ..., tz: string })`

No defaults. Every caller resolves `tz` explicitly from
`locations.timezone` (typically via `getProLocationTimezone()`). The
removed Brussels default was the source of multiple silently-wrong
behaviours for non-Brussels pros.

## Booking entry points

Four code paths can create a booking. They all converge on the same
`lesson_bookings` insert + the same shared pricing / charge / commission
helpers.

| Entry | Server action | Caller | Auth | Notes |
|---|---|---|---|---|
| Member booking wizard | `createBooking` (`src/app/(member)/member/book/actions.ts`) | `/member/book/[proId]` | logged-in member | full pricing + Stripe charge |
| Quick Book (rebook) | `quickCreateBooking` (same file) | member dashboard widget | logged-in member | uses saved preferences; same pricing path |
| Public wizard | `createPublicBooking` (`src/app/book/[proId]/actions.ts`) | `/book/[proId]` | unauthenticated | creates a stub user + sends claim-and-verify email; cash-only Phase A (no Stripe charge) |
| Pro-side booking | `proCreateBooking` (`src/app/(pro)/pro/students/actions.ts`) | pro adds a booking on a student's behalf | logged-in pro | bypasses booking-notice + payment gates; pro charges separately |

Slot validation, slot insertion, and pro notification are identical
across the first three. The pro-side path skips the booking-notice
check and the pre-flight slot availability check (the pro is
authoritative — they can override).

## Slot-uniqueness race protection

Before 2026-05, the flow was `getAvailableSlots → some(...) → INSERT`
with no atomicity, so two concurrent bookings could both succeed for
the same slot. The HTTP Neon driver doesn't support transactions, so
we mitigated at the DB layer:

```sql
CREATE UNIQUE INDEX lesson_bookings_slot_confirmed_idx
ON lesson_bookings (pro_profile_id, pro_location_id, date, start_time)
WHERE status = 'confirmed';
```

All three insert sites wrap the `INSERT` in `try { ... } catch (err)
{ if (isSlotConflictError(err)) return slotUnavailable }`. The helper
lives in `src/lib/db/index.ts` and matches PG's `23505` SQLSTATE +
the index name. Migration: `scripts/migrate-booking-slot-unique.ts`.

The deeper "wrap booking + participant + relationship inserts in a
transaction" follow-up is blocked on the driver swap (see gaps.md
🟡 db.transaction()).

## Pricing + payment

`src/lib/booking-charge.ts` exports three helpers shared by every
booking action:

- **`decideBookingPricing(row, duration, count)`** — pure function.
  Given a pro's pricing row + the requested booking shape, returns
  `{ priceCents, platformFeeCents, paymentStatus, cashOnly, isComp }`
  or `{ ok: false, errorKey: "noPriceForDuration" }`. Unit-tested
  for online / cash-only / comp / group-rate / no-price paths.
- **`loadBookingPricing(proProfileId, ...)`** — DB-loading wrapper
  around `decideBookingPricing`.
- **`runOffSessionCharge({ bookingId, userId, ... })`** — fires
  `stripe.paymentIntents.create` off-session and reconciles the
  booking row (`paid` / `requires_action` / `failed`). Idempotent via
  `booking-{id}-v1`. Errors are Sentry-captured + the row goes to
  `failed`, retainable from `/member/bookings`.
- **`claimCashCommission({ bookingId, ..., platformFeeCents })`** —
  for cash-only bookings: posts an invoice item to the pro's
  subscription Stripe customer so commission rolls onto the next
  invoice. Idempotent via `commission-{id}-v1`. Item id is stored
  on `lesson_bookings.stripe_invoice_item_id` for cancel-window
  reversal via `stripe.invoiceItems.del()`.

`paymentStatus` semantics:

- `manual` → cash-only pro, platform never touches the lesson money.
- `pending` → online charge in flight.
- `paid` → succeeded (also a backstop for free / zero-price bookings).
- `requires_action` → 3DS / SCA — student needs to complete client-side.
- `failed` → declined / no PM / network — student can retry.
- `refunded` → cancelled within window with `paymentStatus="paid"`.

The full money story (commission percentages, Bancontact, SEPA
payouts, webhook reconciliation) lives in `docs/money-flows.md`.

## Cancellation

`cancelBooking` (`src/app/(member)/member/bookings/actions.ts`):

1. Resolve `tz = getProLocationTimezone(booking.proLocationId)`.
2. `check = checkCancellationAllowed(...)` — returns `{ canCancel,
   deadline }`. Deadline is `lessonStart - cancellationHours`,
   computed via `fromZonedTime` so it's right regardless of server TZ.
3. **Lesson-passed guard.** If `lessonStart <= now` (also via
   `fromZonedTime`), block. The pre-fix version parsed in server TZ
   and let students cancel up to 2 h after a Brussels lesson started.
4. **Inside the cancellation window** (`canCancel === true`):
   - `paid` booking → fire `stripe.refunds.create` (idempotency key
     `refund-{id}-v1`) → flip to `refunded` + `refundedAt`.
   - `manual` booking with `stripeInvoiceItemId` → call
     `stripe.invoiceItems.del()` → null out the field.
5. **Outside the window** but lesson hasn't started → cancel without
   refund (the student forfeits, the pro keeps the commission).
6. Update `status='cancelled'`, send `METHOD:CANCEL` ICS to both
   parties.

`proCancelBooking` (pro-initiated) currently has no time guard at all
— flagged in gaps.md as "probably intentional, needs product call."

## Reminders

`src/app/api/cron/lesson-reminders/route.ts` runs hourly. For each
confirmed booking starting in 23–25h:

1. Coarse SQL pre-filter on `lesson_bookings.date` widened by ±1 day
   to cover any UTC-12..UTC+14 location TZ.
2. Per-booking `fromZonedTime(\`${b.date}T${b.startTime}:00\`,
   b.locationTz)` produces the lesson's UTC instant; keep only those
   in the 23–25h window.
3. Idempotency: skip bookings with a `lesson.reminder_sent` event row
   already.
4. Send the student a reminder email with a `METHOD:PUBLISH` ICS
   attachment for the lesson.

Pre-fix the cron treated wall-clock `startTime` as UTC and Brussels
reminders fired 22h or 26h before the lesson depending on DST; for
non-Brussels pros it was completely wrong.

## ICS calendar attachments

`buildIcs(params)` and `buildCancelIcs(params)` in
`src/lib/lesson-slots.ts`. Both:

- Take `tz` as a required field on `IcsParams` — the location's IANA
  zone.
- Emit `DTSTART` / `DTEND` as UTC instants with the trailing `Z`.
  Calendar apps interpret TZID-less local times as UTC and shift them
  by the recipient's offset; the `Z` form sidesteps that.
- Use `METHOD:PUBLISH` (informational invite, doesn't need RSVP).
  `METHOD:REQUEST` without an `ATTENDEE` block is silently dropped by
  Outlook on Mac.
- Cancellation uses `METHOD:CANCEL` + `STATUS:CANCELLED` +
  `SEQUENCE:1` so the event disappears from the recipient's calendar.

Same UID format on both ICS variants (`booking-{id}@golflessons.be`)
so the cancel matches the original event.

## Notification + email pipeline

After every successful booking insert:

1. **In-app notification** to the pro (`createNotification`) — drives
   the `/pro/bookings` bell badge. Awaited because the row backs the
   bell count.
2. **Student confirmation email** — branched by booking source:
   - Member-side authenticated: `buildStudentBookingConfirmationEmail`
     with locale + ICS attachment.
   - Public flow: `buildClaimAndVerifyBookingEmail` (new / unverified
     branch) or `buildNewBookingOnAccountEmail` (verified branch).
3. **Pro notification email** — `buildProBookingNotificationEmail`,
   includes the actual `paymentStatus` after the charge runs (not the
   placeholder).

Email sends run inside `after()` (Next.js post-response hook) so the
UI isn't blocked on Gmail. Vercel keeps the function alive until the
promises settle — we used to use a fire-and-forget pattern but
silently lost mails.

## Booking preference learning

`updateBookingPreferences` (`src/lib/booking-preferences.ts`) — fired
fire-and-forget after every successful booking. Updates the
`pro_students` row with the student's preferred location, duration,
day-of-week, and time. Also infers a recurrence interval ("weekly" /
"biweekly" / "monthly") from the gaps between the last 2–4 confirmed
bookings.

These preferences power Quick Book — the `getQuickBookData` action
suggests the next preferred date + slot in the appropriate location TZ.

## Component map

Quick reference for "what lives where":

### Server actions

- `src/lib/lesson-slots.ts` — pure slot engine, ICS builders, cancel
  deadline check.
- `src/lib/booking-charge.ts` — pricing decision + Stripe charge +
  cash commission helpers.
- `src/lib/booking-preferences.ts` — silently learn student
  preferences post-booking.
- `src/lib/booking-suggestion.ts` — Quick Book "next suggested date"
  computation (TZ-aware).
- `src/lib/timezones.ts` — IANA validation, country inference, the
  curated common-zones list.
- `src/lib/local-date.ts` — `todayInTZ`, `formatLocalDateInTZ`,
  `getMondayInTZ`, `addDaysInTZ`, `addDaysToDateString`.
- `src/lib/pro.ts` — `getProLocationTimezone`, `requireProProfile`.

### Booking action files

- `src/app/(member)/member/book/actions.ts` — member booking wizard
  (`createBooking`, `quickCreateBooking`, `getAvailableDates`,
  `getAvailableSlots`, `getQuickBookData`).
- `src/app/book/[proId]/actions.ts` — public booking
  (`getPublicSlots`, `getPublicAvailableDates`, `createPublicBooking`,
  `resendBookingConfirmation`).
- `src/app/(member)/member/bookings/actions.ts` — student-side cancel
  (`cancelBooking`).
- `src/app/(pro)/pro/students/actions.ts` — pro-side booking +
  cancel (`proCreateBooking`, `proCancelBooking`).
- `src/app/(pro)/pro/locations/actions.ts` — location CRUD with
  required TZ.

### UI

- `src/app/book/[proId]/...` — public wizard (location picker,
  duration picker, date grid, slot list, contact form).
- `src/app/(member)/member/book/...` — authenticated wizard +
  Quick Book widget.
- `src/app/(pro)/pro/bookings/BookingsCalendar.tsx` — pro week-view
  grid with per-period availability filtering.
- `src/app/(pro)/pro/availability/AvailabilityEditor.tsx` —
  drag-paint weekly grid + multi-period editor.
- `src/components/TimezonePicker.tsx` — IANA picker for the location
  forms.

### Background jobs

- `src/app/api/cron/lesson-reminders/route.ts` — hourly 24h reminder.
- `src/app/api/webhooks/stripe/route.ts` — payment reconciliation.

## Test coverage

By layer:

- **Engine** (`lesson-slots.test.ts`) — 109 cases including 7
  cross-TZ + DST.
- **Pricing** (`booking-charge.test.ts`) — 10 cases of
  `decideBookingPricing` rules.
- **Quick Book suggestion** (`booking-suggestion.test.ts`) — 26 cases
  including cross-TZ day-rollover + DST week.
- **Locations** (`timezones.test.ts`) — 17 cases for IANA validation
  + country inference.
- **Pro calendar** (`BookingsCalendar.test.tsx`) — task 46 regression
  + 6 schedule-period filtering cases.
- **TZ-aware components** (`TimezonePicker.test.tsx`,
  `DeploymentChecker.test.tsx`) — RTL coverage.
- **Lint guard** (`local-date-guard.test.ts`) — bans
  `.toISOString().split("T")[0]` and `new Date(\`${date}T${time}:00\`)`
  patterns from production source.
- **DB integration** (`lesson-booking-integration.test.ts`) — 26
  cases incl. `loadBookingPricing` against a real pro row.
- **Stripe integration** (`stripe-flows.test.ts`, gated on
  `STRIPE_SECRET_KEY`) — 20 cases incl. Phase 8 `runOffSessionCharge`
  + `claimCashCommission` direct.
- **Public flow** (`public-booking-flow.test.ts`, gated on Gmail
  service account) — 185 cases covering scenarios 1-9.

## Cross-references

- Audit + open work: `docs/gaps.md`
- Money: `docs/money-flows.md`
- Public flow scenarios: `docs/public-booking-flow.md`
- TZ correctness story: `docs/booking-correctness.md`
- Schema source: `src/lib/db/schema.ts`
- Pro mailings: `docs/pro-mailings.md`
