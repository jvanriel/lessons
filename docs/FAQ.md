# Golf Lessons — FAQ for Testers & Developers

## Timezone & Time Handling

### Q: What timezone are lesson times in?
All lesson times are in the **timezone of the golf course location**. Currently all locations default to `Europe/Brussels` (CET in winter, CEST in summer). The timezone is stored per location in the database (`locations.timezone`).

### Q: What happens when a student books from a different timezone?
The times shown are always the course's local time. A student in London booking a lesson at "14:00" at a Belgian course will arrive at 14:00 Belgian time (which is 13:00 London time). When the user's browser timezone differs from the course timezone, a small timezone indicator appears (e.g. "CET (Brussels)").

### Q: How does summer time (DST) work?
The engine uses `date-fns-tz` with the IANA timezone database. When Belgium switches from CET (UTC+1) to CEST (UTC+2) in March, or back in October, all slot calculations automatically use the correct offset. No manual adjustment needed.

### Q: What happens with a lesson booked across a DST change?
The lesson time is stored as a wall-clock time (e.g. "14:00") + date + location timezone. If you book a lesson on March 29 at 14:00 and DST changes on March 30, your lesson is still at 14:00 local time. The UTC equivalent shifts, but the local time stays the same — which is correct.

### Q: How does slot filtering work on Vercel (UTC server)?
The slot engine converts slot times from the course timezone to UTC using `fromZonedTime()` before comparing with the server clock. This ensures a slot at "14:00 Brussels" is correctly identified as "12:00 UTC" (summer) or "13:00 UTC" (winter), regardless of the server's timezone.

### Q: What if we add a golf course in the UK or Spain?
Set the `timezone` field on the location record (e.g. `Europe/London` or `Europe/Madrid`). The slot engine, booking notice filter, and cancellation deadline all use the location's timezone automatically. No code changes needed.

---

## Quick Book & Date Suggestions

### Q: What does "In a week" / "In 2 weeks" / "In a month" mean?
These are **timing hints** for the next lesson suggestion, not recurring schedules:
- **In a week**: suggest next available slot on the preferred day, at least 7 days from today
- **In 2 weeks**: at least 14 days from today
- **In a month**: at least 28 days from today
- **No selection**: show the next available slot from today onwards

### Q: Why doesn't Quick Book show today's slots?
Two possible reasons:
1. **Booking notice**: the pro has a booking notice period (e.g. 24 hours). Slots within that window are filtered out. The notice period is shown in small text next to "Quick Book" (e.g. "24h notice").
2. **No availability template**: the pro doesn't have availability set for today's day of week.

### Q: Why does the pro see different dates than the student?
The pro **bypasses their own booking notice** when booking for a student. So a pro with 24h notice can still book same-day lessons, while the student cannot.

### Q: What is the "suggested slot" in Quick Book?
Quick Book tries to match the student's `preferredTime` (e.g. "morning") on the suggested date. If that time isn't available, it falls back to the first available slot on that date. If the suggested date has no slots at all, it promotes the next date with availability.

### Q: Where is the interval preference stored?
In `proStudents.preferredInterval`. It's managed exclusively via the Quick Book toggle buttons on the dashboard — not in the onboarding wizard or profile settings. Both the student and pro can set it.

---

## Booking & Payment

### Q: What happens when a student without a payment method tries to book?
Depends on the pro's setting:
- **"Allow booking without pre-payment" OFF** (default): student sees a red blocker on the booking confirmation step with a link to add a payment method in their profile. Quick Book shows "Add payment method to enable".
- **"Allow booking without pre-payment" ON**: student can book freely. A gold info note suggests adding a payment method for faster future bookings.

### Q: Can a pro book for a student without payment?
Yes, always. Pros bypass both the payment gate and the booking notice period. This supports free lessons, cash payments, and last-minute bookings.

### Q: What happens when a booking is cancelled?
- Booking status changes to "cancelled", `cancelledAt` timestamp is set
- The time slot becomes immediately available for other bookings
- Past bookings are preserved for accounting and history

---

## User Deletion

### Q: What happens when a student is deleted?
The admin clicks "Delete" in the user management panel. This triggers a **soft-delete**:
1. All future confirmed bookings are **cancelled** (slots freed for others)
2. All pro-student relationships are **deactivated** (status → "inactive")
3. User record is **soft-deleted** (`deletedAt` timestamp set)
4. User can no longer log in
5. Past bookings and coaching history are preserved for accounting
6. The user appears with a "deleted" badge and 50% opacity in the admin panel

### Q: What happens when a pro is deleted?
Same soft-delete process, plus:
1. Pro profile is **soft-deleted** and **unpublished** (`deletedAt` set, `published` → false)
2. All future bookings made **with** this pro are **cancelled**
3. All student relationships for this pro are **deactivated**
4. Pro no longer appears in search, browse, or booking pages
5. Existing students see their pro disappear from their dashboard
6. Past bookings and earnings data are preserved

### Q: Can a deleted user's email be re-used for a new account?
After **soft-delete**: No, the record still exists in the database. The registration check filters by `deletedAt IS NULL`, so a soft-deleted email is available for new registration.

After **purge** (permanent hard-delete): Yes, all data is removed and the email is fully available.

### Q: What is "Purge"?
A permanent hard-delete available only for users that have already been soft-deleted. It:
- Removes all bookings (past and future)
- Removes pro profiles and all associated data (locations, availability, pages)
- Removes pro-student relationships
- Removes notifications and email records
- Hard-deletes the user record from the database
- The email becomes available for re-registration

### Q: What about dummy test accounts?
Accounts matching `dummy*@golflessons.be` are **always hard-deleted** (purge) when deleted via the admin panel — they skip the soft-delete step entirely. This makes test cycles fast: delete the dummy, re-register immediately with the same email.

### Q: Does soft-delete affect the student's coaching chat history?
The coaching chat messages are preserved (they use `comments` table with soft-delete). The pro can still see past messages in their student view, but the student can no longer access the chat since they can't log in.

---

## Onboarding & Registration

### Q: What are the onboarding wizard steps?
1. **Language** — choose EN/NL/FR (sets language for the entire wizard and future emails)
2. **Create Account** — name, email, phone, password (with generate + copy option)
3. **Golf Profile** — handicap (optional), improvement goals
4. **Choose Pros** — select from published pros
5. **Scheduling** — per-pro: preferred duration, day, time, location
6. **Payment** — save a payment method via Stripe (skippable)

### Q: What happens if I close the browser mid-wizard?
The middleware detects incomplete onboarding (`onboardingCompletedAt` is null) and redirects you back to `/register`. The wizard resumes at the correct step based on what data is already saved.

### Q: What emails are sent during registration?
Three emails:
1. **Welcome email** — sent immediately on account creation
2. **Email verification** — sent immediately, 24-hour expiry link
3. **Onboarding confirmation** — sent when wizard is completed, contains all choices. If a generated password was used, the password is included in the email.

### Q: What if the student used "Generate password"?
The generated password is included in the onboarding confirmation email in a monospace box, with a note to save it or change it in their profile. If the student typed their own password, it is NOT included in any email.

---

## Availability & Scheduling

### Q: How does the availability engine work?
1. **Templates**: weekly recurring windows (e.g. Mon 09:00-17:00 at Location A)
2. **Overrides**: date-specific changes — block a day/range, or add extra availability on a normally off day
3. **Bookings**: existing confirmed bookings subtract from available time
4. **Booking notice**: filters out slots within the notice window (e.g. next 24 hours)
5. **Duration**: splits available windows into 30-minute increment slots of the requested lesson length

### Q: What is the booking notice?
The minimum time before a lesson that a student must book. Set by the pro (default 24 hours). Example: with 24h notice at 16:00 on Saturday, no Saturday slots are available. The notice is shown in the Quick Book header.

### Q: Can a pro override the booking notice?
Yes — when a pro books for a student (via the pro/students page), the booking notice is bypassed. The pro can book same-day and even same-hour lessons.

---

## PWA & Installation

### Q: Can I install the app on my phone?
Yes. On iPhone: open in Safari → Share → "Add to Home Screen". On Android: Chrome shows an install banner, or use Menu → "Add to Home Screen".

### Q: Can I install both preview and production?
Yes. Each environment has a unique manifest ID and name:
- Production: "Golf Lessons"
- Preview: "Golf Lessons (Preview)"

They install as separate apps with separate icons.

### Q: How do updates work?
The app is online-first — every visit fetches the latest code. A deployment checker polls every 60 seconds. If a new version is deployed while the app is open, a toast appears: "A new version is available" with a Refresh button.
