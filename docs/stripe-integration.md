# Stripe Integration — Design Document

> Concrete implementation plan for Stripe on golflessons.be.
> Complements `design.md` §5.5 and §7 with final pricing decisions and implementation details.

---

## 1. Pricing Decisions (Final)

| Item | Amount | Notes |
|------|--------|-------|
| **Pro subscription — monthly** | €12.50/month | Lower commitment, easy to start |
| **Pro subscription — annual** | €125/year | ~17% discount vs monthly (€150 vs €125) |
| **Free trial** | 14 days | No card required upfront, trial via Stripe `trial_period_days` |
| **Lesson payment commission** | 2.5% of lesson price | Charged as `application_fee_amount` via Connect |
| **Pro payout** | 97.5% of lesson price | Routed to pro's connected Stripe account |
| **Minimum lesson price** | €50 | Enforced in lesson type creation — ensures viable commission (€1.25 min) |

> Stripe's own processing fees (~1.5% + €0.25 for European cards / SEPA) are on top and paid by the platform from the 2.5% commission + subscription revenue. With the €50 minimum lesson price, the platform always nets a meaningful fee after Stripe costs.

---

## 2. Stripe Products Overview

We need **two separate Stripe product types**:

### 2.1 Pro Subscription (Direct to Platform)

Standard Stripe Billing — charges go to **our platform Stripe account**.

```
Stripe Product: "Golf Pro Subscription"
├── Price: €12.50/month (recurring, EUR)
└── Price: €125.00/year  (recurring, EUR)
```

- Created via Stripe Dashboard or seed script, stored as env vars (`STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`)
- Checkout via `stripe.checkout.sessions.create()` with `mode: 'subscription'`
- Self-service management via Stripe Customer Portal

### 2.2 Lesson Payments (Via Stripe Connect)

Destination charges to **pro's connected account** with platform application fee.

```
Student pays €60 for a lesson:
├── Platform keeps: €1.50 (2.5% application fee)
└── Pro receives:   €58.50 (destination charge)
    └── Stripe fees: deducted from pro's €58.50 by Stripe
```

> **Important**: With destination charges, Stripe processing fees are deducted from the destination (pro) by default. We can change this with `on_behalf_of` if we want the platform to absorb Stripe fees. Decision: **pro absorbs Stripe fees** for now — simpler, and pros understand that payment processing has a cost.

---

## 3. Stripe Accounts & Keys

### Platform Entity

The Stripe account belongs to **Annamation bv** (Jan's management company). This is the platform account that:
- Receives pro subscription payments directly
- Collects 2.5% application fees from lesson payments via Connect
- Manages Connect Express accounts for pros

### Environment Variables

```env
# Platform Stripe account (Annamation bv)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Product prices (created in Stripe Dashboard)
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_ANNUAL=price_...

# Connect webhook (separate endpoint for Connect events)
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
```

### Test vs Live

- **Development**: use Stripe test/sandbox keys (`sk_test_...` / `pk_test_...`) — add to Vercel env vars (Development only), then `vercel env pull`
- **Production**: live keys (`sk_live_...` / `pk_live_...`) — set in Vercel dashboard (Production only)
- **Local webhook testing**: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
- **Test Connect accounts**: Stripe test mode allows creating test Express accounts with pre-filled KYC — no real identity verification needed during development

---

## 4. Schema Changes

New columns on existing tables + one new table:

```sql
-- users: link to Stripe customer (for subscription billing)
ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255);

-- pro_profiles: subscription + Connect fields
ALTER TABLE pro_profiles ADD COLUMN subscription_status VARCHAR(20) DEFAULT 'none';
  -- values: none | trialing | active | past_due | cancelled | expired
ALTER TABLE pro_profiles ADD COLUMN stripe_subscription_id VARCHAR(255);
ALTER TABLE pro_profiles ADD COLUMN subscription_plan VARCHAR(20);
  -- values: monthly | annual
ALTER TABLE pro_profiles ADD COLUMN subscription_current_period_end TIMESTAMP;
ALTER TABLE pro_profiles ADD COLUMN subscription_trial_end TIMESTAMP;
ALTER TABLE pro_profiles ADD COLUMN late_cancel_refund_percent INTEGER DEFAULT 0;
  -- 0 = no refund after window, 50 = half refund, 100 = always full refund
ALTER TABLE pro_profiles ADD COLUMN stripe_connect_account_id VARCHAR(255);
ALTER TABLE pro_profiles ADD COLUMN stripe_connect_onboarded BOOLEAN DEFAULT FALSE;
ALTER TABLE pro_profiles ADD COLUMN stripe_connect_charges_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE pro_profiles ADD COLUMN stripe_connect_payouts_enabled BOOLEAN DEFAULT FALSE;

-- lesson_bookings: payment tracking
ALTER TABLE lesson_bookings ADD COLUMN price_cents INTEGER;
ALTER TABLE lesson_bookings ADD COLUMN currency VARCHAR(3) DEFAULT 'eur';
ALTER TABLE lesson_bookings ADD COLUMN payment_status VARCHAR(20) DEFAULT 'pending';
  -- values: pending | paid | refunded | failed
ALTER TABLE lesson_bookings ADD COLUMN stripe_payment_intent_id VARCHAR(255);
ALTER TABLE lesson_bookings ADD COLUMN stripe_checkout_session_id VARCHAR(255);
ALTER TABLE lesson_bookings ADD COLUMN platform_fee_cents INTEGER;
ALTER TABLE lesson_bookings ADD COLUMN paid_at TIMESTAMP;
ALTER TABLE lesson_bookings ADD COLUMN refunded_at TIMESTAMP;
```

New table for payment event audit trail:

```sql
CREATE TABLE stripe_events (
  id SERIAL PRIMARY KEY,
  stripe_event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  related_user_id INTEGER REFERENCES users(id),
  related_booking_id INTEGER REFERENCES lesson_bookings(id),
  payload JSONB NOT NULL,
  processed_at TIMESTAMP DEFAULT NOW()
);
```

---

## 5. Flow 1 — Pro Subscription

### 5.1 Registration → Trial → Checkout

```
Pro registers (email + password + profile basics)
  → Account created with subscription_status = 'none'
  → Redirect to subscription page showing monthly/annual toggle
  → Pro picks plan → POST /api/stripe/checkout-subscription
  → Server creates Stripe Customer + Checkout Session with trial_period_days: 14
  → Redirect to Stripe Checkout (collects payment method, no charge yet)
  → Success → subscription_status = 'trialing', redirect to /pro/dashboard
  → Trial ends after 14 days → first charge automatically
  → Cancel during trial → no charge, subscription_status = 'cancelled'
```

### 5.2 Server: Create Checkout Session

```typescript
// POST /api/stripe/checkout-subscription
const session = await stripe.checkout.sessions.create({
  customer: stripeCustomerId, // created on registration or lazily
  mode: 'subscription',
  line_items: [{
    price: plan === 'annual' ? STRIPE_PRICE_ANNUAL : STRIPE_PRICE_MONTHLY,
    quantity: 1,
  }],
  subscription_data: {
    trial_period_days: 14,
    metadata: {
      userId: String(userId),
      proProfileId: String(proProfileId),
    },
  },
  success_url: `${BASE_URL}/pro/dashboard?subscription=success`,
  cancel_url: `${BASE_URL}/pro/subscribe?cancelled=true`,
  metadata: {
    userId: String(userId),
    proProfileId: String(proProfileId),
  },
  // Belgian-friendly payment methods
  payment_method_types: ['card', 'bancontact', 'sepa_debit'],
  locale: userLocale, // 'nl', 'fr', or 'en'
});
```

### 5.3 Webhook: Subscription Lifecycle

```
checkout.session.completed (mode=subscription)
  → Set subscription_status = 'trialing' (or 'active' if no trial)
  → Store stripe_subscription_id, subscription_plan, trial_end, current_period_end
  → Send welcome email with trial info ("Your 14-day free trial has started")

customer.subscription.trial_will_end (3 days before)
  → Send reminder email: "Your trial ends in 3 days, you'll be charged €X"

invoice.paid
  → Renew: update current_period_end
  → Send receipt email

invoice.payment_failed
  → Set subscription_status = 'past_due'
  → Send "update payment method" email
  → After X retries Stripe cancels automatically

customer.subscription.updated
  → Sync status, plan, period_end
  → Handle plan changes (monthly ↔ annual)

customer.subscription.deleted
  → Set subscription_status = 'cancelled'
  → Grace period: keep pro access for remainder of paid period
  → After period_end: set subscription_status = 'expired', unpublish profile
```

### 5.4 Customer Portal

For self-service subscription management (change plan, update payment method, cancel):

```typescript
const portalSession = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,
  return_url: `${BASE_URL}/pro/settings`,
});
// Redirect to portalSession.url
```

Configure in Stripe Dashboard:
- Allow plan switching (monthly ↔ annual)
- Allow cancellation (with optional cancellation reason survey)
- Allow payment method update
- Branding: golflessons.be logo + green color scheme

### 5.5 Access Control

```
subscription_status in ('trialing', 'active', 'past_due') → full pro access
subscription_status = 'cancelled' → read-only until period_end, then expired
subscription_status in ('none', 'expired') → redirect to /pro/subscribe
```

- A trialing pro has **full access** — same as active. They can set up their profile, configure availability, onboard to Connect, and start receiving bookings during the trial.
- A pro with `past_due` keeps access — Stripe retries payment automatically for ~4 weeks.

---

## 6. Flow 2 — Stripe Connect (Lesson Payments)

### 6.1 Pro Onboards to Connect

Happens after subscription is active — pro needs a connected account to receive lesson payments.

```
Pro goes to /pro/settings → "Set up payments" section
  → POST /api/stripe/connect-onboarding
  → Server creates Express account + generates Account Link
  → Pro redirected to Stripe-hosted onboarding
  → Stripe collects: ID verification, Belgian IBAN, business info, ToS
  → Pro returns to /pro/settings?connect=success
  → Webhook: account.updated → update connect flags
```

### 6.2 Server: Create Connect Account

```typescript
// POST /api/stripe/connect-onboarding
const account = await stripe.accounts.create({
  type: 'express',
  country: 'BE',
  email: proEmail,
  capabilities: {
    card_payments: { requested: true },
    bancontact_payments: { requested: true },
    transfers: { requested: true },
  },
  business_type: 'individual',
  metadata: {
    userId: String(userId),
    proProfileId: String(proProfileId),
  },
});

// Store account.id → pro_profiles.stripe_connect_account_id

const accountLink = await stripe.accountLinks.create({
  account: account.id,
  refresh_url: `${BASE_URL}/pro/settings?connect=refresh`,
  return_url: `${BASE_URL}/pro/settings?connect=return`,
  type: 'account_onboarding',
});

// Redirect to accountLink.url
```

### 6.3 Student Books & Pays

```
Student selects lesson type + slot → booking summary page
  → "Pay €XX" button → POST /api/stripe/checkout-lesson
  → Server creates Checkout Session (destination charge to pro)
  → Redirect to Stripe Checkout
  → Success → booking confirmed, emails sent
  → Cancel  → booking not created (or created as 'pending', expires)
```

### 6.4 Server: Lesson Checkout Session

```typescript
// POST /api/stripe/checkout-lesson
const priceCents = lessonType.priceCents; // e.g., 6000 for €60
const platformFeeCents = Math.round(priceCents * 0.025); // 2.5% = 150

const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{
    price_data: {
      currency: 'eur',
      product_data: {
        name: `${lessonType.name} — ${proDisplayName}`,
        description: `${date} ${startTime}–${endTime} at ${locationName}`,
      },
      unit_amount: priceCents,
    },
    quantity: 1,
  }],
  payment_intent_data: {
    application_fee_amount: platformFeeCents,
    transfer_data: {
      destination: proConnectAccountId,
    },
  },
  success_url: `${BASE_URL}/student/bookings?payment=success&booking={CHECKOUT_SESSION_ID}`,
  cancel_url: `${BASE_URL}/student/book/${proSlug}?payment=cancelled`,
  metadata: {
    bookingId: String(bookingId),
    studentId: String(studentId),
    proProfileId: String(proProfileId),
  },
  payment_method_types: ['card', 'bancontact'],
  locale: studentLocale,
});
```

### 6.5 Webhook: Lesson Payment

```
checkout.session.completed (mode=payment)
  → Update booking: payment_status = 'paid', paid_at = now
  → Store stripe_payment_intent_id, platform_fee_cents
  → Send confirmation emails to student + pro
  → Create notification for pro

payment_intent.payment_failed
  → Update booking: payment_status = 'failed'
  → Notify student to retry
```

### 6.6 Refunds (Cancellation)

```typescript
// When a booking is cancelled within the cancellation window
const refund = await stripe.refunds.create({
  payment_intent: booking.stripePaymentIntentId,
  reverse_transfer: true,         // Pull money back from pro
  refund_application_fee: true,   // Refund our 2.5% too
});
```

### Cancellation & Refund Policy (Per-Pro Configurable)

Each pro configures their cancellation policy in their profile settings. Stored on `pro_profiles`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `cancellation_hours` | integer | 24 | Hours before lesson start for free cancellation |
| `late_cancel_refund_percent` | integer | 0 | Refund % if cancelled after window (0 = no refund, 50 = half) |

Refund rules:
- **Student cancels within window** (`cancellation_hours` before start) → **full refund** (100%)
- **Student cancels after window** → refund at `late_cancel_refund_percent` (default: 0% = no refund)
- **Pro cancels** → **always full refund**, regardless of timing
- **No-show** → no refund (treated as late cancellation)

```typescript
// Partial refund example: pro set late_cancel_refund_percent = 50
// Original lesson: €80 → student gets €40 back
const refundAmount = Math.round(booking.priceCents * (pro.lateCancelRefundPercent / 100));
const refund = await stripe.refunds.create({
  payment_intent: booking.stripePaymentIntentId,
  amount: refundAmount,                // partial amount in cents
  reverse_transfer: true,
  refund_application_fee: true,
});
```

Students see the pro's cancellation policy clearly during booking (e.g., "Free cancellation up to 24h before. After that: no refund.").

---

## 7. Webhook Architecture

Single webhook endpoint handling both platform and Connect events:

```
/api/webhooks/stripe
  → Verify signature (STRIPE_WEBHOOK_SECRET)
  → Check stripe_events table for idempotency (skip if event_id exists)
  → Route by event.type:
      checkout.session.completed → handleCheckoutComplete()
      invoice.paid              → handleInvoicePaid()
      invoice.payment_failed    → handleInvoicePaymentFailed()
      customer.subscription.*   → handleSubscriptionChange()
      account.updated           → handleConnectAccountUpdate()
      payment_intent.succeeded  → handlePaymentSuccess()
      charge.refunded           → handleRefund()
  → Insert into stripe_events for audit trail
  → Return 200

/api/webhooks/stripe-connect  (if separate endpoint needed)
  → Verify signature (STRIPE_CONNECT_WEBHOOK_SECRET)
  → Handle Connect-specific events
```

### Idempotency

Every webhook handler checks `stripe_events` before processing. Stripe may send the same event multiple times — we store the `event.id` and skip duplicates.

---

## 8. Pro Dashboard: Earnings

Pro needs visibility into their earnings:

```
/pro/earnings
├── Current period overview
│   ├── Total lessons this month: 24
│   ├── Revenue (before Stripe fees): €1,440
│   └── Next payout: ~€1,380 (estimate after Stripe fees)
├── Recent transactions (from Stripe API or cached)
└── Manage payouts → link to Stripe Express Dashboard
```

Access the Express Dashboard login link:

```typescript
const loginLink = await stripe.accounts.createLoginLink(connectAccountId);
// loginLink.url → opens Stripe Express dashboard
```

We do NOT build a full earnings tracking system — let Stripe be the source of truth. We show summary data and link out to Stripe for details.

---

## 9. Billing & Payment Pages

### 9.1 Pro Pages

#### `/pro/subscribe` — Plan Selection (Pre-Subscription)
- Monthly (€12.50/mo) vs Annual (€125/yr) toggle
- Feature comparison (both plans identical, annual saves 17%)
- "Start 14-day free trial" CTA → Stripe Checkout
- Shown when `subscription_status` is `none` or `expired`

#### `/pro/billing` — Subscription & Billing Management
- **Current plan**: monthly/annual, status badge (trialing/active/past_due)
- **Trial info** (if trialing): "Trial ends [date] — you'll be charged €X"
- **Next payment**: date + amount
- **Payment method**: last 4 digits, expiry — "Update" link → Stripe Customer Portal
- **Invoice history**: table of past invoices with PDF download links (via Stripe API)
- **Switch plan**: monthly ↔ annual toggle with prorated preview
- **Cancel subscription**: warning about access loss → Stripe Customer Portal cancellation flow
- All management actions route through Stripe Customer Portal — we don't build custom payment forms

#### `/pro/earnings` — Lesson Revenue
- **This month**: total lessons, gross revenue, net (after platform fee + estimated Stripe fees)
- **Payout status**: next scheduled payout date + amount (from Stripe Balance API)
- **Transaction list**: recent lesson payments — student name, date, amount, status
- **Connect status**: onboarded badge, charges/payouts enabled indicators
- **"View full dashboard"** → Stripe Express Dashboard login link
- **Cancellation policy settings**: edit `cancellation_hours` + `late_cancel_refund_percent`

### 9.2 Student Pages

#### `/student/payments` — Payment History & Methods
- **Upcoming payments**: lessons booked but not yet occurred (with cancellation option + refund info)
- **Payment history**: table of past lesson payments — pro name, date, amount, receipt link
- **Payment methods**: saved cards/Bancontact from Stripe (via Customer Portal or Checkout saved methods)
- **Refunds**: any refunds with status + reason
- Students don't have a Stripe subscription — this page is simpler than the pro billing page

### 9.3 Admin Pages

#### `/admin/payments` — Payment Dashboard (Overview)
- **Revenue summary cards**:
  - Monthly recurring revenue (MRR) from pro subscriptions
  - Total lesson payment volume this month
  - Platform commission earned this month (2.5% of lesson volume)
  - Active subscribers: total, trialing, past_due
- **Revenue chart**: monthly trend (subscriptions + commissions) — last 12 months
- **Quick links** to sub-pages below

#### `/admin/payments/subscriptions` — Subscription Management
- **Table of all pro subscriptions**: pro name, plan, status, trial end, current period end, MRR contribution
- **Filters**: by status (trialing, active, past_due, cancelled, expired)
- **Actions per subscription**:
  - View in Stripe Dashboard (link out)
  - Cancel / pause (via Stripe API)
  - Extend trial (via Stripe API)
  - Send payment reminder email
- **Churn metrics**: cancellation rate, average subscription lifetime

#### `/admin/payments/lessons` — Lesson Payment Management
- **Table of all lesson payments**: student, pro, date, amount, platform fee, payment status
- **Filters**: by status (paid, refunded, failed), by pro, by date range
- **Actions per payment**:
  - View in Stripe Dashboard (link out)
  - Issue full/partial refund
  - View booking details
- **Totals row**: sum of amounts, sum of platform fees

#### `/admin/payments/connect` — Connect Account Overview
- **Table of all connected pro accounts**: pro name, account status, charges enabled, payouts enabled, onboarded date
- **Flags**: pros with incomplete onboarding, disabled payouts, or pending verification
- **Actions**:
  - View account in Stripe Dashboard
  - Generate new onboarding link (for pros stuck in onboarding)
  - Disable connect account (emergency)

#### `/admin/payments/payouts` — Payout Monitoring
- **Recent payouts to pros**: pro name, amount, status, arrival date
- **Failed payouts**: flagged for attention
- **Platform balance**: available balance on the platform Stripe account

---

## 10. Implementation Order

### Step 1: Foundation
- [ ] `pnpm add stripe @stripe/stripe-js`
- [ ] Create `src/lib/stripe.ts` — server-side Stripe client
- [ ] Create `src/lib/stripe-client.ts` — client-side (publishable key only)
- [ ] Add env vars to Vercel (test keys first)
- [ ] Schema migration: add Stripe columns to users, pro_profiles, lesson_bookings
- [ ] Create stripe_events table

### Step 2: Pro Subscription + Billing
- [ ] Create Stripe Products + Prices in Dashboard (test mode)
- [ ] `POST /api/stripe/checkout-subscription` — Checkout Session with 14-day trial
- [ ] `/pro/subscribe` page — plan picker (monthly/annual toggle) with trial messaging
- [ ] `POST /api/webhooks/stripe` — handle subscription + trial webhooks
- [ ] Subscription status checks in pro middleware (trialing = full access)
- [ ] Stripe Customer Portal configuration (plan switch, cancel, payment update)
- [ ] `/pro/billing` page — plan info, trial countdown, invoice history, portal links

### Step 3: Stripe Connect + Earnings
- [ ] `POST /api/stripe/connect-onboarding` — create Express account + link
- [ ] Connect onboarding UI in `/pro/billing` or `/pro/settings`
- [ ] `account.updated` webhook handler
- [ ] `/pro/earnings` page — revenue summary, transaction list, Express Dashboard link
- [ ] Cancellation policy settings UI (cancellation_hours + late_cancel_refund_percent)

### Step 4: Lesson Payments + Student Billing
- [ ] `POST /api/stripe/checkout-lesson` — destination charge with 2.5% fee
- [ ] Integrate checkout into booking flow (enforce €50 minimum)
- [ ] `checkout.session.completed` handler for lesson payments
- [ ] Refund logic (full within window, configurable partial after window, full on pro cancel)
- [ ] `/student/payments` page — payment history, upcoming, refunds

### Step 5: Admin Payment Management
- [ ] `/admin/payments` — revenue dashboard (MRR, commission, volume)
- [ ] `/admin/payments/subscriptions` — subscription table with filters + actions
- [ ] `/admin/payments/lessons` — lesson payment table with refund capability
- [ ] `/admin/payments/connect` — connected account overview + troubleshooting
- [ ] `/admin/payments/payouts` — payout monitoring + failed payout alerts

### Step 6: Polish
- [ ] Email notifications for all payment events (Resend)
- [ ] Trial-ending reminder emails (3 days before)
- [ ] Handle edge cases: subscription expired mid-booking, Connect deauthorization
- [ ] Test with Stripe test clocks (subscription + trial lifecycle simulation)
- [ ] Go live: switch to live keys, verify webhook endpoints

---

## 10. Belgian-Specific Considerations

- **Payment methods**: Card + Bancontact (dominant in Belgium) + SEPA Direct Debit
- **Currency**: EUR only
- **VAT**: Platform is Belgian entity — Stripe Tax or manual VAT on subscription invoices. Pro lesson payments: pro is responsible for their own VAT declarations. Platform commission is a service fee — we invoice with VAT.
- **KYC**: Stripe Express handles Belgian identity verification and IBAN collection
- **Payouts**: SEPA to Belgian bank accounts, standard Stripe schedule (T+7 initially, then T+2)
- **Language**: Stripe Checkout supports `nl`, `fr`, `en` — pass user's locale

---

## 11. Resolved Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Free trial for pros? | **Yes — 14 days**, via Stripe `trial_period_days`. Full access during trial. |
| 2 | Minimum lesson price? | **€50 minimum**, enforced in lesson type creation. |
| 3 | Cancellation refund policy? | **Per-pro configurable**: free cancellation within `cancellation_hours`, then `late_cancel_refund_percent` (0–100%). Pro cancels = always full refund. |

## 12. Remaining Open Questions

1. **Lesson packages?** 5- or 10-lesson bundles at a discount — deferred to Phase 2 but schema should not block it.
2. **Platform absorbs Stripe fees?** Currently pro absorbs processing fees on lesson payments. Could revisit if pros push back.
3. **VAT handling**: Do we use Stripe Tax for automatic VAT on subscription invoices, or handle manually?
