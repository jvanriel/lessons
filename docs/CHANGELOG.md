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

## 2026-05-06 — v1.1.51

- [pro] **Public-profile preview is now a preview.** When you click
  "View public profile" from your dashboard, the page no longer
  shows the "Book a Lesson" or "Join as Student" buttons (those
  don't make sense on your own profile). Instead a small
  "Preview — this is your public profile" hint appears in their
  place. Clicking "Join as Student" on yourself used to create a
  bad student-of-yourself row that broke the Students tab; that
  can no longer happen, and the server rejects any self-join
  attempt as a defensive backstop. (task 108)

## 2026-05-06 — v1.1.50

- [pro] **Pro registration wizard — go back any time.** Two
  related fixes on /pro/onboarding (task 106):
  - The Subscription step (final step) now has a Back button so a
    pro can return to the Bank step to fix details before paying.
    Previously you could only pay or quit.
  - The progress dots at the top are now clickable for already-
    completed steps — click any earlier dot to jump straight there
    instead of clicking Back multiple times.

## 2026-05-06 — v1.1.49

- **Extra-participant emails are now in each participant's own
  language.** When a Dutch booker added a French friend as an extra
  participant, the friend used to receive the confirmation, update,
  and cancellation emails in Dutch. They now arrive in French if the
  friend has an account with French as their preferred language —
  same logic for any locale combination. Falls back to the booker's
  language only if the participant doesn't have an account on file.
  Applies to all three fanouts: booking confirmation, booking edit,
  and cancellation. (task 105)

## 2026-05-05 — v1.1.48

- [admin] **Purge user — feedback + atomicity (task 79).** The
  "Purge permanently" button now confirms with a "User permanently
  purged" alert on success and surfaces any server-side error to
  the admin instead of silently failing. The underlying purge runs
  inside a database transaction, so a foreign-key violation on any
  step rolls back cleanly rather than leaving the account half-
  deleted.

## 2026-05-05 — v1.1.47

- [admin] **Phone column on the Users admin page.** The /admin/users
  table now shows each user's phone number alongside their email,
  and the Edit and Add User dialogs both gained a Phone field — so
  admins can see and update phone numbers from one place. (task 70)

## 2026-05-04 — v1.1.46

- **Logo link goes somewhere useful when you're signed in.**
  Clicking the "Golf Lessons" wordmark used to send signed-in users
  back to the public homepage, which then auto-redirected them
  somewhere else — confusing. The link now points to the most
  useful page for your role: /member/book for members,
  /pro/bookings for pros, /admin for admins. Signed-out visitors
  still land on the marketing homepage.

## 2026-05-04 — v1.1.45

- [admin,dev] **Verification email retries are more patient.** Send
  attempts went from 2 to 4 with longer backoffs (400 ms / 1.5 s /
  4 s) so a brief Gmail blip no longer leaves a freshly-registered
  user stranded without their verification email.
- [admin] **Admin can resend a verification email from the API.** A
  new `/api/admin/resend-verification?id=<userId>` endpoint lets
  admins push a fresh verification mail to a stranded user who can't
  log in to use the in-app resend flow.

## 2026-05-04 — v1.1.44

- **"Maybe later" close link on the pro-onboarding wizard.** The
  pro-signup wizard took over the full viewport with no exit; visitors
  who clicked "Aan de slag" / "Registreer" out of curiosity were
  stuck. A small "Maybe later" link in the top-right now sends you
  back to /for-pros (or /pro/dashboard if you're already signed in).

## 2026-05-04 — v1.1.43

- **"Contact Us" button on /for-pros now goes to the contact page.**
  The bottom CTA's label was "Contact Us" but the click still opened
  the pro-signup dialog — confusing if you wanted to ask a question
  first. It now links straight to /contact. The hero CTA at the top
  still drives signup.

## 2026-05-04 — v1.1.42

- **NL / FR translations on the "Our Pros" menu and tab title.** The
  navigation entry now reads "Onze Pro's" / "Nos Pros" instead of
  falling through to English, and the browser tab title for the
  /pros page follows the same locale.

## 2026-05-04 — v1.1.41

- **NL / FR translations on the "Join as student" button.** On a
  pro's public profile (/pros/[proId]) the join button now reads
  in your language instead of always English.

## 2026-05-04 — v1.1.40

- [pro] **Online-payment surcharge bumped from 1.5% → 2.5% (total
  5%).** Cash commission stays at 2.5%; the online-payment uplift
  rises to better cover Stripe's blended processing cost across
  cards, Bancontact, and SEPA. Public pricing copy on /for-pros
  and the earnings help copy reflect the new rate in NL / EN / FR.

## 2026-05-04 — v1.1.39

- **Clearer "extra participant email" hint on the booking form.**
  The hint used to say "email is optional but recommended" without
  explaining why. It now leads with the reason — confirmation
  details and a calendar invite are sent by email — so it's obvious
  you'll want to fill one in for each participant if you can.

## 2026-05-04 — v1.1.38

- [pro] **Fixed crash on the Students page Guests panel.** Opening
  /pro/students could fail to render after the v1.1.37 Guests panel
  shipped — the "Invite as student" link was being constructed in a
  way that didn't survive the server-to-client boundary. The link
  is now built inside the client component, so the page renders
  cleanly.

## 2026-05-04 — v1.1.37

- [pro] **New "Guests" panel on the Students page.** Whenever a
  booking includes additional participants with an email address,
  those people now appear under a collapsible "Guests" section
  below your students list — deduplicated by email, with the count
  of lessons they've attended and the date of their last lesson.
  We don't create accounts for them automatically. When it makes
  sense, you can click "Invite as student" — opens the existing
  invite dialog with their name + email pre-filled.

## 2026-05-04 — v1.1.36

- **Bolder buttons in confirmation emails.** CTAs in our outgoing
  emails ("Verify email", "View my bookings", "Manage your
  subscription", etc.) used a medium font-weight; they now render in
  bold so they stand out a bit more against the body copy.

## 2026-05-04 — v1.1.35

- **"Send test notification" no longer fails when notifications look
  active.** The toggle was reading the browser's subscription state,
  but the test send was checking the server's database — and the two
  could drift out of sync if the user enabled notifications outside
  the usual flow. The browser subscription is now re-registered
  with the server on every page load, so the two stay aligned and
  the test button works without needing to toggle off and on.
- **Notification error messages are now localized.** Errors from
  the test-send endpoint used to leak through as English ("No push
  subscription found. Enable notifications first.") regardless of
  the user's language. They now appear in NL / FR too.

## 2026-05-04 — v1.1.34

- **No more duplicate "verify your email" email after registering
  via a public booking.** When you booked a lesson without an
  account, then clicked the verify link in the confirmation email,
  then registered an account — the system was sending you another
  "please verify your email" email even though you'd just verified.
  We now skip that send when your email is already verified.

## 2026-05-04 — v1.1.33

- **Card-only at the payment step.** When you add a payment method
  (as a student or as a pro signing up), the form now offers cards
  only. Previously it also showed Bancontact and (for pros) SEPA
  Direct Debit. SEPA in particular dragged a long mandate notice
  about an "8-week refund right via your bank" — confusing because
  the platform already auto-refunds within the pro's cancellation
  window. Cards work everywhere in the target market and the form
  stays simple.

## 2026-05-04 — v1.1.32

- **NL: registration wizard now uses "Boek direct" everywhere.**
  Three onboarding strings still said "Quick Book" while the rest
  of the Dutch UI uses "Boek direct" (the dashboard widget, the
  profile, the help text). Updated for consistency. EN and FR keep
  the English brand name throughout — no change there.

## 2026-05-04 — v1.1.31

- **Clearer "add payment method" message on the dashboard.** When a
  pro requires online payment and you haven't added a payment method
  yet, the Quick Book widget now names that pro explicitly — e.g.
  *"Olivier requires online payment for bookings. Add a payment
  method to use Quick Book here."* — instead of the generic prompt
  that read like the platform required it.
- **"Boek les" / "Book a lesson" button on My Bookings now opens
  the pro list.** Previously it sent you back to the dashboard,
  which didn't immediately put you in a booking flow. It now goes
  straight to /pros where you can pick a pro and start the booking
  wizard.

## 2026-05-04 — v1.1.30

- **Required-field marker on extra-participant names.** First name
  and last name fields for additional participants now show a `*`
  in the placeholder, matching the convention used elsewhere in the
  forms. Email stays marked "(optional)" since it isn't required.

## 2026-05-04 — v1.1.29

- **Public booking now shows the correct group price.** When you
  add an extra participant to a public booking, the summary line
  now includes the extra-participant rate set by the pro instead
  of just the base price. (The booking row itself was already
  saving the correct total — only the displayed price was stale.)

## 2026-05-04 — v1.1.28

- **Editing a booking now respects the pro's availability.** When you
  reschedule, you can only pick from time slots the pro has actually
  made available — previously the form let you type any time, which
  meant a student could land a lesson on a slot the pro never
  offered. Both member-side and pro-side edits now go through the
  same availability check.
- **No more confusing "commission" line in your edit-confirmation
  email.** When a pro is cash-only, internal commission accounting
  isn't relevant to the student — the email no longer mentions it.
- **Edit pages are translated.** "Edit" link, page titles, all form
  labels, and helper text now appear in NL / FR (was English-only).

## 2026-05-04 — v1.1.27

- **Generated passwords are no longer emailed by default.** When you
  use the "Generate password" button during signup, a checkbox now
  appears asking whether to also include the password in the
  confirmation email. It's off by default — putting a password in
  plain email is generally less secure, and you can reset it later
  if you forget. Tick the box if you want the convenience.

## 2026-05-03 — v1.1.26

- **QR login now works on Android, not just iPhone.** Previously the
  QR code on the dashboard encoded a long signed token directly in
  the URL — fine for the iPhone camera, but most Android cameras
  couldn't resolve the dense QR. The QR now encodes a short opaque
  id (8 chars) that the server resolves on scan, so the QR is small
  and crisp and reads on any default phone camera.

## 2026-05-02 — v1.1.25

- **Edit booking: remove a specific participant.** Previously
  lowering the participant count always dropped the *last* person in
  the list — if you wanted to remove someone in the middle you had
  to edit names around. Each additional-participant row now has its
  own "× Remove" button.
- **"New version available" toast really fires only once now.**
  v1.1.20 fixed the cached-HTML reload but a second trigger remained:
  the service worker download lags the page reload by one tick, so a
  freshly-loaded page (already on the new BUILD_ID) still saw an
  `updatefound` event when the SW caught up — and re-fired the toast.
  The SW trigger now re-checks the actual server build id and only
  shows the toast on a real mismatch.

## 2026-05-02 — v1.1.24

- **Edit a booking and the payment is now adjusted automatically.**
  When you change a booking's duration or the number of participants
  in a way that changes the price, the system handles the difference:
  - Online payments: the price increase is charged to your saved
    card; a price decrease is refunded back. You'll see "we charged
    €X" or "we refunded €X" in the update email.
  - Cash-only pros: the platform commission line item on the next
    monthly invoice is swapped for the new amount.
  - If anything goes wrong, the email says "our team will reconcile
    manually" — no surprise charges.
- [admin,dev] If the original payment is in a partial state (failed,
  3DS pending, refunded), price changes get flagged for manual review
  in Sentry under `tags.area = "edit-payment"` instead of trying to
  auto-adjust.

## 2026-05-02 — v1.1.23

- [admin,dev] **Booking-edit: tests + a real fix to the slot-conflict
  check.** The Phase 1 edit feature now ships with 19 unit tests +
  10 DB-integration tests against preview. The integration tests
  caught a closed-interval overlap bug that would have rejected
  back-to-back lessons (10:00–11:00 then 11:00–12:00) as a conflict
  during a reschedule — fixed.

## 2026-05-02 — v1.1.22

- **You can now edit an existing booking.** From the bookings list
  (member side at /member/bookings, pro side via the booking detail
  on /pro/bookings) an "Edit" link opens a form where you can change
  the date, start time, duration, or participant list. The change
  follows the same window as cancellations — past the cancellation
  deadline the lesson can no longer be edited.

  When the change saves, both the booker and the pro get an updated
  confirmation email + an .ics calendar attachment that supersedes
  the original event in the calendar app. Extra participants get the
  same.

  Phase 1 limitation: the original price is retained — payment is
  not adjusted automatically yet for changes in duration or
  participant count. The Stripe charge / refund / invoice-item
  rewrite for price deltas comes in Phase 2.

## 2026-05-02 — v1.1.21

- **Extra participants on a group lesson now get their own emails +
  calendar invites.** When you book a lesson for more than one
  person (member booking or public booking), the form now asks for
  each additional participant's first name, last name, and (optional)
  email. If they have an email, they receive their own confirmation
  with the lesson details and an .ics calendar invite — same goes
  for cancellations.

## 2026-05-02 — v1.1.20

- **"New version available" toast no longer shows up twice.** Clicking
  Update used to do a plain reload, which sometimes brought back the
  pre-deploy HTML out of the browser cache — so the toast appeared
  again on the very first reload, and only the second click actually
  switched you over. The Update button now reloads with a cache-bust
  marker, so the new build comes up on the first try.

## 2026-05-02 — v1.1.19

- **About page now actually shows the changelog in production.**
  The CHANGELOG.md file was being excluded from the production
  deploy bundle (alongside the rest of `docs/`), so /about's
  parser silently fell back to an empty list. Re-included the
  one file we need at runtime.
- **Each tagged item now shows a small role badge** (e.g.
  "ADMIN" or "PRO") next to it, so you can see at a glance who
  else can read which entry. Untagged items (visible to everyone)
  show no badge.

## 2026-05-02 — v1.1.18

- [admin,dev] **Nightly backup now covers the full schema.** Four
  tables were missing from the backup payload (`feedback`,
  `pro_schedule_periods`, `events`, `webauthn_credentials`). They
  now save and restore alongside everything else, with the right
  FK ordering and JSONB casts. Pre-fix `events` (~1.7k rows of
  audit data on preview) would have been lost on every restore.

## 2026-05-02 — v1.1.17

- **Dashboard now reachable from the App menu and the brand link.**
  The "Golf Lessons" wordmark in the top-left now goes to your
  dashboard (admin → /admin, pro → /pro/dashboard, member →
  /member/dashboard) instead of the public marketing homepage. The
  same Dashboard entry also appears under "App" in the sidebar so
  every authenticated user has a one-click way home.

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
