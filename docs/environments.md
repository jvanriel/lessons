# Environment Architecture

> How production, preview, and local development environments are configured for golflessons.be.

---

## 1. Overview

| Layer | Production | Preview | Local Development |
|-------|-----------|---------|-------------------|
| **Domain** | golflessons.be | preview.golflessons.be | localhost:3000 |
| **Git branch** | `main` | `preview` / PR branches | any |
| **Vercel env scope** | Production | Preview | Development |
| **Stripe mode** | Live (`sk_live_`) | Test (`sk_test_`) | Test (`sk_test_`) |
| **Database** | Neon main branch (`POSTGRES_URL`) | Neon preview branch (`POSTGRES_URL_PREVIEW`) | Neon preview branch (`POSTGRES_URL_PREVIEW`) |
| **Blob store** | lessons-blob (no prefix) | lessons-blob (`_preview/` prefix) | lessons-blob (`_preview/` prefix) |
| **Webhook endpoint** | golflessons.be/api/webhooks/stripe | preview.golflessons.be/api/webhooks/stripe | localhost via Stripe CLI |

---

## 2. Stripe: Test vs Live

Stripe has a fully isolated **test mode** with its own set of API keys. Test mode:
- Uses test card numbers (e.g., `4242 4242 4242 4242`)
- Creates test Connect accounts with pre-filled KYC (no real identity verification)
- Processes test webhooks
- Has no access to live data and vice versa

### Env Vars (Vercel-scoped)

```
STRIPE_SECRET_KEY
  Production:  sk_live_...
  Preview:     sk_test_...
  Development: sk_test_...

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  Production:  pk_live_...
  Preview:     pk_test_...
  Development: pk_test_...

STRIPE_PRICE_MONTHLY
  Production:  price_live_...  (created in live mode dashboard)
  Preview:     price_test_...  (created in test mode dashboard)
  Development: price_test_...

STRIPE_PRICE_ANNUAL
  Production:  price_live_...
  Preview:     price_test_...
  Development: price_test_...

STRIPE_WEBHOOK_SECRET
  Production:  whsec_... (live endpoint)
  Preview:     whsec_... (test endpoint)
  Development: whsec_... (from `stripe listen`)

STRIPE_CONNECT_WEBHOOK_SECRET
  Production:  whsec_... (live Connect endpoint)
  Preview:     whsec_... (test Connect endpoint)
  Development: whsec_... (from `stripe listen`)
```

### Stripe Products

Products and prices must exist in **both** test and live mode:
- **Test mode**: Create "Golf Pro Subscription" with €12.50/month and €125/year prices in Stripe test dashboard
- **Live mode**: Create the same product with the same prices in Stripe live dashboard
- Store the respective price IDs as environment-scoped env vars

### Local Webhook Testing

```bash
# Install Stripe CLI: brew install stripe/stripe-cli/stripe
# Login: stripe login

# Forward test webhooks to local dev server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# The CLI prints a webhook signing secret (whsec_...) — use as STRIPE_WEBHOOK_SECRET in .env.local
```

---

## 3. Database: Neon Branching

### Why branch?

A Neon branch is a **copy-on-write fork** of the production database:
- Starts with the same schema (and optionally data) as production
- Writes to the branch don't affect production
- Free/cheap — only pays for storage delta
- Can be reset to re-fork from production at any time

### Current setup

Neon project: **winter-frog-90801725** (neon-teal-flame), provisioned via Vercel Marketplace (Free plan).

| Branch | ID | Purpose |
|--------|-----|---------|
| `main` | (default) | Production database |
| `preview` | `br-old-star-am6ipdvj` | Preview/development database |

### How DB routing works

The Neon-Vercel integration manages `POSTGRES_URL` for "All Environments" (points to main branch). Since the integration-managed vars can't be scoped per environment on the free plan, we use **separate env var names** for the preview branch with code-level routing:

```
POSTGRES_URL                        # Neon integration (main branch, all envs)
POSTGRES_URL_PREVIEW                # Preview branch pooled (added manually)
POSTGRES_URL_PREVIEW_NON_POOLING    # Preview branch direct (added manually)
```

In `src/lib/db/index.ts`:
```typescript
const isProduction = process.env.VERCEL_ENV === "production";
const databaseUrl = !isProduction && process.env.POSTGRES_URL_PREVIEW
  ? process.env.POSTGRES_URL_PREVIEW
  : process.env.POSTGRES_URL!;
```

**Safety**: even if `POSTGRES_URL_PREVIEW` exists in the production env, it's ignored when `VERCEL_ENV === 'production'`. Production always uses the main branch DB.

In `drizzle.config.ts` (runs locally/CI only):
```typescript
url: process.env.POSTGRES_URL_PREVIEW_NON_POOLING
  || process.env.POSTGRES_URL_NON_POOLING
  || process.env.POSTGRES_URL!
```

### Future: Neon paid plan

When upgrading to Neon paid (~$19/month), the Vercel integration can automatically create a branch per preview deployment and set the correct `POSTGRES_URL` per environment. At that point, remove `POSTGRES_URL_PREVIEW*` vars and the code routing — it becomes zero-config.

### Running Migrations

```bash
# Push schema to preview branch (uses POSTGRES_URL_PREVIEW_NON_POOLING from .env.local)
source <(grep -v '^#' .env.local | sed 's/^/export /') && pnpm drizzle-kit push
```

### Resetting the Preview Branch

When the preview branch gets messy with test data:

1. Go to Neon Console → Branches → delete `preview`
2. Create new branch named `preview` from `main`
3. Update `POSTGRES_URL_PREVIEW` and `POSTGRES_URL_PREVIEW_NON_POOLING` with new connection strings
4. Re-seed: `pnpm db:seed`

---

## 4. Blob Store: Shared with Path Prefix

We use a **single Vercel Blob store** (`lessons-blob`) for all environments. Blobs are immutable and content-addressed, so preview uploads can't overwrite production content.

To keep things organized and allow cleanup, preview/dev uploads use a `_preview/` path prefix.

### Path Convention

```
Production:  pros/{proId}/photo.jpg
Preview/Dev: _preview/pros/{proId}/photo.jpg
```

### Cleanup

Periodically clean up test uploads:

```bash
# List preview blobs (via Vercel Blob API or dashboard)
# Delete _preview/* blobs to free storage
```

The `BLOB_READ_WRITE_TOKEN` is the same across all environments (same store). If you need full isolation later, create a second blob store for preview.

---

## 5. Preview Domain

### Setup in Vercel

1. In Vercel project settings → Domains
2. Add `preview.golflessons.be`
3. Set it as a **preview domain** (not production)
4. Vercel automatically routes the latest preview deployment to this domain

Alternatively, each PR gets its own unique preview URL (`lessons-xyz-vercel.app`) — the custom preview domain just gives a stable URL.

### Deployment Protection

- **Production** (golflessons.be): Password-protected until launch (Vercel Deployment Protection)
- **Preview** (preview.golflessons.be): Same password protection, or Vercel Authentication (team-only)

---

## 6. Environment Detection in Code

The app can detect its environment via Vercel's built-in env vars:

```typescript
// VERCEL_ENV is set automatically by Vercel: 'production' | 'preview' | 'development'
// In local dev, it's undefined

export function isProduction(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

export function isPreview(): boolean {
  return process.env.VERCEL_ENV === 'preview';
}

export function isStripeTestMode(): boolean {
  return process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ?? true;
}

// Blob path prefix for non-production environments
export function blobPrefix(): string {
  return isProduction() ? '' : '_preview/';
}
```

### Visual Indicator

In non-production environments, show a banner or badge so testers know they're on preview:

```
┌─────────────────────────────────────────────┐
│ ⚠ PREVIEW MODE — Stripe test, no real money │
└─────────────────────────────────────────────┘
```

---

## 7. Complete Env Var Checklist

All env vars needed, grouped by scope:

### All Environments (Production + Preview + Development)

```
AUTH_SECRET                     # JWT signing secret
BLOB_READ_WRITE_TOKEN          # Vercel Blob (shared store)
RESEND_API_KEY                 # Email sending
NEXT_PUBLIC_BASE_URL           # golflessons.be or preview.golflessons.be
```

### Neon (managed by integration + manual)

```
POSTGRES_URL                         # Neon integration — main branch, all envs
POSTGRES_URL_NON_POOLING             # Neon integration — main branch direct, all envs
POSTGRES_URL_PREVIEW                 # Manual — preview branch pooled (code-gated: ignored in production)
POSTGRES_URL_PREVIEW_NON_POOLING     # Manual — preview branch direct (for drizzle-kit)
```

### Stripe (scoped per environment)

```
STRIPE_SECRET_KEY                    # Production: sk_live_  |  Preview: sk_test_
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY   # Production: pk_live_  |  Preview: pk_test_
STRIPE_PRICE_MONTHLY                 # Production: price_live_  |  Preview: price_test_
STRIPE_PRICE_ANNUAL                  # Production: price_live_  |  Preview: price_test_
STRIPE_WEBHOOK_SECRET                # Per-endpoint webhook secret
STRIPE_CONNECT_WEBHOOK_SECRET        # Per-endpoint Connect webhook secret
```

---

## 8. Testing Checklist

Before going live, verify in preview environment:

- [ ] Pro registration → Stripe Checkout with test card (4242...) → subscription active
- [ ] Pro subscription trial (14 days) → trial ending email → first charge
- [ ] Pro Connect onboarding (test Express account) → charges enabled
- [ ] Student books lesson → payment via test card → pro receives (in test dashboard)
- [ ] Student cancels within window → full refund
- [ ] Student cancels after window → partial/no refund per pro config
- [ ] Pro cancels lesson → always full refund
- [ ] Subscription plan switch (monthly ↔ annual)
- [ ] Subscription cancellation → grace period → expired
- [ ] Webhook replay: `stripe trigger checkout.session.completed`
- [ ] All emails render correctly (booking confirmation, payment receipt, trial ending)
