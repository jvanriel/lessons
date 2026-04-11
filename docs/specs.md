# Golf Lessons Platform — Test Specifications

## Test Accounts

Use the following naming convention for test accounts in the Google Workspace:

| Role | Email format | Example |
|------|-------------|---------|
| Student | `dummy-student-<lastname>@golflessons.be` | `dummy-student-vanriel@golflessons.be` |
| Pro | `dummy-pro-<lastname>@golflessons.be` | `dummy-pro-vanriel@golflessons.be` |

These are aliases of workspace accounts, so all emails arrive in the tester's own inbox. Each tester uses their own lastname to avoid conflicts.

**Automatic cleanup:** Dummy accounts (`dummy*@golflessons.be`) are always **hard-deleted** when deleted via the admin panel — no soft-delete. This means the email is immediately available for re-registration, making test cycles fast and repeatable.

**Pre-launch password:** `prolessons` (required on first visit for non-localhost)

---

## 1. Student Registration & Onboarding

### Flow: `/register`

The registration is a unified 6-step wizard. All steps support back navigation — the tester can go back and forth to review and update choices.

**Step 0 — Language**
- Three language cards with flags: Nederlands, Francais, English
- Default: Nederlands (NL)
- Selection determines the language for the entire wizard and all future emails
- No progress bar on this step (it's a pre-step)

**Step 1 — Create Account**
- Fields: First name*, Last name*, Email*, Phone, Password*, Confirm password*
- "Generate password" link: generates a 16-character random password, fills both password fields, shows in clear text
- Copy-to-clipboard icon next to the eye (visibility) icon
- "Already have an account? Login" and "I'm a Golf Pro" links at the bottom
- Button: "Create Account" (or "Account aanmaken" in NL, "Creer un compte" in FR)
- On submit: account created, session started, wizard advances
- Emails sent: welcome email + email verification link (24h expiry)

**Step 1 — Your Profile** (when going back after account creation)
- Same fields but email is disabled (greyed out)
- No password fields
- Shows "Review and update your details"
- Language selector visible
- Button changes to "Continue"

**Step 2 — Golf Profile**
- Handicap: numeric input (optional, 0-54)
- Goals: toggle buttons — Driving, Short Game, Putting, Course Management, Learn the Basics, Fitness & Flexibility, Other
- "Other" shows a text field when selected
- All labels in selected language

**Step 3 — Choose Pros**
- Grid of published pros with photo/initials, name, specialties, cities
- Click to select/deselect (gold border + checkmark indicator)
- Must select at least one pro

**Step 4 — Scheduling**
- Per-pro card with:
  - Duration (from pro's configured options, e.g. 30/60/90 min)
  - Preferred day (Mon-Sun toggle buttons)
  - Preferred time (Morning / Afternoon / Evening)
  - How often (Weekly / Every 2 weeks / Monthly / Sporadic / Once)
  - Location dropdown (if pro has multiple locations)

**Step 5 — Payment** (skippable)
- "Enable Quick Book" info card explaining the benefit
- "Add payment method" button: opens Stripe Elements form (card + Bancontact)
- "Skip for now — I'll pay per lesson" link
- Both options complete the wizard

**Completion Screen**
- Checkmark + "You're all set!" (in selected language)
- Profile hint: "You can update all your information anytime via the profile page under the person icon."
- "Go to Dashboard" button

**Confirmation Email** (sent on completion)
- Summary of all choices: handicap, goals, pros with scheduling preferences
- If password was generated: includes the password in a monospace box with "Keep it safe or change it in your profile"
- "Go to Dashboard" button links to login page with email pre-filled

### Test scenarios

- [ ] Register with each language (NL, FR, EN) — verify all labels switch
- [ ] Use "Generate password" — verify both fields filled, visible, copyable
- [ ] Go back from Step 2 to Step 1 — verify profile fields editable, no password fields
- [ ] Go forward and back between all steps — verify data persists
- [ ] Select multiple pros — verify scheduling step shows card per pro
- [ ] Skip payment — verify completion and dashboard access
- [ ] Close browser mid-wizard, re-open — verify wizard resumes at correct step
- [ ] Check inbox: welcome email, verification email, confirmation email
- [ ] Click verification link — verify email verified badge disappears from profile
- [ ] Click "Go to Dashboard" in confirmation email — verify login page with email pre-filled

---

## 2. Student Profile

### Flow: `/member/profile`

**Profile Details**
- Edit: first name, last name, email, phone
- Save button with success/error feedback

**Email Verification Banner**
- Shows if email not verified
- "Resend verification email" button (localized)
- Success message after sending

**Golf Profile**
- Handicap (numeric, optional)
- Goals (same toggle buttons as onboarding, including "Other" with text field)
- Independent save button

**Payment Method**
- If no card: "No payment method saved. Add one to enable Quick Book." + "Add payment method" button
- If card on file: shows brand, last 4 digits, expiry + "Update" button
- Stripe Elements form (same as onboarding)

**Booking Preferences**
- Per-pro dropdowns: Duration, Frequency, Preferred day, Preferred time
- Auto-saves on change (no submit button)
- "Saving..." / "Saved" feedback

**Change Password**
- Current password, New password, Confirm password
- "Generate password" link + copy-to-clipboard icon
- Disabled submit if passwords don't match

**Preferred Language**
- Dropdown: English, Nederlands, Francais
- Saves immediately, page refreshes in new language

**Email Preferences**
- Toggle: receive emails on/off

### Test scenarios

- [ ] Update name and phone — verify saved
- [ ] Change preferred language — verify page reloads in new language
- [ ] Add handicap and goals — verify saved
- [ ] Add/update payment method — verify card details shown
- [ ] Generate password from profile — verify copied, change succeeds
- [ ] Resend verification email — verify email arrives

---

## 3. Booking a Lesson

### Flow: `/member/book/[pro-slug]`

6-step wizard:

1. **Location** — select from pro's active locations (skipped if only one)
2. **Duration** — select from pro's durations (skipped if only one)
3. **Date** — calendar picker showing only available dates within booking horizon
4. **Time** — grid of 30-min slots (real-time availability)
5. **Details** — participant name/email/phone (pre-filled from profile), group size, notes
6. **Confirm** — full booking summary

**Payment gate behavior:**

| Pro setting | Student has payment method | Result |
|------------|--------------------------|--------|
| Require payment (default) | Yes | Book normally |
| Require payment | No | Red blocker: "Add payment method" with profile link, confirm button disabled |
| Allow without payment | Yes | Book normally |
| Allow without payment | No | Gold info note suggesting to add payment method, booking allowed |

**After booking:**
- Booking confirmed immediately (status = "confirmed")
- Pro receives notification
- Booking preferences auto-saved for Quick Book

### Quick Book (Dashboard)

- Shows on dashboard for each pro with saved preferences
- Suggested date/time based on interval + last booking
- Date pills for alternatives
- Hold-to-book interaction (600ms hold on time slot)
- If payment required and no payment method: shows "Add payment method to enable Quick Book" with profile link

### Test scenarios

- [ ] Book lesson through full wizard — verify all 6 steps
- [ ] Book with pro that requires payment, no payment method — verify blocker
- [ ] Book with pro that allows no-payment — verify info note, booking succeeds
- [ ] Quick Book from dashboard — verify hold-to-book works
- [ ] Cancel booking — verify slot becomes available again
- [ ] Book lesson at different locations for same pro

---

## 4. Coaching Chat

### Flow: `/member/coaching/[id]` (student) or `/pro/students/[id]` (pro)

- WhatsApp-style messaging between student and pro
- Messages poll every 5 seconds
- Date separators (Today, Yesterday, or date)
- Sender's messages right-aligned, receiver's left-aligned

**Features:**
- Send text messages
- Emoji reactions (tap message): thumbs up, heart, laugh, target, checkmark
- Reply to message (shows quoted original)
- Edit message (within 15-minute window)
- Delete message (soft-delete, shows "Message deleted")
- File upload: drag-drop or click, max 10MB
  - Images: inline thumbnail (max 300px)
  - Videos: thumbnail with play icon
  - Documents: file icon with name/size

### Test scenarios

- [ ] Send message as student — verify appears for pro
- [ ] Send message as pro — verify appears for student
- [ ] Add emoji reaction — verify shown on message
- [ ] Reply to a message — verify quoted text
- [ ] Edit a message (within 15 min) — verify "edited" indicator
- [ ] Delete a message — verify "Message deleted" placeholder
- [ ] Upload image — verify inline preview
- [ ] Upload document — verify file icon and download link

---

## 5. Pro Registration & Onboarding

### Flow: Select "Golf Pro" at `/register`

**Registration form** creates account with roles `member,pro`.

**Onboarding wizard** (`/pro/onboarding`, 5 steps):

1. **Profile** — display name, specialties, bio
2. **Locations** — add teaching locations (name, address, city)
3. **Lessons** — price/hour (min 50 EUR), durations (30/45/60/90/120), max group size, cancellation hours
4. **Bank Account** — holder name, IBAN, BIC (optional)
5. **Subscription** — monthly (12.50 EUR) or annual (125 EUR), 14-day free trial, Stripe payment

**After onboarding:**
- Pro profile created but NOT published
- Admin must activate ("Activate as Pro" in admin panel)
- Pro activation email sent

### Test scenarios

- [ ] Register as pro — verify redirect to pro onboarding
- [ ] Complete all 5 steps — verify profile created
- [ ] Admin activates pro — verify pro can manage profile
- [ ] Pro publishes profile — verify visible on `/pros`

---

## 6. Pro Profile & Settings

### Flow: `/pro/profile`

**Profile Details:** display name, specialties, bio

**Lesson Settings:**
- Price per hour
- Lesson durations (checkboxes: 30/45/60/90/120 min)
- Max group size

**Booking Settings:**
- Booking enabled toggle (master switch)
- Booking notice (hours before lesson can be booked)
- Booking horizon (days ahead students can book)
- Cancellation window (hours for free cancellation)
- **Allow booking without pre-payment** toggle — when ON, students can book without a saved payment method

### Test scenarios

- [ ] Toggle "booking enabled" OFF — verify students can't book
- [ ] Toggle "allow booking without payment" ON — verify students without payment method can book
- [ ] Change booking notice to 48h — verify slots within 48h are not bookable
- [ ] Change cancellation window — verify cancel button respects deadline

---

## 7. Pro Availability

### Flow: `/pro/availability`

**Weekly template grid:**
- 7 days x 48 half-hour slots
- Color-coded by location
- Click/drag to paint availability

**Overrides:**
- Block specific dates/time ranges with reason
- Add extra availability outside templates

### Test scenarios

- [ ] Set weekly availability — verify slots appear in student booking wizard
- [ ] Block a date — verify no slots available for that date
- [ ] Add override availability — verify extra slots appear

---

## 8. Pro Student Management

### Flow: `/pro/students`

- View active, pending, inactive students
- Invite student by email (creates account with temp password, sends invite email)
- Add student manually
- Remove student (sets to inactive)
- Click student name to open coaching chat

### Test scenarios

- [ ] Invite student — verify invite email received with temp password
- [ ] Invited student logs in — verify can see pro
- [ ] Remove student — verify relationship deactivated

---

## 9. Admin User Management

### Flow: `/admin/users`

**User actions:**
- Create user (name, email, password, roles)
- Edit user (update fields, toggle roles)
- Invite user (generate password + send email)
- Reset password (auto-generate + optional email notification)
- Activate as Pro (for `pro_pending` users)
- Impersonate (view platform as that user)
- **Delete** (soft-delete): cancels future bookings, deactivates relationships, sets `deletedAt`
- **Purge** (permanent hard-delete): only for already-deleted users, removes all data

**Visual indicators:**
- Soft-deleted users shown with 50% opacity and red "deleted" badge
- Role badges (member, pro, admin, dev)

### Test scenarios

- [ ] Create user via admin — verify account works
- [ ] Delete user — verify soft-deleted (badge shown, can't login)
- [ ] Purge user — verify completely removed, email available for re-registration
- [ ] Delete student with future bookings — verify bookings cancelled
- [ ] Impersonate student — verify see their dashboard
- [ ] Stop impersonation — verify return to admin account

---

## 10. Soft-Delete Behavior

**When a student is deleted:**
1. All future confirmed bookings cancelled (slots freed)
2. All pro-student relationships deactivated
3. User record soft-deleted (`deletedAt` set)
4. Past bookings preserved for accounting

**When a pro is deleted:**
1. Pro profile soft-deleted + unpublished
2. All future bookings with this pro cancelled
3. All student relationships deactivated
4. User record soft-deleted
5. Pro no longer visible in browse/search

**Purge** (admin only, after soft-delete):
- Hard-deletes all data (bookings, profiles, relationships, emails)
- Email address becomes available for re-registration

---

## 11. Email System

Emails are sent from `noreply@golflessons.be` via Gmail API. All emails are localized based on the recipient's preferred language.

| Email | When sent | Contains |
|-------|-----------|----------|
| Welcome | Account created | Greeting, dashboard link |
| Email verification | Account created | Verify button (24h expiry) |
| Onboarding confirmation | Wizard completed | All choices summary, generated password (if applicable), login link with email pre-filled |
| Invite | Admin invites user | Temp password, login link |
| Password reset | User requests reset | Reset link (1h expiry) |
| Pro activation | Admin activates pro | Congratulations, dashboard link |

### Test scenarios

- [ ] Register student — verify 3 emails received (welcome, verification, confirmation after wizard)
- [ ] Confirmation email with generated password — verify password shown in monospace
- [ ] Confirmation email without generated password — verify no password section
- [ ] Click verification link — verify email marked as verified
- [ ] Click login link in confirmation email — verify email pre-filled

---

## 12. Internationalization (i18n)

**Supported languages:** English (EN), Nederlands (NL), Francais (FR)
**Default:** Nederlands (NL)

**Where it applies:**
- Registration wizard (all steps)
- Profile page (all sections)
- Booking preferences labels
- Email verification banner
- Footer links
- All outgoing emails
- Privacy policy and terms of use pages

**How locale is determined:**
- Authenticated: from `users.preferredLocale` in database
- Anonymous: from `locale` cookie (default NL)
- Changeable via: onboarding wizard (Step 0), profile page language selector

### Test scenarios

- [ ] Complete wizard in NL — verify all labels in Dutch
- [ ] Complete wizard in FR — verify all labels in French
- [ ] Change language in profile — verify page reloads in new language
- [ ] Receive email in FR — verify email content in French

---

## 13. Legal Pages

- `/privacy` — Privacy Policy (EN/NL/FR based on user locale)
- `/terms` — Terms of Use (EN/NL/FR based on user locale)

Both linked from the footer. Terms specify disputes are resolved by the courts of Turnhout, Belgium.

### Test scenarios

- [ ] Visit `/privacy` — verify content loads in user's language
- [ ] Visit `/terms` — verify Turnhout jurisdiction clause present
- [ ] Switch language, reload — verify legal pages switch language

---

## 14. Payment (Stripe)

**Student payment method:**
- Saved via Stripe SetupIntent during onboarding or from profile
- Supports card and Bancontact
- Used for Quick Book and booking confirmation

**Pro subscription:**
- Monthly: 12.50 EUR / Annual: 125 EUR
- 14-day free trial
- Managed via Stripe Customer Portal

**Pro setting: "Allow booking without pre-payment"**
- Default: OFF (students must have payment method)
- When ON: students can book without payment method
- Pros can always book for students without payment (free lessons, cash, etc.)

### Test scenarios

- [ ] Add payment method via Stripe — verify card shown in profile
- [ ] Book with payment method — verify booking confirmed
- [ ] Toggle pro setting ON — verify student without payment can book
- [ ] Toggle pro setting OFF — verify student without payment is blocked

---

## 15. Middleware & Access Control

**Pre-launch gate:** password "prolessons" required for non-localhost access

**Role-based routing:**

| URL prefix | Required role | Redirect |
|-----------|--------------|----------|
| `/member/*` | member | `/login` |
| `/pro/*` | pro or admin | `/login` |
| `/admin/*` | admin | `/login` |
| `/dev/*` | dev | `/login` |

**Onboarding guard:** members without completed onboarding are redirected to `/register`

### Test scenarios

- [ ] Access `/member/dashboard` without login — verify redirect to login
- [ ] Access `/admin/users` as member — verify redirect to login
- [ ] New member without onboarding — verify redirect to `/register`
- [ ] Completed member accessing `/register` — verify redirect to dashboard
