# Booking correctness — how we prove bookings land at the right time and place

Bookings that show up on the wrong day, time, or place are the most
damaging class of bug for this product: a pro drives to the course for a
no-show, a student misses a paid lesson. Task 46 — Thursday bookings
rendered under the Friday column — exposed that our backend-heavy test
suite had a blind spot.

This document describes the layers we now rely on, what each proves,
and how to run them.

## The data model (Model A — location-anchored)

Every booking happens at a physical location. That location has **one**
canonical timezone, stored as an IANA string on `locations.timezone`
(default `Europe/Brussels`). Booking `date` + `startTime` are the
**wall-clock values in that location's TZ**, not UTC.

A pro also has an operational TZ on `pro_profiles.default_timezone`
(default `Europe/Brussels`). It drives the pro's calendar week grid,
"today" highlighting, and dashboard-level filters. In almost every
real-world case this matches the TZ of all the pro's locations; when a
pro adds a location in a different TZ, the calendar still renders in
the pro's operational TZ and the booking's location-TZ date-string is
used as the column key unchanged. (Cross-TZ rendering — converting a
Chicago-location lesson to appear at its Brussels-local hour in a
Brussels pro's grid — is not implemented; real pros don't do that.)

## The underlying hazard that caused task 46

The naive pattern

```ts
date.toISOString().split("T")[0]
```

converts a `Date` to UTC first. For a local-midnight `Date` in a
positive-offset TZ, that shifts the result back a day. So a
Friday-midnight Date ends up keyed as the Thursday before — any
grouping, lookup, or comparison built on that key silently misaligns
bookings with their day. Every instance of that pattern is now replaced
with helpers from `src/lib/local-date.ts`:

- `formatLocalDate(date)` — local `YYYY-MM-DD` in the **server's** TZ.
  Use only when "local" legitimately means the server's TZ (rare).
- `todayLocal()` — today's date in the server's TZ.
- `formatLocalDateInTZ(date, tz)` — local `YYYY-MM-DD` in the given
  IANA TZ. **Use this for user- or location-bound date keys.**
- `todayInTZ(tz)` — today's date in the given IANA TZ.
- `getMondayInTZ(at, tz)` / `addDaysInTZ(at, days, tz)` — absolute UTC
  `Date` anchored to local Monday / local day-of wall-clock in the TZ,
  stable across DST.
- `addDaysToDateString(ymd, days)` — pure string `YYYY-MM-DD` arithmetic,
  TZ-independent.

## The four layers

### 1. Single source of truth for date keys

`src/lib/local-date.ts` is the only place date keys get built. Every
booking, availability, override, dashboard and calendar path imports
from it. 32 call sites were migrated off the `toISOString().split(...)`
pattern in the same commit that introduced the helper.

Why it matters: the bug is now impossible to reintroduce accidentally
in a single file — you'd have to bypass the helper deliberately, and
the next layer stops that.

### 2. Guard test — the banned pattern cannot come back

`src/lib/__tests__/local-date-guard.test.ts` walks `src/` and fails if
any file (other than the helper itself) contains
`.toISOString().split("T")[0]`. Runs as part of the normal
`pnpm test:run`, so any PR that reintroduces the pattern fails CI.

An ESLint rule is also in `eslint.config.mjs` as documentation, but
the repo's ESLint tooling is currently broken (Next 16 removed
`next lint`, FlatCompat has a circular-JSON bug with the Next plugin).
The vitest guard is the actual enforcement until that's sorted.

### 3. Component test under multiple timezones

`src/app/(pro)/pro/bookings/__tests__/BookingsCalendar.test.tsx` is
parameterized: the same assertions run with `timezone="Europe/Brussels"`
and `timezone="America/Chicago"`. The server/runner TZ stays pinned at
`Europe/Brussels` (via `vitest.setup.ts`), so the Chicago case proves
the `timezone` prop is actually honored — independent of the server's
own zone. For each case it pins `now` to a local Thursday afternoon in
that TZ, renders two bookings, and asserts they land in the Thursday
column (never Monday or Friday).

Verified mechanically: temporarily reverting `formatLocalDateInTZ` to
`toISOString().split(...)` makes both cases fail. Reverting to a
server-local helper (ignoring the `timezone` prop) makes the Chicago
case fail while Brussels passes — which is what we want to catch.

Complementary helper tests: `src/lib/__tests__/local-date.test.ts`
covers `formatLocalDateInTZ`, `todayInTZ`, `getMondayInTZ`, and
`addDaysInTZ` — including a spring-forward DST boundary test for
Europe/Brussels (29 March 2026, 02:00 → 03:00).

### 4. End-to-end test through the real UI

`e2e/pro-bookings-calendar.spec.ts` (Playwright) covers the full
round-trip: DB insert → server action → session cookie → HTML render in
Chromium under Europe/Brussels + `nl-BE` locale.

It:

1. Inserts a confirmed booking for Dummy Pro on this week's Thursday
   at 14:00–15:00, directly into the preview DB.
2. Logs in as `dummy-pro-claude@golflessons.be` via the real `/login`
   form.
3. Navigates to `/pro/bookings`.
4. Asserts the `14:00 - 15:00` text appears in the Thursday column and
   does **not** appear in Monday or Friday.
5. Cleans up the booking in `afterAll`.

Only this layer proves the whole chain. The component test can pass
while an unrelated middleware rewrite breaks cookie propagation; the
E2E test will catch that.

## Running the tests

```bash
pnpm test:run          # vitest — guard + component + 156 integration tests
pnpm test              # vitest watch mode
pnpm test:e2e          # Playwright — starts pnpm dev automatically
```

### Environment prerequisites

- **Vitest integration tests**: a DB URL in `.env.local`
  (`POSTGRES_URL_PREVIEW` preferred, else `POSTGRES_URL`).
- **Component/guard tests**: none beyond installed deps.
- **Playwright**: same DB URL, plus the Claude dummy accounts seeded.
  Run once after a DB reset:
  ```bash
  pnpm tsx scripts/seed-claude-dummies.ts
  ```
  The Dummy Pro password is `changeme123`. Override at E2E time with
  `E2E_DUMMY_PRO_PASSWORD` if the seed is rotated.
- **Against a deployed preview instead of localhost**:
  ```bash
  PLAYWRIGHT_BASE_URL=https://<preview-url> pnpm test:e2e
  ```

## What each layer does _not_ cover

- **Fall-back DST transition**: the helper tests include a spring-
  forward case (March). A symmetric fall-back case (October) is worth
  adding before the first October under multi-TZ load.
- **Cross-week drag/reschedule**: the current calendar doesn't support
  drag-to-move. If it's added, extend the component test.
- **A pro teaching in two different TZs**: the calendar renders in the
  pro's `default_timezone` and uses each booking's stored `date` as a
  column key. If a pro adds a location in a different TZ, lessons at
  that location appear at their location-TZ date, which may not match
  the pro's wall-clock date for that moment. In practice a pro teaches
  within one TZ; we can revisit if a real use case appears.
- **Student's browser TZ**: student-facing pages show booking times as
  the location's wall-clock values (which is what the student needs —
  the student has to physically be at the course). No translation to
  the student's local time is attempted.

## Provenance

- Task 46 in the in-app admin Kanban (`[fix f1cd1d6]` → `[test 140215a]`
  → `[e2e 79e00a9]` → `[tz <next commit>]`).
- Discussion thread in the conversation that landed the commits
  (April 2026), including the decision to adopt Model A (location-
  anchored TZs) now rather than retrofit later.

## Migration

The TZ columns were applied to the preview DB via a one-shot ALTER:

```sql
ALTER TABLE pro_profiles
ADD COLUMN IF NOT EXISTS default_timezone varchar(50)
NOT NULL DEFAULT 'Europe/Brussels';
```

`locations.timezone` already existed. To apply to production, run the
same ALTER before deploying the schema change.
