# Changelog

End-user-visible changes shipped to the platform. Engineering details
that don't affect what students or pros see live in `docs/gaps.md` and
the git history. Newest first.

## 2026-05-02 — v1.1.4

- **Cancelling a past lesson on the pro side is silent.** When a pro
  cleans up an old `confirmed` row that should have been cancelled
  (e.g. after a no-show), the system now treats it as administrative
  cleanup: the booking flips to `cancelled` but the student gets no
  email or calendar update. Cancellations of upcoming lessons still
  notify both parties as before.
- **Slot computation handles overlapping availability cleanly.** If a
  pro adds an "available" override that overlaps a regular template
  (or two templates touch each other), the slot list no longer
  duplicates entries or skips the boundary minute.

## 2026-05-02 — v1.1.3

- **About page no longer warns about duplicate keys.** When multiple
  versions ship on the same day, the changelog list now uses each
  entry's date + version as the unique identifier, and the version
  appears as a small label next to the date.

## 2026-05-02 — v1.1.2

- **Pro week calendar now respects schedule periods.** When you set up
  a summer schedule and a winter schedule with different hours, the
  green availability band on `/pro/bookings` was showing both on
  every week. It now only paints the period that actually applies to
  the date you're looking at.

## 2026-05-02 — v1.1.1

- **Late-evening "today" boundary fixed.** Bookings just before midnight
  Brussels time used to drift between "Upcoming" and "Past" lists for
  an hour or two depending on the server's clock. The lists now resolve
  "today" in each booking's location timezone, so the categorisation
  stays stable regardless of when you open the app.
- **Quick Book suggestion no longer skips a day.** When you opened
  Quick Book late in the evening, the suggested date could land a day
  before the actual availability window and silently jump forward.
  Both anchors now use the same location timezone.

## 2026-05-02 — v1.1.0

- **Version + changelog now visible at `/about`.** Lists the running
  build, lets you trigger a manual update check, and shows this
  changelog. Versioning starts here at v1.1.0.
- **Installed app now sees new versions reliably.** The "new version
  available" toast on the installed PWA had a layered cache bug that
  could stop it from ever showing. Each deploy now produces a fresh
  service-worker file and the version-check fetch bypasses every
  layer of cache, including iOS PWA quirks.
- **About page added at `/about`.** Shows the current build, lets
  you trigger a manual update check, and lists this changelog.
- **Quick Book now charges online-pay pros' students.** Previously
  Quick Book inserted bookings without ever firing a Stripe payment;
  the pro's confirmation email said "Cash on the day" even when
  they expected an online charge. Quick Book and the regular booking
  flow now share one pricing + charge path.
- **Booking timezone correctness end to end.** Cancellation deadlines,
  24-hour reminder emails, and "lesson already started" guards all
  resolve in each location's IANA timezone — no more silent
  Brussels-default for non-Brussels pros, no more 1–2 hour drift on
  Vercel's UTC servers, no more cancel-a-lesson-that-already-started.
- **Locations now have an explicit timezone field.** Add or edit a
  location in `/pro/locations` and you'll see the timezone picker —
  defaults to your country's primary zone, expandable to the full
  IANA list. Travelling pros adding a foreign location see a hint
  showing where the default came from.
- **Slot reservation race fixed.** Two students grabbing the same
  slot at the same time now produce one booking + one friendly
  "slot just got taken" message, not a double-book.
- **Sidebar polish.** Section headers no longer appear when there's
  only a single navigation section.

## 2026-04-17

- **Public booking at `/book/[proId]`** — zero-friction wizard, no
  account required. Multi-location pros get a location step, single-
  duration pros skip the duration step.
- **ID-based pro URLs.** Pro pages and booking links use sequence
  numbers instead of slugs (e.g. `/book/24`).
- **Email verification claim flow.** Students booking publicly get an
  email-verify link; once verified they land on a read-only booking
  page with a register CTA.
- **Pro-side "email unverified" badge** on `/pro/bookings` for
  bookings where the student hasn't yet verified.

## 2026-04-13

- **Online lesson payment** — pros set a per-duration price, students
  see the total in their locale's currency, and the platform charges
  off-session at booking time.
- **Cash-only pros supported.** Pros can opt out of the online charge
  and settle directly with the student; the platform still bills its
  commission via the pro's subscription invoice.
- **Refund on cancel.** Cancelling within the pro's cancellation
  window auto-refunds the lesson price (online) or voids the
  pending commission invoice item (cash-only).
- **EN / NL / FR translation pass** across every member, pro, and
  public-facing screen.
- **Welcome-as-pro email** with a 4-step onboarding guide.
- **Mobile responsiveness audit.** Booking wizard, pro dashboard,
  pro billing, calendars all verified on phone-sized viewports.
- **Locale-aware date formatting** everywhere.
