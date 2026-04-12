# Golf Lessons — Feature Overview

## Platform Summary

Golf lesson booking platform at **golflessons.be**. Pros subscribe annually, configure availability, and receive lesson bookings. Students browse pros, book lessons, and get a personal coaching channel with tips, photos, videos, and WhatsApp-style conversations. Sister site of silverswing.golf.

---

## 1. Authentication & User Management

### Registration
- **Two-track registration**: Student (free) or Golf Pro (subscription)
- Student registration creates `member` role, redirects to pro selection
- Pro registration creates `member,pro_pending` role, sends high-priority notification to admins
- Welcome email sent on registration (branded, locale-aware)
- ntfy push notification for pro registrations

### Login
- Email + password with show/hide toggle
- **Sign in with Google** (OAuth) as an alternative to password — matches the returned email against `users`/`user_emails`, no auto-registration
- Accepts any registered email (primary or alias via `user_emails` table)
- Pre-fills email from `?email=` query parameter (from invite/reset links)
- Auto-activates pending pro-student relationships on login
- Updates `lastLoginAt` timestamp

### QR Login (desktop → mobile)
- On member and pro dashboards, a "Phone" button shows a QR code containing a 5-minute JWT
- Login page has a **Scan QR code to login** button (mobile only) using the camera + `jsqr`
- Callback redirects based on role: pros → `/pro/dashboard`, admin/dev → `/admin`, members → `/member/dashboard`

### Password Management
- **Forgot password**: enter email → receives branded reset link (1-hour JWT token)
- **Reset password**: set new password via token link, auto-logs in after reset
- **Admin reset**: generates password, optionally notifies user by email
- Prevents email enumeration (always shows success on forgot password)

### User Roles
- `member` — can browse pros, book lessons, chat
- `pro` — can manage availability, students, bookings, pages
- `pro_pending` — registered as pro, awaiting admin activation
- `admin` — full access to all admin features
- `dev` — developer tools (database, blob, logs)

### Admin User Management (`/admin/users`)
- User list with search, role badges, last login dates
- **Add User**: create with optional password, role toggles
- **Edit User**: update name, email, roles
- **Invite User**: generate temp password, select recipient email (primary/alias/custom), personal message, copy to self
- **Reset Password**: auto-generate password, optionally notify user
- **Activate as Pro**: only for `pro_pending` users — adds pro role, creates profile, sends activation email
- **Delete User**: with confirmation, prevents self-deletion
- **Email aliases**: add/remove email addresses per user, primary protected

### Email Aliases
- `user_emails` table: multiple emails per user with labels
- Login accepts any alias
- Admin can manage aliases per user

---

## 2. Internationalization (i18n)

- Three languages: English, Dutch (NL), French (FR)
- Default locale: English
- **Language switcher**: globe icon dropdown in header
- **User preference**: saved in profile, stored in `preferredLocale` field
- **Email locale**: all emails respect recipient's `preferredLocale`
- Covers: navigation, auth pages, profile, dashboard, registration, footer
- Admin and Dev pages stay in English

---

## 3. Pro Profiles & Public Pages

### Pro Browse Page (`/pros`)
- Grid of published pros with photos, names, specialties, locations, pricing
- Public — no login required

### Pro Profile Page (`/pros/[slug]`)
- Photo, display name, specialties, pricing badges
- Bio section
- Teaching locations with addresses
- "Book a Lesson" button (links to booking wizard)
- "Join as Student" button for logged-in members
- Links to custom flyer/landing pages
- Public — no login required

### Pro Profile Editor (`/pro/profile`)
- **Profile section**: display name, specialties, bio
- **Lesson Settings**: price indication, duration options (30/60/90/120 min checkboxes), max group size
- **Booking Settings**: booking enabled toggle, booking notice (hours), booking horizon (days), cancellation window (hours)

---

## 4. Lesson Booking System

### Availability Engine (`src/lib/lesson-slots.ts`)
- Pure computation: templates → overrides → subtract bookings → slice into duration-sized slots at 30-minute increments
- Day-of-week: ISO convention (Monday=0)
- Booking notice filtering (strict > threshold)
- Cancellation deadline checking
- ICS calendar file generation (booking + cancellation)

### Pro Availability Editor (`/pro/availability`)
- **Weekly template grid**: 7-day × half-hour paintable grid with multi-location support
- Each cell stores a `Set<number>` of location IDs — conflicts shown as stripes
- Click/drag to paint with active location brush
- **Preview/blocking grid**: real calendar weeks with template availability as background, bookings overlaid
- Brush for blocked time or extra availability per location
- Full-day block toggle with reason
- Auto-save with 2-second debounce
- Location color coding with legend

### Pro Locations (`/pro/locations`)
- Create teaching locations (name, address, city, country)
- Reuses existing location records if name matches
- Edit price indication, internal notes, active/inactive toggle
- Remove locations with confirmation

### Student Booking Wizard (`/member/book/[slug]`)
- 6-step wizard with breadcrumb stepper:
  1. **Location** — pick from pro's active locations
  2. **Duration** — select from pro's configured durations
  3. **Date** — calendar showing only available dates within booking horizon
  4. **Time** — grid of available time slots
  5. **Details** — participant name, email, phone, count, notes
  6. **Confirm** — full summary, confirm button
- Re-validates slot availability before creating booking
- Generates manage token for future booking management
- Creates `proStudents` relationship if not exists
- Sends high-priority notification to pro

### Student Bookings (`/member/bookings`)
- Upcoming lessons with date, time, pro name, location, cancel button
- Cancel checks cancellation deadline from pro profile settings
- Past/cancelled bookings in collapsed section

### Pro Bookings (`/pro/bookings`)
- Week calendar view (Google Calendar style)
- Booking blocks positioned by time, colored by status
- Availability slots shown as subtle background
- Previous/next week navigation + Today button
- Click booking to expand details (student, contact, notes)
- Past/cancelled bookings in collapsible section

---

## 5. Pro-Student Relationships

### `proStudents` Table
- Links a pro profile to a student user
- Source: `self` (student chose), `invited` (pro invited), `pro_added` (pro created)
- Status: `active`, `pending` (invited, not yet logged in), `inactive` (removed)
- `lastMessageAt` for conversation sorting

### Three Creation Paths
1. **Student self-registers**: chooses pros on `/member/choose-pros` after registration
2. **Pro invites student**: from `/pro/students`, sends invite email with temp password
3. **Pro adds student**: creates account directly, relationship active immediately

### Choose Pros Page (`/member/choose-pros`)
- Shown after student registration
- Grid of published pro cards with multi-select toggle
- "Continue" creates relationships, "Skip" goes to dashboard
- Supports `?pro=<id>` for pre-selection from pro profile pages

### Pro Student Management (`/pro/students`)
- Student list with filter tabs (All/Active/Pending/Inactive)
- Source badges (Self-registered/Invited/Added by pro)
- **Invite student**: email form, creates user + relationship + sends invite
- **Add student**: creates user + active relationship + sends invite
- Remove student (sets status to inactive)
- Clickable names → coaching chat page

### Data Isolation
- All pro queries scoped by `proProfileId`
- Pros never see each other's students
- Mailing sync uses `proStudents` as primary source

---

## 6. Coaching Chat

### WhatsApp-Style Messaging
- Per-relationship coaching channel (contextType="coaching")
- Uses existing `comments` system with `contextId = proStudents.id`
- Chat bubbles: own messages right-aligned (dark green), others left (light green)
- Incremental polling with push-driven refresh
- Date separators (Today, Yesterday, or date)
- Reply-to with quoted preview
- **Chevron menu** inside bubble top-right → Reply / Download (attachments) / Delete (own)
- **Grey smiley next to bubble** → opens quick reaction popup (👍 ❤️ 😂 🎯 ✅)
- Reactions: anyone can toggle, counts per emoji, own reaction highlighted
- **Emoji picker** in input field (100+ emojis grid)
- Edit (15-minute window) and soft delete
- Members can delete their own comments and add reactions (not restricted to pro/admin)
- Input stays pinned above the BottomNav on mobile; 16px font to prevent iOS auto-zoom

### File Sharing
- Paperclip button for file picker
- Drag-and-drop upload with visual overlay
- Upload progress indicator
- Stored in Vercel Blob at `coaching/{proStudentId}/`
- 10MB limit; images, videos, documents accepted
- **Inline media in bubbles**:
  - Images: thumbnail (max 300px), click for full-screen lightbox
  - Videos: thumbnail with play icon, click for video overlay
  - Documents: card with icon, name, size, download link

### Pages
- Pro view: `/pro/students/{id}` — coaching with a specific student
- Student view: `/member/coaching/{id}` — coaching with their pro
- Student chat list: `/member/coaching` — list of active pros (used by the BottomNav "Chat" tab)
- Full-height layout with header showing partner info + back link

### `lastMessageAt` Tracking
- Updated on each message for conversation sorting

---

## 7. Notifications

### In-App Notifications
- `notifications` table with type, priority, target user, title, message, action URL
- Bell icon in header (admin/pro/dev + member) with unread count badge — always visible as persistent history (system notifications disappear)
- Dropdown is a centered modal on mobile, anchored dropdown on desktop
- Mark all read / Clear all actions (panel auto-closes after clear)
- Click to mark as read + navigate to action URL
- 30-second polling fallback
- WebSocket support via Hetzner gateway

### Toast Notifications
- Slide-in from right for high/urgent priority
- Auto-dismiss after 5 seconds
- Two-tone chime sound via Web Audio API
- Also fired when the service worker forwards a Web Push to an active tab

### Web Push Notifications (PWA)
- `push_subscriptions` table stores per-device FCM/Apple push endpoints with VAPID keys
- `/api/push/subscribe`, `/api/push/unsubscribe`, `/api/push/status`, `/api/push/test`
- `src/lib/push.ts` `sendPush(userIds, payload)` helper using `web-push`
- Service worker (`public/sw.js`, v3) handles `push` + `notificationclick`:
  - Always calls `showNotification()` (OS suppresses in foreground automatically)
  - Forwards to active clients via `postMessage` so the in-app toast still fires
  - `requireInteraction: true`, `vibrate: [200, 100, 200]`, `renotify: true`
- `createNotification` routes push-subscribed users to Web Push only (awaited, not fire-and-forget), non-subscribed users to WebSocket + ntfy fallback
- Users enable via **Profile → Notifications → Enable notifications**, with a **Send test notification** button for diagnostics
- iOS requires PWA installed to Home Screen before permission can be granted

### ntfy Push Notifications (legacy fallback)
- Sends to Hetzner server via `golf-alerts` topic
- Only triggered for fallback users (no Web Push subscription) on high/urgent priority

### Notification Types
- `user_registered` — new student or pro registration
- `new_booking` — lesson booked
- `task_assigned` — task created with assignee
- `task_completed` — task moved to done
- `pro_activated` — admin activated pro account
- `comment_notification` — new comment in a context

---

## 8. Email System

### Gmail API Integration
- Service account with domain-wide delegation
- Sends from `noreply@golflessons.be`
- RFC 2047 encoding for non-ASCII subjects
- `GMAIL_SEND_AS` configurable

### Branded Email Templates
- Table-based HTML layout (email client compatible)
- Dark green header bar with "Golf Lessons" branding
- White card body with cream background
- Diamond divider motif
- Footer with links and copyright
- All templates respect recipient's `preferredLocale` (EN/NL/FR)

### Email Types
- **Welcome email**: student vs pro variants
- **Invite email**: login credentials with "Log in now" button
- **Password reset email**: "Your password has been reset" with credentials
- **Forgot password email**: reset link (1-hour expiry)
- **Pro activation email**: "Your pro account has been activated" with dashboard link
- **All emails**: pre-fill login email in URL for convenience

---

## 9. Task Management

### Kanban Board (`/admin/tasks`)
- Three columns: To Do (blue), In Progress (amber), Done (green)
- Task cards with priority badge, assignee names, checklist progress, color labels
- Arrow buttons to move tasks between columns
- Create form with title + priority
- Detail panel with tabs:
  - **Task**: edit title, assignees, priority, color label, due date, checklist
  - **Comments**: WhatsApp-style chat with @mentions
  - **Share**: manage who can see/be assigned to the task

### Task Features
- Priority: low, normal, high
- Color labels: red, orange, yellow, green, blue, purple
- Checklists with add/remove/toggle items
- Due dates
- Assignees (checkbox toggle)
- Sharing (shared vs assigned)
- Notifications on assignment and completion
- @mention in comments triggers high-priority notification

### Access Control
- Admin (`/admin/tasks`): sees all tasks
- Task access enforced on every mutation via `requireTaskAccess()`

---

## 10. CMS & Content Management

### CMS System
- `cmsBlocks` table: page/block/locale content with translation tracking
- `getCmsData()` with English fallback for other locales
- `CmsProvider` context for draft editing (dirty tracking, commit/revert)
- `CmsBlock` component for inline rendering with edit mode indicators
- `CmsPageInit` for initializing CMS on a page

### Admin Toolbox (admin/dev only)
- Right-edge toggle button with `Ctrl+.` shortcut
- Resizable drawer panel (300-800px, persisted to localStorage)
- **Content tab**: page selector, locale tabs (EN/NL/FR), inline block editors, review dialog with diff view, publish/revert
- **AI tab**: streaming chat interface (placeholder API, ready for Anthropic connection)

### CMS-Enabled Pages
- Home, For Students, For Pros, Contact (with per-page editors)

---

## 11. Pro Pages & Flyers

### Pro Pages (`/pro/pages`)
- Create flyer/landing pages to promote services
- Publish/unpublish toggle
- Delete with confirmation
- Pages use numeric IDs as slugs (no names exposed)

### Public Flyer Pages (`/pros/[slug]/[pageSlug]`)
- Hero section with optional image
- Rich intro text
- Dynamic sections: text, gallery, video, pricing, testimonial
- CTA button (URL or email)

---

## 12. Pro Mailing

### Contact Management (`/pro/mailings`)
- Contact list with student sync from `proStudents`
- Manual contact add (email, name)
- Remove contacts
- Source badges (student/manual)

### Email Composition
- Subject, body, optional page attachment
- Select recipients with checkboxes
- Select all / deselect
- Send count indicator

---

## 13. Public Website Pages

### Home Page
- Hero with CTA buttons (translated)
- "How It Works" feature cards
- Pro CTA section
- CMS-enabled content

### For Students (`/for-students`)
- 6 feature cards with icons
- 4-step "How It Works" flow
- CTA section
- Full i18n (EN/NL/FR)

### For Pros (`/for-pros`)
- 6 platform feature cards
- "More Than Just Bookings" section with 4 cards
- Pricing hint + CTA
- Full i18n (EN/NL/FR)

---

## 14. Infrastructure

### Pre-Launch
- Password gate on non-localhost domains (password: `prolessons`, 30-day cookie) — enforced in `src/middleware.ts`
- Pre-launch banner was removed; the password gate alone keeps the site private
- Deployment checker: polls `/api/version`, shows refresh banner on new deploy

### PWA
- Next.js manifest via `src/app/manifest.ts` (standalone, green/gold theme, maskable icons)
- Service worker at `public/sw.js` (online-first, no-cache headers)
- One-click install on Android/desktop Chrome via `beforeinstallprompt`:
  - Captured early by an inline script in the root layout (before React hydrates) and stashed on `window.__deferredInstallPrompt`
  - `InstallBanner` (mobile only, `md:hidden`) shows a dismissible bottom banner when installable (7-day cooldown)
  - `InstallPwaSection` on profile pages with live install status (standalone check + localStorage flag + `getInstalledRelatedApps()`)
  - `HelpDialog` has platform tabs (iPhone/Android/QR) with one-click install button on Android and Safari instructions for iOS
- iOS: instructions-only flow (Apple doesn't implement `beforeinstallprompt`)

### Database
- Neon Postgres (`neon-teal-flame`)
- Drizzle ORM with `pnpm db:push` for schema sync
- Tables: users, userEmails, cmsBlocks, notifications, pushSubscriptions, proProfiles, locations, proLocations, proAvailability, proAvailabilityOverrides, lessonBookings, lessonParticipants, proPages, proStudents, proMailingContacts, proMailings, tasks, taskNotes, comments, commentReactions

### Storage
- Vercel Blob (`lessons-blob`) for file uploads
- Coaching files at `coaching/{proStudentId}/`

### Domain & Email
- `golflessons.be` on Vercel DNS
- Google Workspace secondary domain (shares users with silverswing.golf)
- MX, SPF, DKIM, DMARC records configured
- Gmail API via service account for sending

### Testing
- Vitest with 121 tests (93 unit + 28 integration)
- Unit tests: slot computation, day-of-week, overrides, ICS generation, cancellation
- Integration tests: DB queries, booking creation, override integration
- Dummy test accounts: `dummy.pro@golflessons.be`, `dummy.student@golflessons.be`

### Design
- Green/gold luxury palette (green-950 to green-50, gold-600 primary)
- Fonts: Cormorant Garamond (display), Outfit (body)
- Logo: golf flag with ball SVG (cream/green/gold variants)
- Responsive design with mobile support

---

## 15. App Layout (Live)

- **AppLayout** (for logged-in users): top bar (Logo, Help, Language, Bell, User), left sidebar with collapsible role sections (persisted to localStorage, can collapse even when the active page is inside a section), bottom tab bar on mobile (Home, Bookings, Chat, Profile for members; Dashboard, Students, Bookings, Profile for pros)
- **AppTopBar** right side: HelpDialog button, LanguageSwitcher (globe icon), NotificationBell, firstName + user menu
- **HelpDialog** (question mark icon): iPhone/Android/QR login tabs with install + notification troubleshooting
- Sidebar collapsed/expanded state persisted per-user in localStorage

## 16. Planned (Not Yet Implemented)

- **Contact page**: public contact form
- **ICS email attachments**: booking confirmation/cancellation calendar files
- **Daily digest cron**: email summary of unread notifications
- **Video hosting**: Vercel Blob for lesson videos (infrastructure ready, no UI yet)
- **Google Calendar sync**: for pros with @golflessons.be emails
