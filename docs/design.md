# Golf Lessons Platform — Design Document

## 1. Vision

A platform where golf professionals manage their teaching business and students book lessons, track progress, and receive personalized coaching content. Hosted at **golflessons.be** / **golf-lessons.be**.

Sister project of [silverswing.golf](https://silverswing.golf) — standalone product, independent codebase. The lesson booking system will be migrated here from silverswing (and removed from silverswing).

---

## 2. Decisions Log

| # | Question | Decision | Notes |
|---|----------|----------|-------|
| 1 | UI components | **Fresh start with shadcn/ui** | New design language, faster iteration |
| 2 | Auth | **Custom JWT** (reuse silverswing pattern) | Proven, no external dependency |
| 3 | Stripe model | **Stripe Connect Express** | Pro receives directly minus platform fee. See §7 |
| 4 | Video hosting | **Deferred** | Start with Vercel Blob, revisit when video needs are clearer |
| 5 | Subscription tiers | **Monthly (€12.50) + Annual (€125)** | 14-day free trial. See `docs/stripe-integration.md` |
| 6 | Code sharing | **Copy from silverswing** | Lesson engine moves here, gets removed from silverswing |
| 7 | Locales | **EN, NL, FR from the start** | All three from day one |
| 8 | Commission | **2.5% per lesson** | Platform keeps 2.5% via `application_fee_amount`. See `docs/stripe-integration.md` |
| 9 | Student page interaction | **WhatsApp-style reply/comment** | Two-way conversation per entry, not just one-way |
| 10 | Domain | **golflessons.be** | Purchased via Vercel |
| 11 | Pre-launch access | **Password-protected preview** | Vercel password protection on preview + staging |

---

## 3. User Roles

### Golf Pro (paid subscription)
- Signs up, pays annual subscription via Stripe
- Creates a public profile (bio, photo, qualifications, locations)
- Configures availability (weekly templates + date overrides)
- Sets lesson types and pricing (individual, group, on-course)
- Manages bookings (confirm, cancel, reschedule)
- Creates per-student content pages (tips, photos, videos, notes)
- Views earnings dashboard and student roster

### Student (free account)
- Signs up (email/password)
- Browses pros by location/availability
- Books lessons and pays per-lesson via Stripe Connect
- Views personal page with pro-curated content (tips, media, progress notes)
- Manages upcoming bookings, cancellation

### Admin
- Manages platform (users, pros, subscriptions, content)
- Views platform analytics, revenue

---

## 4. Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 16 (App Router) | Server Components default, Turbopack |
| Language | TypeScript 5 | Strict mode |
| UI | **shadcn/ui** + Tailwind CSS 4 | Fresh design, Radix primitives |
| ORM | Drizzle ORM | Ported from silverswing |
| Database | PostgreSQL via Neon | Serverless, pooled + non-pooling connections |
| Storage | Vercel Blob | Photos, videos, documents |
| Payments | **Stripe Connect** | Pro subscriptions + student lesson payments |
| Auth | Custom JWT (jose + bcryptjs) | Cookie-based sessions, role-based middleware |
| Email | Resend | Booking confirmations, notifications |
| i18n | EN, NL, FR | Locale-based routing |
| Deployment | Vercel | Preview + production |
| Package manager | pnpm | |
| Testing | Vitest | |

---

## 5. Core Features

### 5.1 Pro Onboarding & Subscription

```
Pro signs up → email verification → Stripe Checkout (annual plan)
  → subscription active → complete profile → configure availability
```

- Single annual plan (schema supports adding tiers later)
- Stripe Customer Portal for self-service management
- Grace period / dunning on failed payments
- Profile: name, photo, bio, qualifications, lesson locations
- Stripe Connect onboarding for receiving lesson payments

### 5.2 Availability & Scheduling

Copied from silverswing (`lesson-slots.ts`), then extended:

**Ported:**
- Weekly recurring templates with date ranges (validFrom/validUntil)
- 30-minute slot increments
- Override system (block dates, add custom windows)
- Booking conflict detection
- Minimum booking notice (hours before lesson)
- Cancellation window enforcement

**New:**
- Multiple lesson types per pro (individual 30min, individual 60min, group, on-course)
- Location-specific availability
- Buffer time between lessons

### 5.3 Lesson Booking Flow

```
Student browses pros → selects pro → picks lesson type
  → picks location → picks date/time from available slots
  → confirms booking → payment (Stripe Connect) → confirmation emails
```

- Real-time slot availability
- Booking status: pending → confirmed → completed / cancelled
- Cancellation policy per pro (configurable window)
- Rescheduling support
- Payment goes to pro's connected Stripe account (platform takes commission)

### 5.4 Student Personal Page

**This is the differentiating feature.** Each pro maintains a personal page per student:

- **Tips & notes**: Rich text (Tiptap editor)
- **Photos**: Swing analysis, setup positions (Vercel Blob)
- **Videos**: Swing recordings, drill demonstrations (Vercel Blob for now)
- **Progress timeline**: Chronological feed of all content added by the pro
- **Drill assignments**: Pro assigns practice drills with descriptions/media
- **Lesson summaries**: Auto-linked after each completed lesson

Access: student sees only their own page. Pro sees all their students' pages.

**Interaction model (WhatsApp-style):**
- Each entry has a conversation thread below it
- Pro posts an entry (tip, photo, video, drill)
- Student can reply with text/emoji
- Pro can reply back — threaded conversation per entry
- Real-time feel: messages appear immediately (optimistic UI)
- Read receipts (optional)

### 5.5 Payments (Stripe Connect)

**Pro subscriptions (platform revenue):**
- Annual plan via Stripe Checkout (direct to platform)
- Stripe Customer Portal for self-service
- Webhooks: `invoice.paid`, `customer.subscription.deleted`, etc.

**Lesson payments (via Stripe Connect):**
- Student pays at booking time
- Payment routes to pro's connected Stripe account
- Platform takes a commission (application fee)
- Pro completes Stripe Connect onboarding during registration
- Lesson packages (5-lesson bundles) — future phase

### 5.6 Notifications

- **Email** — booking confirmations, reminders (24h before), cancellations, new content from pro
- **In-app notification bell** — persistent history, always visible (system notifications disappear)
- **In-app toast** — slide-in for high/urgent priority; also fired when the service worker forwards a Web Push to an active tab
- **Web Push** — system notifications via service worker, `push_subscriptions` table, VAPID auth, `web-push` library. Subscribed users are routed to push only; non-subscribed users fall back to WebSocket + ntfy. All three channels flow through the single `createNotification` funnel.
- **ntfy** — legacy fallback for non-subscribed users on high/urgent priority
- SMS reminders — future phase

### 5.7 PWA & Installation

- **Manifest** via `src/app/manifest.ts` (standalone, maskable icons, environment-aware name)
- **Service worker** (`public/sw.js`, v3) — online-first, handles `push` + `notificationclick`, `requireInteraction` + `vibrate` for prominence
- **Install flow**:
  - Inline script in root layout captures `beforeinstallprompt` early (before React hydrates)
  - `InstallBanner` — mobile-only dismissible bottom banner (7-day cooldown)
  - `InstallPwaSection` — profile page section with install button and live "Installed" detection
  - `HelpDialog` — question-mark icon in top bar with iPhone/Android/QR login tabs, per-platform install + notification troubleshooting
- iOS: Safari-only, instructions flow (Apple doesn't implement `beforeinstallprompt`)

---

## 6. Information Architecture

### Route Structure

```
/(site)/[locale]/                     # Public marketing pages
/(site)/[locale]/pros                 # Browse golf pros
/(site)/[locale]/pros/[slug]          # Pro public profile
/(site)/[locale]/pricing              # Pro subscription pricing

/login                                # Auth (password + Google OAuth)
/register                             # Auth (role selection: pro vs student)
/register/pro                         # Pro registration → Stripe sub + Connect
/register/student                     # Student registration

/api/auth/google                      # Google OAuth start (CSRF state cookie)
/api/auth/google/callback             # Google OAuth callback → session
/api/auth/qr-login                    # QR login token callback (role-aware redirect)

/api/push/subscribe                   # Web Push: store subscription
/api/push/unsubscribe                 # Web Push: remove subscription
/api/push/status                      # Web Push: current user's subscription state
/api/push/test                        # Web Push: diagnostic send-to-self

/(pro)/pro/                           # Pro dashboard
/(pro)/pro/profiel                    # Edit profile
/(pro)/pro/beschikbaarheid            # Availability editor
/(pro)/pro/lessen                     # Lesson management
/(pro)/pro/studenten                  # Student roster
/(pro)/pro/studenten/[id]             # Student personal page (pro edits)
/(pro)/pro/billing                    # Subscription, plan, invoices, payment method
/(pro)/pro/earnings                   # Lesson revenue, payouts, Connect dashboard

/(student)/student/                   # Student dashboard
/(student)/student/lessen             # My bookings
/(student)/student/boeken             # Book a lesson
/(student)/student/payments           # Payment history, methods, refunds
/(student)/student/mijn-pagina        # My personal page (read-only)

/(admin)/admin/                       # Admin dashboard
/(admin)/admin/gebruikers             # User management
/(admin)/admin/pros                   # Pro management
/(admin)/admin/payments                # Payment dashboard (MRR, commissions, volume)
/(admin)/admin/payments/subscriptions # Subscription management
/(admin)/admin/payments/lessons       # Lesson payment management + refunds
/(admin)/admin/payments/connect       # Connect account overview
/(admin)/admin/payments/payouts       # Payout monitoring

/api/webhooks/stripe                  # Stripe webhooks
/api/cron/...                         # Scheduled jobs
```

### Database Schema (key tables)

```
users
  - id, email, passwordHash, name
  - role: pro | student | admin
  - stripeCustomerId
  - emailVerified, emailVerificationToken
  - locale (en | nl | fr)
  - createdAt, updatedAt

proProfiles
  - id, userId (FK)
  - slug (for public URL)
  - bio, photo, qualifications
  - subscriptionStatus (active | past_due | cancelled | trialing)
  - stripeSubscriptionId
  - stripeConnectAccountId
  - stripeConnectOnboarded (boolean)

proLocations
  - id, proProfileId (FK)
  - name, address, lat, lng

proAvailability              # Weekly templates (ported from silverswing)
  - id, proProfileId (FK)
  - dayOfWeek (0-6)
  - startTime, endTime
  - validFrom, validUntil
  - locationId (FK, nullable — NEW: location-specific)

proAvailabilityOverrides     # Date-specific overrides
  - id, proProfileId (FK)
  - date
  - type: blocked | available
  - startTime, endTime (nullable for full-day block)

lessonTypes
  - id, proProfileId (FK)
  - name (e.g., "Individual 30min", "Group lesson")
  - durationMinutes
  - maxParticipants
  - priceCents
  - bufferMinutes (time between consecutive lessons)
  - active (boolean)

lessonBookings
  - id
  - lessonTypeId (FK)
  - studentId (FK → users)
  - proProfileId (FK)
  - locationId (FK)
  - startsAt, endsAt
  - status: pending | confirmed | completed | cancelled | no_show
  - paymentStatus: pending | paid | refunded
  - stripePaymentIntentId
  - cancellationReason
  - cancelledAt, cancelledBy

studentPages
  - id
  - proProfileId (FK)
  - studentId (FK → users)
  - createdAt

studentPageEntries
  - id, studentPageId (FK)
  - type: note | photo | video | drill | lesson_summary
  - title (nullable)
  - content (JSON — Tiptap rich text)
  - mediaUrl (Vercel Blob URL, nullable)
  - linkedBookingId (FK → lessonBookings, nullable — for lesson summaries)
  - sortOrder
  - createdAt, updatedAt

studentPageComments          # WhatsApp-style replies on entries
  - id
  - entryId (FK → studentPageEntries)
  - authorId (FK → users)          # pro or student
  - content (text)
  - mediaUrl (nullable — photo/emoji)
  - readAt (nullable — read receipt)
  - createdAt

notifications
  - id, userId (FK)
  - type (booking_confirmed | booking_cancelled | reminder | new_content | ...)
  - title, body
  - link (nullable)
  - read (boolean)
  - createdAt
```

---

## 7. Stripe Connect Architecture

### Why Express?

Three Stripe Connect account types exist:

| Type | Onboarding UI | Pro gets dashboard? | Platform effort | Best for |
|------|---------------|---------------------|-----------------|----------|
| **Standard** | Stripe-hosted (full OAuth) | Full Stripe Dashboard | Lowest | Marketplaces where sellers already use Stripe |
| **Express** | Stripe-hosted (branded) | Lightweight payout dashboard | Moderate | **Our case** — platform-controlled, pro just needs payouts |
| **Custom** | You build it yourself | None (you build it) | Highest | White-label, full control needed |

**Express is the sweet spot**: Stripe handles the legally complex onboarding (Belgian KYC/AML, IBAN collection, identity verification) via a hosted form branded with our platform name. Pros onboard in minutes. We keep control over the fee structure and UX. Supports SEPA payouts to Belgian bank accounts out of the box.

### Architecture

```
Platform (golflessons.be)
  └── Stripe Account (platform)
        ├── Pro subscriptions → direct charges to platform account
        └── Stripe Connect (Express)
              ├── Pro A (connected account)
              │     └── Student pays → PaymentIntent with application_fee_amount
              ├── Pro B (connected account)
              │     └── ...
              └── ...
```

### Pro Onboarding Flow

```
1. Pro signs up on golflessons.be
2. Platform calls stripe.accounts.create({ type: 'express', country: 'BE' })
3. Platform generates onboarding link → redirects pro to Stripe
4. Stripe collects: identity, Belgian IBAN, ToS acceptance
5. Stripe fires account.updated webhook → platform marks pro as onboarded
6. Pro can now receive lesson payments
```

### Lesson Payment Flow

```
1. Student books lesson → selects lesson type + timeslot
2. Platform creates PaymentIntent on pro's connected account:
     - amount: lesson price
     - application_fee_amount: platform commission (TBD — may be 0)
     - transfer_data.destination: pro's connected account ID
3. Student pays (Stripe Checkout or embedded payment form)
4. Stripe routes: commission → platform, remainder → pro
5. Pro receives SEPA payout to bank on Stripe's standard schedule
```

### Commission Model (TBD)

Two options under consideration:
- **Option A**: 0% commission, higher annual subscription fee (simpler, pro-friendly)
- **Option B**: Small commission % per lesson + lower subscription fee (scales with volume)

The `application_fee_amount` can be set to 0 for option A — the Connect infrastructure still works for routing payments to pros.

### Webhooks

- `account.updated` — Connect onboarding status changes
- `checkout.session.completed` — subscription purchase
- `invoice.paid` / `invoice.payment_failed` — subscription lifecycle
- `customer.subscription.deleted` — subscription cancellation
- `payment_intent.succeeded` — lesson payment received
- `payment_intent.payment_failed` — lesson payment failed
- `charge.refunded` — lesson cancellation refund

---

## 8. i18n Strategy

- Locale in URL path: `/(site)/[locale]/...` for public pages
- Authenticated routes: locale stored in user profile, applied via middleware
- Dictionary-based translations (JSON files per locale)
- Default locale: NL (Belgian market primary)
- Fallback chain: user locale → NL

```
/src/i18n/
  en.json
  nl.json
  fr.json
  index.ts          # t() helper, locale detection
```

---

## 9. Phases

### Phase 1 — MVP
- Project scaffold (Next.js 16 + shadcn/ui + Drizzle + Neon)
- Custom JWT auth (register, login, email verification, password reset)
- Role-based middleware (pro, student, admin)
- i18n: EN, NL, FR
- Pro registration + annual Stripe subscription
- Stripe Connect onboarding for pros
- Pro profile + availability configuration (ported from silverswing)
- Lesson types management
- Student registration
- Lesson booking flow (browse → book → pay via Connect)
- Basic student personal page (notes + photos)
- Email notifications (Resend): confirmations, reminders, cancellations
- Admin dashboard (users, pros, subscriptions)

### Phase 2 — Enhanced Coaching
- Video uploads on student pages
- Drill assignments with media
- Lesson summaries auto-linked to student page
- Lesson packages (bundles at discount)
- Student progress tracking / history view

### Deployment & Preview Setup
- Domain **golflessons.be** purchased via Vercel
- **Production**: `main` branch → golflessons.be
- **Preview**: each PR gets a preview URL (Vercel default)
- **Pre-launch**: Vercel Deployment Protection (password) on production to keep the site private until launch
- Staging branch (optional): `staging` → staging.golflessons.be with same password protection

### Phase 3 — Growth
- Pro public profiles with reviews/ratings
- SEO-optimized pro directory
- SMS reminders
- Calendar sync (Google Calendar / ICS)
- Mobile-optimized booking experience
- Platform analytics dashboard
