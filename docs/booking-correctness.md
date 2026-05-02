# Booking correctness — how we prove bookings land at the right time and place

Bookings that show up on the wrong day, time, or place are the most
damaging class of bug for this product: a pro drives to the course
for a no-show, a student misses a paid lesson. Two milestone audits
shaped the current defences:

- **Task 46 (April 2026)** — Thursday bookings rendered under the
  Friday column in the pro weekly calendar. Exposed that our
  backend-heavy test suite had a blind spot for date-key arithmetic
  in positive-offset timezones. Triggered the helper module + guard
  test + component-under-multi-TZ test.
- **TZ audit (May 2026)** — found that the *callers* of a clean
  engine had silently re-implemented local-time parsing or compared
  against `todayLocal()` (server TZ). Cancel-deadline let students
  cancel up to 2 h after a Brussels lesson started; reminder cron
  fired 22 h or 26 h before depending on DST; locations had no real
  TZ field. Triggered the engine-signature tightening, the
  per-booking TZ resolution, the location TZ form, and the second
  banned pattern.

This document describes the layers we now rely on, what each proves,
and how to run them.

## The data model (Model A — location-anchored)

> Every wall-clock time stored in the DB (booking, availability,
> override, schedule period bound) is in the **location's** IANA
> timezone — never the server's, never the student's, never UTC.

- `locations.timezone` — IANA string, NOT NULL, **no DB default**
  (since 2026-05-02 pass 3). Every insert path validates the value
  via `isValidIanaTimezone()` (`src/lib/timezones.ts`); a missing
  value fails loudly at INSERT.
- `pro_profiles.default_timezone` — operational TZ, drives the pro's
  own dashboard's "today" + week grid + admin counts. Still has a
  Brussels default because it's display-only; per-location TZ is
  the source of truth for booking-time wall clocks.
- Booking `date` + `startTime` + `endTime` columns are wall-clock in
  the location's TZ. The slot engine, ICS builders, and cancellation
  guard all convert to UTC at the boundary via
  `fromZonedTime(\`${date}T${time}:00\`, locationTz)` from
  `date-fns-tz`.

`getProLocationTimezone(proLocationId)` (`src/lib/pro.ts`) is the
canonical resolver. It throws on missing rows rather than returning
Brussels — silent fallbacks were the bug class the 2026-05 audit
eliminated.

## The two underlying hazards (both banned)

### Hazard 1 — UTC date-string from a Date

```ts
date.toISOString().split("T")[0]
```

Converts a `Date` to UTC first. For a local-midnight `Date` in a
positive-offset TZ, that shifts the result back a day. So a
Friday-midnight Date ends up keyed as the Thursday before — any
grouping, lookup, or comparison built on that key silently misaligns
bookings with their day. This was the task-46 bug.

**Replacement:** helpers in `src/lib/local-date.ts`:

- `formatLocalDate(date)` / `todayLocal()` — server-TZ. Use only
  when "local" legitimately means the server's TZ (rare in this
  codebase since the May audit).
- `formatLocalDateInTZ(date, tz)` / `todayInTZ(tz)` — TZ-bound.
  **Use these for user- or location-bound date keys.**
- `getMondayInTZ(at, tz)` / `addDaysInTZ(at, days, tz)` — absolute
  UTC `Date` anchored to local Monday / wall-clock day in the TZ,
  stable across DST.
- `addDaysToDateString(ymd, days)` — pure string `YYYY-MM-DD`
  arithmetic, TZ-independent.

### Hazard 2 — wall-clock-as-server-TZ parse

```ts
new Date(`${date}T${time}:00`)
```

Parses a wall-clock string in the **runtime** TZ. On Vercel UTC, a
10:00 Brussels lesson became 10:00 UTC = 12:00 Brussels CEST, so:

- `cancelBooking`'s "lesson already started" guard fired 1–2 h late
  → student could cancel after the lesson began, refund + commission
  void ran in that window.
- `lesson-reminders` cron treated start times as UTC (with a `Z`
  suffix) → Brussels reminders fired 22 h or 26 h before the lesson
  depending on DST; non-Brussels was fully broken.
- Cancel client components (`CancelBookingButton`, dashboard
  `CancelBookingDialog`) ran the same parse in the **browser** TZ →
  a NY user viewing a Brussels booking saw the wrong "deadline
  passed" state.

**Replacement:** `fromZonedTime(\`${date}T${time}:00\`, tz)` from
`date-fns-tz`, where `tz` is the location's IANA timezone (resolved
via `getProLocationTimezone()` server-side, or threaded through as a
prop client-side).

## The five layers

### 1. Single source of truth for date keys

`src/lib/local-date.ts` is the only place date keys get built. Every
booking, availability, override, dashboard and calendar path imports
from it. The original task-46 sweep migrated 32 call sites off the
`toISOString().split(...)` pattern; the May audit added per-booking
`todayInTZ(b.locationTimezone)` to `member/bookings/page.tsx` so each
row's upcoming/past cutoff matches its own location's wall clock,
not a single server-anchored "today".

### 2. Engine signatures require `tz` — no silent defaults

After the May audit, every public function in `src/lib/lesson-slots.ts`
takes `tz` as a required parameter:

- `computeAvailableSlots(..., timezone: string)`
- `checkCancellationAllowed(..., timezone: string)`
- `buildIcs({ ..., tz: string })`
- `buildCancelIcs({ ..., tz: string })`

`getProLocationTimezone()` throws on missing rows instead of
returning `"Europe/Brussels"`. `BookingsCalendar` `timezone` prop is
required. The removed Brussels defaults were the source of multiple
silently-wrong behaviours for non-Brussels pros.

A new caller that forgets to pass `tz` fails at type-check time
rather than at runtime in production.

### 3. Guard tests — banned patterns cannot come back

`src/lib/__tests__/local-date-guard.test.ts` walks `src/` and fails
if any production file (other than the helper itself) contains
either banned pattern:

- `.toISOString().split("T")[0]` (the task-46 form).
- `new Date(\`${...}T${...}\`)` (the cancel-deadline form).

Runs as part of the normal `pnpm test:run`, so any PR that
reintroduces either pattern fails CI.

An ESLint rule is also in `eslint.config.mjs` as documentation, but
the repo's ESLint tooling is currently broken (Next 16 removed
`next lint`, FlatCompat has a circular-JSON bug with the Next
plugin). The vitest guard is the actual enforcement until that's
sorted.

### 4. Component + algorithm tests under multiple timezones

The slot engine and the calendar are pinned by tests that exercise
non-Brussels TZs explicitly while the test runner stays pinned at
`Europe/Brussels` (via `vitest.setup.ts`). That combination proves
the code reads the **input** TZ rather than leaking the runtime's.

- **`src/lib/__tests__/lesson-slots.test.ts`** — 109 cases including
  7 cross-TZ scenarios: London / Tokyo notice cutoff, London / Tokyo
  / NYC ICS DTSTART, Tokyo cancellation deadline, Brussels
  spring-forward DST, NYC EDT transition.
- **`src/lib/__tests__/booking-suggestion.test.ts`** — 26 cases
  including cross-TZ day-rollover (Tokyo's day starts hours before
  Brussels'; New York's starts hours after) and DST-boundary safety.
- **`src/app/(pro)/pro/bookings/__tests__/BookingsCalendar.test.tsx`** —
  parameterised across `timezone="Europe/Brussels"` and
  `timezone="America/Chicago"`. Pins `now` to a local Thursday
  afternoon in the target TZ, renders bookings, asserts they land
  in the Thursday column (not Monday or Friday). Plus 6 cases for
  schedule-period validity-window filtering (multi-period schedules,
  task 78): a slot bounded April 1 – April 30 paints on April
  Wednesdays, doesn't paint on March or May Wednesdays, the boundary
  date is inclusive, and a slot from a different `dayOfWeek` doesn't
  leak.
- **`src/lib/__tests__/local-date.test.ts`** — helpers including
  Brussels spring-forward (29 March 2026, 02:00 → 03:00).

Verified mechanically: temporarily reverting `formatLocalDateInTZ`
to `toISOString().split(...)` makes the Brussels + Chicago calendar
cases fail. Reverting `computeSuggestedDate` to the pre-fix
server-TZ form makes the cross-TZ day-rollover suggestion cases fail.

### 5. DB-level slot-uniqueness gate

The HTTP Neon driver doesn't support transactions, so the
"two students grab the same slot at the same time" race used to
silently double-book. Mitigation:

```sql
CREATE UNIQUE INDEX lesson_bookings_slot_confirmed_idx
ON lesson_bookings (pro_profile_id, pro_location_id, date, start_time)
WHERE status = 'confirmed';
```

All three booking-insert sites (`createBooking`, `quickCreateBooking`,
`createPublicBooking`) wrap the INSERT in `try { ... } catch (err)
{ if (isSlotConflictError(err)) return slotUnavailable }`. The helper
matches PG's `23505` SQLSTATE + the index name
(`src/lib/db/index.ts`). Migration:
`scripts/migrate-booking-slot-unique.ts`. Verified with
`scripts/verify-tz-migrations.ts`.

The deeper "wrap booking + participant + relationship inserts in a
transaction" follow-up is blocked on a driver swap (see gaps.md
🟡 db.transaction()).

### 6. End-to-end test through the real UI

`e2e/pro-bookings-calendar.spec.ts` (Playwright) covers the full
round-trip: DB insert → server action → session cookie → HTML render
in Chromium under Europe/Brussels + `nl-BE` locale.

It:

1. Inserts a confirmed booking for Dummy Pro on this week's Thursday
   at 14:00–15:00, directly into the preview DB.
2. Logs in as `dummy-pro-claude@golflessons.be` via the real
   `/login` form.
3. Navigates to `/pro/bookings`.
4. Asserts the `14:00 - 15:00` text appears in the Thursday column
   and does **not** appear in Monday or Friday.
5. Cleans up the booking in `afterAll`.

Only this layer proves the whole chain. The component test can pass
while an unrelated middleware rewrite breaks cookie propagation; the
E2E test catches that.

## Running the tests

```bash
pnpm test:run          # vitest — guard + 257 pure/UI cases (12 files)
pnpm test              # vitest watch mode
pnpm test:e2e          # Playwright — starts pnpm dev automatically

# DB-touching integration (run when DB env is set):
pnpm vitest run src/lib/__tests__/lesson-booking-integration.test.ts

# Stripe + DB integration (gated on STRIPE_SECRET_KEY +
# pre-seeded dummy Claude pro):
pnpm vitest run src/lib/__tests__/stripe-flows.test.ts

# Public booking flow (gated on Gmail service account):
pnpm vitest run src/lib/__tests__/public-booking-flow.test.ts
```

### Environment prerequisites

- **Vitest pure / UI tests**: none beyond installed deps.
- **Vitest integration tests**: a DB URL in `.env.local`
  (`POSTGRES_URL_PREVIEW` preferred, else `POSTGRES_URL`).
- **Stripe tests**: `STRIPE_SECRET_KEY` (test key `sk_test_...`)
  and the dummy Claude pro seeded via
  `pnpm tsx scripts/seed-claude-dummies.ts`.
- **Public booking flow tests**: Gmail service account creds for the
  email-verification round-trip.
- **Playwright**: same DB URL, plus the Claude dummy accounts seeded.
  Dummy Pro password is `changeme123`. Override at E2E time with
  `E2E_DUMMY_PRO_PASSWORD` if the seed is rotated.
- **Against a deployed preview instead of localhost**:
  ```bash
  PLAYWRIGHT_BASE_URL=https://<preview-url> pnpm test:e2e
  ```

## What each layer does _not_ cover

- **Concurrency at the action level.** The DB-level unique index
  blocks the slot race; we do NOT yet have an integration test that
  spawns two parallel `createBooking` calls and asserts the friendly
  error message lands. Worth adding before the next launch wave.
- **Reminder cron route handler.** The 23–25h window math + per-
  booking TZ filter is exercised indirectly via `lesson-slots.test.ts`,
  but the route's idempotency + window-widening logic isn't pinned.
  Listed in gaps.md.
- **Cross-week drag/reschedule.** The current calendar doesn't
  support drag-to-move. If it's added, extend the component test.
- **A pro teaching in two different TZs.** The calendar renders in
  the pro's `default_timezone` and uses each booking's stored `date`
  as a column key. If a pro adds a location in a different TZ,
  lessons at that location appear at their location-TZ date, which
  may not match the pro's wall-clock date for that moment. In
  practice a pro teaches within one TZ; we revisit if a real
  use case appears.
- **Student's browser TZ.** Student-facing pages show booking times
  as the location's wall-clock values (which is what the student
  needs — the student has to physically be at the course). No
  translation to the student's local time is attempted.

## Migrations applied

The TZ + correctness work landed across several one-shot scripts
under `scripts/`:

| Script | What it does | Applied |
|---|---|---|
| `migrate-booking-slot-unique.ts` | Partial unique index on confirmed-booking slots | preview + prod |
| `migrate-location-timezones.ts` | Backfill `locations.timezone` from country (no-op for current Brussels-only data) | preview + prod |
| `migrate-drop-location-tz-default.ts` | Drop the `DEFAULT 'Europe/Brussels'` on `locations.timezone` | preview + prod |
| `verify-tz-migrations.ts` | Read-only re-check of all the above + every row has a valid IANA TZ | regression check, run any time |

`pro_profiles.default_timezone` was added in the original task-46
sweep (still has a Brussels DB default — display-only; per-location
TZ drives correctness).

## Provenance

- Task 46 in the in-app admin Kanban (`[fix f1cd1d6]` →
  `[test 140215a]` → `[e2e 79e00a9]` → `[tz <next commit>]`).
- 2026-05 audit: gaps.md §0 "Date/time/timezone audit findings"
  — the full audit + pass-by-pass remediation log.
- 2026-05-02 sweep entries in `docs/CHANGELOG.md` (v1.1.0–v1.1.3).
- Discussion threads that landed the commits, including the
  decision to adopt Model A (location-anchored TZs) and to drop the
  silent Brussels defaults rather than retrofit later.

## Cross-references

- Full booking-system overview: `docs/booking-design.md`
- Open audit items: `docs/gaps.md`
- Money flows: `docs/money-flows.md`
- Public-flow scenarios: `docs/public-booking-flow.md`
- Schema source: `src/lib/db/schema.ts`
