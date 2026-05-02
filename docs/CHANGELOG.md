# Changelog

End-user-visible changes shipped to the platform. Engineering details
that don't affect what students or pros see live in `docs/gaps.md` and
the git history. Newest first.

Bullets may start with a `[role]` or `[role,role]` tag to restrict
visibility on the rendered `/about` page. Valid roles are `member`,
`pro`, `admin`, `dev`. Untagged bullets are visible to everyone
(including signed-out visitors). Examples:

- `[pro] Pro week calendar widening.` → only pros see this on /about
- `[admin,dev] Behind-the-scenes cleanup.` → admins and devs only
- `Booking timezone correctness end to end.` → visible to everyone

If any role inside the brackets is unknown (typo), the parser falls
back to treating the brackets as literal text — better to over-show
than silently hide.

## 2026-05-02 — v1.1.16

- [admin] **New-feedback count on the admin dashboard.** A sixth stat
  card next to Users / Students / Pros / Bookings / Open tasks shows
  how many feedback rows are still in `new` status. Highlighted
  amber when > 0 and clicks through to the filtered feedback list.

## 2026-05-02 — v1.1.15

- [admin] **Sidebar Admin section now lists Manual refund + Feedback.**
  Both links existed on the /admin dashboard tile grid but were
  missing from the persistent left sidebar's Admin section. Now
  match — admins can jump to either page without going through the
  dashboard.

## 2026-05-02 — v1.1.14

- **Send us feedback right from the app.** A new Feedback page in
  the App menu lets you tell us what's working, what's broken, or
  what you'd like next. Each message goes to our inbox and to our
  notifications system, and we'll reply by email — you'll also see
  the conversation history under your previous messages.
- [admin] **Admin feedback inbox at /admin → Feedback.** New
  submissions fan out a high-priority admin notification + email
  to contact@golflessons.be. Filter by status (new / in progress /
  responded / closed), respond inline, and the user gets emailed
  back in their preferred locale.

## 2026-05-02 — v1.1.13

- **Loading spinner now appears when a page is slow to open.** When
  the backend is busy or right after a software upgrade, navigating
  between pages used to leave you staring at the previous screen
  with no feedback. A small spinner now appears immediately to show
  the new page is on its way.

## 2026-05-02 — v1.1.12

- [admin,dev] **Changelog entries can now be tagged by role.**
  Bullets in this file accept a `[role]` prefix (e.g. `[pro]` or
  `[pro,admin]`); the /about page filters them so each user only
  sees what's relevant to their roles. Untagged bullets stay
  visible to everyone, including signed-out visitors.

## 2026-05-02 — v1.1.11

- [admin] **Admins can now reconcile a refund out-of-band.** When a refund
  has to be issued directly in the Stripe dashboard (because the
  automatic refund failed, the payment is too old, or the customer
  was paid back via SEPA), admins can now go to /admin → Manual
  refund, look up the booking by ID, supply a reason, and mark it
  refunded. The booking notes get an audit line with who did it
  and why.

## 2026-05-02 — v1.1.10

- [admin,dev] **Behind-the-scenes cleanup.** Removed an old, unused registration
  form from the codebase. Visible registration is unchanged — the
  guided wizard at /register is the only path and it's been the only
  one for months.

## 2026-05-02 — v1.1.9

- **Public booking confirmation page is now rate-limited.** A friendly
  "slow down" page now appears if anyone hammers `/booked/t/[token]`
  more than 30 times a minute from the same network. Legitimate
  visitors won't see it; the cap exists to protect the database from
  anyone scanning URLs at random.

## 2026-05-02 — v1.1.8

- [pro] **Pro week calendar shows early-morning and late-evening lessons.**
  The grid was previously fixed at 07:00–21:00, so a 06:30 sunrise
  lesson or a 22:00 winter slot rendered off-screen. The grid now
  expands automatically to fit any booking or availability slot
  outside that range, and stays compact at 07–21 when nothing falls
  outside it.

## 2026-05-02 — v1.1.5

- **"Slot just got taken" message now actually appears.** When two
  students raced for the same slot at the same instant, the friendly
  in-app message was meant to fire but a missing line in the error
  detector caused a generic crash page instead. Both browsers now
  see the soft "pick another time" message as designed.

## 2026-05-02 — v1.1.4

- [pro] **Cancelling a past lesson on the pro side is silent.** When a pro
  cleans up an old `confirmed` row that should have been cancelled
  (e.g. after a no-show), the system now treats it as administrative
  cleanup: the booking flips to `cancelled` but the student gets no
  email or calendar update. Cancellations of upcoming lessons still
  notify both parties as before.
- [pro] **Slot computation handles overlapping availability cleanly.** If a
  pro adds an "available" override that overlaps a regular template
  (or two templates touch each other), the slot list no longer
  duplicates entries or skips the boundary minute.

## 2026-05-02 — v1.1.3

- [admin,dev] **About page no longer warns about duplicate keys.** When multiple
  versions ship on the same day, the changelog list now uses each
  entry's date + version as the unique identifier, and the version
  appears as a small label next to the date.

## 2026-05-02 — v1.1.2

- [pro] **Pro week calendar now respects schedule periods.** When you set up
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
- [pro] **Quick Book suggestion no longer skips a day.** When you opened
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
- [pro] **Quick Book now charges online-pay pros' students.** Previously
  Quick Book inserted bookings without ever firing a Stripe payment;
  the pro's confirmation email said "Cash on the day" even when
  they expected an online charge. Quick Book and the regular booking
  flow now share one pricing + charge path.
- **Booking timezone correctness end to end.** Cancellation deadlines,
  24-hour reminder emails, and "lesson already started" guards all
  resolve in each location's IANA timezone — no more silent
  Brussels-default for non-Brussels pros, no more 1–2 hour drift on
  Vercel's UTC servers, no more cancel-a-lesson-that-already-started.
- [pro] **Locations now have an explicit timezone field.** Add or edit a
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
- [pro] **Pro-side "email unverified" badge** on `/pro/bookings` for
  bookings where the student hasn't yet verified.

## 2026-04-13

- **Online lesson payment** — pros set a per-duration price, students
  see the total in their locale's currency, and the platform charges
  off-session at booking time.
- [pro] **Cash-only pros supported.** Pros can opt out of the online charge
  and settle directly with the student; the platform still bills its
  commission via the pro's subscription invoice.
- **Refund on cancel.** Cancelling within the pro's cancellation
  window auto-refunds the lesson price (online) or voids the
  pending commission invoice item (cash-only).
- **EN / NL / FR translation pass** across every member, pro, and
  public-facing screen.
- [pro] **Welcome-as-pro email** with a 4-step onboarding guide.
- **Mobile responsiveness audit.** Booking wizard, pro dashboard,
  pro billing, calendars all verified on phone-sized viewports.
- **Locale-aware date formatting** everywhere.
