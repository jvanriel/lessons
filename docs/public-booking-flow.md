# Public Booking Flow — Test Scenarios

Manual test guide for the zero-friction lesson booking flow at `/book/[slug]`.

## Overview

Students can book a lesson without creating an account first. The system creates a lightweight user record during booking and sends a confirmation email. To actually manage bookings (cancel, reschedule), the student must register with a password.

### How it works

1. Student fills in name, email, phone and picks a slot
2. Booking is **immediately confirmed** (no payment required in Phase A)
3. Student receives a confirmation email with a **verify link**
4. Clicking the verify link confirms the email and shows the booking (read-only, no login)
5. From there the student can **register** (set a password) to get full account access

### Branch logic

The flow adapts based on whether the student's email already exists:

| Branch | Condition | Student email | Pro email | Post-booking CTA |
|--------|-----------|--------------|-----------|------------------|
| **new** | Email not in system | Verify link + register link | Has "unverified" badge | Register |
| **unverified** | Email exists, not verified | Verify link + register link | Has "unverified" badge | Register |
| **verified** | Email exists and verified | Login link only | No badge | Log in |

### What the pro sees

The booking appears on the pro's bookings page **immediately**, regardless of whether the student has verified their email or registered. The pro always sees the booking as confirmed.

- **Pro notification email** includes an "email not yet verified" badge for new/unverified students
- **Pro in-app notification** includes "(email not yet verified)" text
- **Pro bookings page** (`/pro/bookings`) shows the booking — currently does not indicate verification status

## Test accounts

| Role | Email | Inbox |
|------|-------|-------|
| Pro | `dummy-pro-claude@golflessons.be` | it.admin (Sent folder) |
| Student | `dummy-student-claude@golflessons.be` | it.admin (Sent folder) |

Both are Google Workspace aliases routing to the same `it.admin` inbox. Emails appear in the **Sent** folder (not Inbox) because the service account sends as `noreply@golflessons.be` through the same Google Workspace domain.

The pro account is pre-configured with:
- Slug: `claude-test-pro`
- Durations: 30 min (EUR 35) / 60 min (EUR 65)
- Location: Claude Test Club
- Availability: Mon-Sat with morning and afternoon blocks
- Booking notice: 1 hour

**Setup:** Run `npx tsx scripts/seed-claude-dummies.ts` to create the pro and reset the student.

---

## Scenario 1 — New student books a lesson

The primary flow. Student has never used the platform before.

**Precondition:** Student email does NOT exist in the database.

### Steps

1. Open `/book/claude-test-pro` in an incognito window (or logged out)
2. Select a duration (e.g. 60 min)
3. Pick an available date from the calendar
4. Pick a time slot
5. Fill in the contact form: first name, last name, email, phone
6. Submit the booking

### Expected results

**Confirmation page:**
- "Geboekt!" with confirmation email notice
- Below: register card with benefits list and "Mijn account instellen" link
- Does NOT show "Inloggen" button

**Database:**
- New user created with `email_verified_at = NULL`, `roles = member`
- Booking: `status = confirmed`, `payment_status = manual`, correct `price_cents`
- `lesson_participants` row with contact details
- `pro_students` row with `source = self`, `status = active`

**Student email:**
- Subject: "Je les bij Claude Test Pro is geboekt" (or locale equivalent)
- Contains a verify link: `/api/auth/claim-booking?token=...`
- Contains a registration link: `/register?firstName=...&email=...&pro=...`
- Does NOT contain a plain login link

**Pro email:**
- Subject: "New lesson booking from [Student Name]"
- Contains student contact details, date/time, location
- Shows "email not yet verified" badge
- Has `.ics` calendar attachment

**Pro bookings page:**
- Booking appears immediately as confirmed

---

## Scenario 2 — Verify email via the link

The student clicks the verify link in their confirmation email.

**Precondition:** Scenario 1 completed. Student is not logged in.

### Steps

1. Open the verify link from the student email (`/api/auth/claim-booking?token=...`)

### Expected results

- Redirects to `/booked/t/{manageToken}?verified=1` — a read-only booking page
- Green banner: "Je e-mailadres is geverifieerd. Maak een account aan om je boekingen te beheren."
- Booking details shown: date, time, location, pro name
- Student is NOT logged in (header shows "Registreren" + "Inloggen")
- Register card shown with "Mijn account instellen" link
- `email_verified_at` is now set in the database
- **No session cookie is created** — registration with a password is required to log in

---

## Scenario 3 — Register after verifying

The student creates a proper account with a password.

**Precondition:** Scenario 2 completed. Student is not logged in, email is verified.

### Steps

1. Click "Mijn account instellen" on the booking page
2. Step 1 — Profile: verify pre-filled fields, enter a password, continue
3. Step 2 — Golf profile: optionally set handicap and goals, continue
4. Step 3 — Payment: skip or add a payment method

### Expected results

- All fields in step 1 are pre-filled from the booking (name, email, phone)
- After completing: "Alles is klaar!" with link to dashboard
- Dashboard shows the pro card with Quick Book widget and the booked lesson
- Database: `onboarding_completed_at` is set, `password` is set, user can now log in

---

## Scenario 4 — Student books but never verifies

What happens when the student ignores the confirmation email.

**Precondition:** Scenario 1 completed. Student does NOT click the verify link.

### Expected state

- **Booking is confirmed** — the pro sees it and should show up for the lesson
- **Student cannot log in** — no password, no verified email
- **Student cannot cancel** — cancellation requires a logged-in session
- **Pro can cancel** — from `/pro/bookings`
- **Verify link expires** after 7 days — booking remains confirmed regardless
- If the student books again with the same email, the flow follows the **unverified** branch (scenario 5)

### Pro perspective

The pro should treat unverified bookings with a degree of caution:
- The email address hasn't been confirmed as belonging to the person who booked
- The pro notification email includes the "not yet verified" badge as a signal
- Contact via phone is more reliable for unverified students

---

## Scenario 5 — Verified student books again

A returning student who already has a verified account books another lesson without logging in first.

**Precondition:** Student account exists with `email_verified_at` set. Student is NOT logged in.

### Steps

1. Go to `/book/claude-test-pro` (logged out or incognito)
2. Complete the booking wizard with the same student email
3. Submit

### Expected results

**Confirmation page:**
- "Geboekt!" with confirmation email notice
- Below: "Je hebt al een account" with "Inloggen" button
- Does NOT show the register card

**Database:**
- No new user created (same user ID reused)
- New booking record with correct details

**Student email:**
- Contains a login link: `/login?email=...`
- Does NOT contain a verify link
- Does NOT contain a registration link

**Pro email:**
- Does NOT show "email not yet verified" badge

**Login link:**
- Pre-fills the email field on the login page
- Student enters their password to log in
- Dashboard shows all bookings

---

## Scenario 6 — Unverified returning student

The student booked before but never verified. They book again.

**Precondition:** Student email exists in database with `email_verified_at = NULL`.

### Steps

1. Book again with the same email (can use different name/phone)

### Expected results

- Same user row is reused (no duplicate)
- `first_name`, `last_name`, `phone` are updated to the new values
- `preferred_locale` is preserved from the original booking
- Confirmation page shows register card (not login)
- Email contains verify link (not login link)
- Pro email shows "not yet verified" badge

---

## Scenario 7 — Honeypot / spam protection

### Steps

1. Submit the booking form with the hidden `website` field filled (requires dev tools)

### Expected results

- Response appears successful (no error shown to the bot)
- No booking is created in the database
- No emails are sent

---

## Scenario 8 — Double booking the same slot

### Steps

1. Book a specific slot (e.g. Monday 10:00)
2. In another browser/tab, try to book the same slot with a different email

### Expected results

- Second booking is rejected with a "slot unavailable" error
- Only the first booking exists in the database

---

## Scenario 9 — Invalid pro / disabled booking

### Steps

1. Visit `/book/nonexistent-slug` — expect 404 or "pro not found"
2. Set `published = false` on the pro profile, then visit `/book/claude-test-pro` — expect not found
3. Set `booking_enabled = false` — expect booking not available

---

## Student lifecycle summary

```
Book a lesson (no account needed)
    |
    v
User stub created (unverified, no password)
Booking confirmed immediately
Pro notified (email + in-app, with "unverified" badge)
Student gets confirmation email with verify link
    |
    +---> [Student ignores email] --> Booking stands, student can't manage it
    |                                 Recovery: book again or use "forgot password"
    |
    +---> [Student clicks verify link]
              |
              v
          Email verified, shown read-only booking page
          Prompted to register (set password)
              |
              +---> [Student ignores registration] --> Email verified but can't log in
              |                                        Recovery: use "forgot password"
              |
              +---> [Student registers with password]
                        |
                        v
                    Full account: log in, manage bookings,
                    chat with pro, quick-rebook from dashboard
```

---

## FAQ

### What if the student lost the verification email?

They can book again with the same email. The system reuses the existing user stub and sends a fresh verification email. Alternatively, they can go to `/forgot-password`, enter their email, and set a password directly. The forgot-password flow also verifies the email (clicking a link proves ownership).

### What if the verify link expired?

The JWT in the verify link expires after 7 days. The booking itself is not affected — it stays confirmed. The student can book again (gets a new verify link) or use forgot password to set up their account.

### What if the student verified but never registered?

Their email is verified but they have no password, so they cannot log in. They can use "forgot password" to set a password. This also completes email verification if it somehow wasn't done. After setting a password they'll be logged in, but the registration wizard will prompt them to finish onboarding (golf profile, payment).

### What if someone books with someone else's email?

The booking goes through (zero friction is the goal), but the email owner gets the verification email. If they don't recognise it, they simply ignore it. The booking remains confirmed but the email stays unverified. The pro sees the "email unverified" badge and can follow up by phone.

### What if the same email books with different pros?

Each booking creates a separate `pro_students` relationship. The student gets a separate verify email for each booking. One registration gives access to all bookings across all pros.

### Can the pro cancel an unverified booking?

Yes. The pro can cancel any booking from `/pro/bookings` regardless of the student's verification status. The student will receive a cancellation email (to the email they provided).

### What if the student books while logged in?

If the student is logged in and visits `/book/[slug]`, the booking flow is the same public wizard. The server action detects the email already exists and is verified, so it sends a login-link email instead of a verify email. The booking is linked to their existing account.

### What does the pro see for unverified students?

- **Notification email**: includes an "email not yet verified" badge
- **In-app notification**: includes "(email not yet verified)" text
- **Bookings page** (`/pro/bookings`): shows an amber "email unverified" badge next to the student name in both list and calendar views

### What if the student uses forgot password before ever verifying?

The forgot-password flow sends a reset link to the email address. Clicking the link and setting a password also marks the email as verified. After reset, the student is logged in with a full account. This is a valid recovery path for students who lost or ignored the original verify email.

### What happens to booking preferences?

After each booking, the system silently learns the student's preferences (location, duration, day, time) on the `pro_students` row. These drive the Quick Book widget on the dashboard. Preferences update with each new booking — no explicit scheduling step needed.

---

## Email checklist

For every email sent during testing, verify:

| Check | What to look for |
|-------|-----------------|
| From | `noreply@golflessons.be` |
| Locale | Matches the student's stored `preferred_locale` (or UI locale for new students) |
| Verify link | `/api/auth/claim-booking?token=...` with valid JWT (7-day expiry) |
| Login link | `/login?email=...` with URL-encoded email (verified students only) |
| Register link | `/register?firstName=...&lastName=...&email=...&phone=...&pro=...` |
| Pro dashboard link | `/pro/bookings` |
| .ics attachment | Opens in calendar, correct date/time/location |
| Unverified badge | Present only when student email is not verified |

## Automated tests

```bash
pnpm vitest run src/lib/__tests__/public-booking-flow.test.ts
```

Covers scenarios 1-8 programmatically, including email verification via the Gmail API. Uses the same test accounts listed above.
