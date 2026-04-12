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
Yes. On **Android / desktop Chrome**: we capture the `beforeinstallprompt` event and show:
- A dismissible bottom banner on mobile ("Install Golf Lessons")
- An **Install app** button in `Profile → Install app` section
- A **one-click install button** inside the Help dialog (Android tab)

On **iPhone**: open in Safari → Share → **Add to Home Screen**. Apple doesn't implement `beforeinstallprompt`, so there's no one-click install — step-by-step instructions are in the Help dialog (iPhone tab).

### Q: How do I open the Help dialog?
Tap the **question mark icon** in the top bar (to the left of the language switcher). It has three tabs: iPhone, Android, QR login — with install and notification troubleshooting for each platform.

### Q: Can I install both preview and production?
Yes. Each environment has a unique manifest ID and name:
- Production: "Golf Lessons"
- Preview: "Golf Lessons (Preview)"

They install as separate apps with separate icons.

### Q: How does the app detect it's installed?
Three signals combined:
1. `display-mode: standalone` / `navigator.standalone` — true when running from Home Screen
2. `localStorage.pwa-installed` — set on the `appinstalled` event, persisted across tabs/sessions
3. `getInstalledRelatedApps()` — Chrome API that detects the PWA even from a regular browser tab

### Q: How do updates work?
The app is online-first — every visit fetches the latest code. The service worker (`/sw.js`) is served with `Cache-Control: must-revalidate` so browsers pick up new versions fast. A deployment checker polls for new deploys and shows a toast: "A new version is available" with a Refresh button.

---

## System Notifications (Web Push)

### Q: How do I enable system notifications?
Install the app (see above), then go to **Profile → Notifications → Enable notifications**. Grant permission when prompted. Tap **Send test notification** to verify it works.

### Q: Why don't I see notifications on iOS?
iOS Web Push only works when the PWA is installed to Home Screen via Safari. If you're using Chrome as default browser and scan a QR code, links open in Chrome — and you won't be able to install the PWA from there. Open in Safari manually.

### Q: I enabled notifications but don't see them on Android
The push is probably being delivered but Android is suppressing the visual. Common causes:
1. **Chrome site settings**: tap the lock icon → Permissions → Notifications → Allow
2. **Chrome marked the site as spammy** (especially on preview URLs) — the bell icon in the address bar has a strikethrough. Override to Allow.
3. **Do Not Disturb** is active
4. **Battery saver / background restrictions** on Chrome
5. Notification category is set to Silent in Android Settings → Apps → Chrome → Notifications

The Help dialog (Android tab) has step-by-step troubleshooting.

### Q: Why doesn't the installed PWA show up in Android's app list?
Android treats PWAs as websites managed by the browser. All notification settings live under **Settings → Apps → Chrome → Notifications → Sites**, not as a separate app entry.

### Q: What's the difference between the bell icon and system notifications?
- **Bell icon** (top bar, always visible): persistent history of all notifications. System notifications disappear once dismissed, so the bell is the only place you can review past alerts.
- **System notifications** (OS native popups): real-time alerts from Web Push, appear even when the app is closed or backgrounded.
- **In-app toasts**: slide in from the top when the app is in foreground (driven by WebSocket or forwarded push).

All three are fired from the same `createNotification` function — Web Push for subscribed users, WebSocket + ntfy for everyone else.

### Q: Why can I get a test notification but not real booking notifications?
This was a bug (fixed): `sendPush` was fire-and-forget, so Vercel serverless killed the promise before it finished. Now it's awaited. If you're still seeing this on an older deploy, update to the latest version.

---

## Login

### Q: What login methods are available?
1. **Email + password** — classic form on `/login`
2. **Sign in with Google** — OAuth button below the password form (no auto-registration; the email must already exist in the DB)
3. **QR code login** — on a desktop session, tap the **Phone** button in the dashboard header to show a QR code with a 5-minute token. On the phone, tap **Scan QR code to login** on the login page.

### Q: Who can use Google OAuth?
Anyone whose email is in the `users` or `user_emails` table. It's most useful for your team (Workspace users on `@golflessons.be`) — pros and students typically use password + email, since most don't have Google accounts.

### Q: What happens with QR login on iOS + Chrome?
If Chrome is your default browser on iOS, the QR code URL opens in Chrome. Login works, but Web Push and Home Screen install do NOT work in Chrome on iOS — only Safari. To install the PWA, open Safari manually.

---

## Backup & Restore

### Q: How are backups made?
A Vercel Cron hits `/api/backup` daily at 02:00 UTC. The endpoint calls `createBackup()` which dumps all 23 tables into a single JSON file and uploads it to Vercel Blob at `backups/YYYY/MM/TIMESTAMP.json`. Backups are public-blob URLs (unguessable, not auth-gated).

Devs can also trigger a backup manually from `/dev/backups` → **Create backup**.

### Q: How big is a backup?
Small — on preview with ~400 rows it's about 160 KB. Even at 10× that size it's still a few MB. Vercel Blob has generous limits.

### Q: How do I restore from a backup?
Go to `/dev/backups`, pick a backup, click **Restore**, confirm. It deletes all tables in FK order and re-inserts from the JSON. The entire operation is inside one process (not atomic — if it fails halfway, the DB is in a partial state).

### Q: Can I test that backup + restore actually work?

Yes, two levels:

**Safe test (no data changes)**: run `pnpm test:backup`. This creates a backup and compares row counts per table against the live DB. Output includes a table with ✓/✗ per table. Good for CI.

**Destructive round-trip test**: run `pnpm test:backup --restore`. This creates a backup, then actually runs restore and compares the DB state before and after. **This modifies your database** — only run against a throwaway environment. The recommended way is to create a Neon branch of your preview database, point the script at it via `POSTGRES_URL_PREVIEW_NON_POOLING=<branch-url>`, and destroy the branch afterwards.

You can also hit `/api/backup/validate?latest=true` or `?url=<blobUrl>` from the browser (as a dev) to get a JSON diff report for any backup without running a script.

### Q: What's in a backup and what isn't?
**Included**: all 23 tables (users, bookings, profiles, comments, notifications, CMS blocks, pro mailing lists, stripe events, etc.).

**Not included**: Vercel Blob files (uploaded coaching attachments), Stripe customer/subscription data (lives in Stripe), Google Workspace email, auth secrets, env vars.

So a full-disaster recovery would be: restore the DB from backup, then re-upload any missing blob files (or accept that they're gone, since URLs in the DB won't resolve to missing files).

### Q: How long are backups kept?
Forever, unless manually deleted from `/dev/backups`. Vercel Blob charges for storage but at backup sizes it's negligible. If needed we could add a retention policy later (e.g. keep daily for 30 days, weekly for 3 months, monthly forever).

### Q: What is `CRON_SECRET`?
A random token that Vercel Cron sends as `Authorization: Bearer <token>` when triggering `/api/backup`. It's set as an env var on preview and production. Without it, only logged-in dev users can trigger backups via POST.

---

## Observability & Error Tracking

### Q: Where do errors and events go?
Three systems that serve different purposes:

- **Sentry** (uncaught errors) — automatic capture of any thrown exception in server/client/edge code, with stack traces, user attribution, breadcrumbs, and grouping by fingerprint. Viewable at `/dev/sentry` or the full Sentry UI.
- **Events table** (business events) — explicit `logEvent({...})` calls for things like booking cancellations, push delivery stats, auth successes. Viewable at `/dev/logs` → Events tab. 90-day retention.
- **Vercel runtime logs** (raw `console.log`/`console.error`) — framework-level output. Viewable at `/dev/logs` → Runtime tab or the Vercel dashboard.

### Q: How are errors delivered to me?
The full chain for any new Sentry issue:

1. Error thrown in the app → Sentry captures it via `onRequestError` hook (`src/instrumentation.ts`)
2. Sentry groups by fingerprint; if it's a **new** issue, fires `issue:created` webhook
3. Webhook hits `/api/sentry/webhook`, signature verified with `SENTRY_WEBHOOK_CLIENT_SECRET_{PREVIEW|PRODUCTION}`
4. Handler calls `createNotification` (bell + Web Push + in-app toast to all dev users) AND a direct ntfy POST (guaranteed phone push)
5. Also writes a row to the `events` table with type `sentry.issue.created`

Result: a new production error pings your phone within seconds.

### Q: How do I test the full alert chain?
As a dev user, click **Throw test error** on `/dev/sentry` (or visit `/api/dev/throw` directly). This uses `Sentry.captureException` with a **unique fingerprint per call**, so every click creates a fresh issue and fires the webhook. You should get a phone notification within 10 seconds.

### Q: Why didn't my existing error trigger another notification?
Sentry's `issue:created` event only fires the **first time** a fingerprint is seen. Subsequent throws just increment the count on the existing issue. The test throw route forces a unique fingerprint, but real code errors will group naturally — if you want to test again, resolve the existing issue in `/dev/sentry` (or in the Sentry UI) first.

### Q: Why did notifications mysteriously stop working?
The most common cause: you added a new env var (or renamed one) and the currently-running deployment was built before the env var existed. Push an empty commit (`git commit --allow-empty`) or redeploy from the Vercel dashboard to pick up the change.

### Q: Why isn't Sentry capturing my errors?
Check:
1. `NEXT_PUBLIC_SENTRY_DSN` is set as a regular Vercel env var (**not** just via the Marketplace integration — see gotcha below)
2. `Sentry.init()` in `sentry.*.config.ts` has `enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN` — if DSN is missing, Sentry is silently disabled
3. Deployment was built AFTER the env var was added
4. The test throw route uses `Sentry.flush(2000)` to ensure the event is sent before the serverless function terminates

### Q: What's the "Marketplace env var gotcha"?
Vercel Marketplace integrations (Sentry, Neon, etc.) provision env vars in a separate bucket that doesn't show up in `vercel env ls` and may not be injected into your function runtime reliably. Fix: add the critical ones as regular env vars via `vercel env add`:

- `NEXT_PUBLIC_SENTRY_DSN` — required for error capture
- `SENTRY_AUTH_TOKEN` — required for source map upload at build time
- `SENTRY_ORG`, `SENTRY_PROJECT` — required by our `/dev/sentry` code

### Q: Why is there a dedicated `SENTRY_READ_TOKEN`?
The Marketplace-provisioned `SENTRY_AUTH_TOKEN` only has scopes for project write (source map upload) and release management. To list issues, fetch latest events, and resolve issues via the API, we need a separate token with `event:admin` + `project:read` scopes. Create it at `https://sentry.io/settings/account/api/auth-tokens/`.

### Q: Why `LOGS_VERCEL_TOKEN` instead of `VERCEL_API_TOKEN`?
The `VERCEL_` prefix is reserved by Vercel for system-injected env vars (like `VERCEL_URL`, `VERCEL_ENV`). Custom env vars with that prefix may be silently stripped or overridden at runtime. `LOGS_VERCEL_TOKEN` avoids the conflict.
