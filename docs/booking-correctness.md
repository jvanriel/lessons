# Booking correctness — how we prove bookings land at the right time and place

Bookings that show up on the wrong day, time, or place are the most
damaging class of bug for this product: a pro drives to the course for a
no-show, a student misses a paid lesson. Task 46 — Thursday bookings
rendered under the Friday column — exposed that our backend-heavy test
suite had a blind spot.

This document describes the layers we now rely on, what each proves,
and how to run them.

## The underlying hazard

Bookings are stored with a `date` column (`YYYY-MM-DD`) that represents
a **local** calendar day, not a UTC day. The site runs in
`Europe/Brussels` (UTC+1/+2). The naive pattern

```ts
date.toISOString().split("T")[0]
```

converts the `Date` to UTC first. For a local-midnight `Date`, that
shifts the result back a day. So a Friday-midnight Date ends up keyed
as the Thursday before — and any grouping, lookup, or comparison built
on that key silently misaligns bookings with their day.

Every instance of that pattern is now replaced with helpers from
`src/lib/local-date.ts`:

- `formatLocalDate(date)` — local `YYYY-MM-DD` from a `Date`
- `todayLocal()` — today's local date

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

### 3. Component test under Europe/Brussels TZ

`src/app/(pro)/pro/bookings/__tests__/BookingsCalendar.test.tsx`
renders `BookingsCalendar` with two bookings on a known Thursday, under
`TZ=Europe/Brussels` (pinned globally in `vitest.setup.ts`), and
asserts the bookings appear in the Thursday column and not the Friday
or Monday columns.

Verified mechanically: temporarily reverting `formatLocalDate` to the
old `toISOString().split(...)` body makes this test fail. So the test
demonstrably catches the exact regression, not just a surface-level
check.

What it covers: the full React render path of the calendar — column
ordering, date-key grouping, today highlighting. In a browser-like
environment (`happy-dom`), not just the helper in isolation.

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

- **Timezones other than Europe/Brussels**: we don't currently test
  users in other zones (e.g. a pro based in Belgium with a student
  travelling in Tokyo). Not a concern until we have non-BE users.
- **Daylight-saving transitions**: the tests use April dates (DST
  active). A separate test covering the October DST-off transition
  would be worth adding if we see a booking near the Sunday jump.
- **Cross-week drag/reschedule**: the current calendar doesn't support
  drag-to-move. If it's added, extend the component test.
- **Availability override day-keys**: covered by the guard test and
  the helper migration, but no dedicated end-to-end test yet. Server
  actions reading overrides now use `formatLocalDate`, so the same
  invariant holds.

## Provenance

- Task 46 in the in-app admin Kanban (`[fix f1cd1d6]` follow-up by
  `[test 140215a]`).
- Discussion thread in the conversation that landed the commits
  (April 2026).
