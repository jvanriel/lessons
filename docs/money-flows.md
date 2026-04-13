# Money Flows

Reference for every place cash, card, or invoice-item moves through the
platform. Covers both the pro side (subscription + cash-only commission)
and the student side (lesson payments + refunds).

Last updated: 2026-04-13 — reflects Sprint B payment flow shipped this
sprint. Sprint B commits: `6e4ac54`, `07ad6e2`, `fd9bc90`, `adce194`.

## Actors and Stripe objects

- **Platform Stripe account** — single direct account. Stripe Connect was
  rejected (see `memory/project_payments_model.md`); everything flows
  through one account and pros get paid out manually via SEPA.
- **Pro Stripe customer** (`users.stripeCustomerId`) — created on first
  subscription attempt from `/api/stripe/setup-subscription`. Holds the
  pro's subscription, default payment method, and any cash-only commission
  invoice items.
- **Student Stripe customer** (`users.stripeCustomerId`) — created from
  `/api/member/setup-payment` when the student first saves a card. Holds
  the card used for off-session lesson charges.
- **Platform subscription prices** — two Stripe prices (monthly + annual),
  IDs read from env and validated in `/api/health` via
  `stripe.prices.retrieve()`.

## Config knobs

| Knob | Location | Default |
|---|---|---|
| Monthly subscription price | `NEXT_PUBLIC_PRO_PRICE_MONTHLY` env, surfaced via `src/lib/pricing.ts` | — |
| Annual subscription price | `NEXT_PUBLIC_PRO_PRICE_ANNUAL` env, surfaced via `src/lib/pricing.ts` | — |
| Commission % | `NEXT_PUBLIC_PLATFORM_FEE_PERCENT` env, read in `src/lib/stripe.ts` | `2.5` |
| Free trial length | `TRIAL_PERIOD_DAYS` constant in `src/lib/stripe.ts` | `14` |
| Minimum lesson price | `MIN_LESSON_PRICE_CENTS` in `src/lib/stripe.ts` | `5000` (€50) |

Changing the commission percent is a redeploy of the env var — no code
change. `calculatePlatformFee(priceCents)` rounds to the nearest cent.

## Flow 1 — Pro subscription (pro → platform)

**Trigger:** `/pro/subscribe` collects a payment method via SetupIntent
(Bancontact + card), then `POST /api/stripe/confirm-subscription`.

**Steps:**

1. Lazy-create `stripe.customers.create(...)` if the pro has no
   `users.stripeCustomerId` yet. Persist the ID.
2. `stripe.paymentMethods.attach` the SetupIntent PM to the customer and
   `stripe.customers.update` to make it the default invoice PM.
3. `stripe.subscriptions.create({ customer, items: [{ price }],
   trial_period_days: 14, metadata: { userId, proProfileId, plan } })`.
4. Mirror `stripeSubscriptionId`, `subscriptionPlan`,
   `subscriptionStatus="trialing"`, `subscriptionCurrentPeriodEnd`, and
   `subscriptionTrialEnd` onto `pro_profiles` immediately.
5. Webhook `customer.subscription.*` reconciles state transitions
   (trialing → active → past_due → cancelled) and updates the same
   columns. Trial-ending and payment-failed emails fire from the webhook.

**Money direction:** pro → platform, recurring, with a 14-day trial. No
revenue share — the platform keeps 100% of the subscription fee.

**Where it's displayed:** `/pro/billing` shows the plan, status badge,
trial countdown, current period end, "Manage" button that opens the
Stripe Customer Portal.

## Flow 2 — Student saves a card (setup, no charge)

**Trigger:** first visit to `/member/book/[slug]` checkout. `POST
/api/member/setup-payment` creates a SetupIntent.

**Steps:**

1. Lazy-create `stripe.customers.create` if the student has no
   `users.stripeCustomerId`. Persist the ID.
2. SetupIntent collects a card (or Bancontact) off-page. On success the
   PM is attached to the customer and becomes the default for off-session
   charges on the next booking.

**Money direction:** none — this is a SetupIntent, no charge. Sets up the
payment method for Flow 3.

## Flow 3 — Online lesson booking (student → platform → pro via SEPA)

**Trigger:** student completes the booking wizard on
`/member/book/[slug]`. Server action `createBooking` runs in
`src/app/(member)/member/book/actions.ts`.

**Steps:**

1. **Price resolution.** Read `pro_profiles.lesson_pricing` (jsonb,
   `{ "30": 3500, "60": 6500 }` in cents). Compute
   `priceCents = lessonPricing[duration] * participantCount`. If the pro
   hasn't priced the selected duration and is not cash-only, reject with
   `bookErr.noPriceForDuration`.
2. **Commission computed.** `platformFeeCents =
   calculatePlatformFee(priceCents)`. Recorded on the booking row as a
   historical snapshot — the % can change later without touching old rows.
3. **Booking row inserted first** with `paymentStatus="pending"`. The slot
   is reserved immediately so a payment failure doesn't race another
   student for the same timeslot.
4. **Off-session PaymentIntent.**
   ```ts
   stripe.paymentIntents.create({
     amount: priceCents, currency: "eur",
     customer: student.stripeCustomerId,
     payment_method: savedPm, off_session: true, confirm: true,
     description: `Lesson ${date} ${startTime}–${endTime}`,
     metadata: { bookingId, proProfileId, userId },
   }, { idempotencyKey: `booking-${booking.id}-v1` })
   ```
5. **Status mapping by intent result:**
   - `succeeded` → `paymentStatus="paid"`, `paidAt` set,
     `stripePaymentIntentId` stored.
   - `requires_action` (3DS / SCA) → `paymentStatus="requires_action"`.
     The student is expected to complete the challenge from
     `/member/bookings/[id]` — retry UI is a known follow-up (see
     `docs/gaps.md`).
   - Any exception (card declined, network, no PM on file) →
     `paymentStatus="failed"`, Sentry capture with `area="booking-payment"`.
     The booking row is retained so the slot stays reserved and the
     student can retry.
6. **Webhook reconciliation** (`/api/webhooks/stripe`):
   - `payment_intent.succeeded` → idempotent flip to `paid` + `paidAt`.
   - `payment_intent.payment_failed` → flip to `failed`, fire
     `buildPaymentFailedEmail` to the student.
7. **Confirmation email** to the student via `sendEmail` — the body shows
   an "Amount charged" row formatted with `Intl.NumberFormat` in the
   recipient's locale (en-GB / nl-BE / fr-BE currency).

**Money direction:** student → platform. The full lesson price sits on
the platform account. The pro is paid out manually via SEPA on a
recurring admin batch (see Flow 6).

**Idempotency:** `booking-{id}-v1` on the PaymentIntent so retries don't
double-charge.

## Flow 4 — Cash-only booking (student ↔ pro direct, platform claims commission)

A pro can set `pro_profiles.allow_booking_without_payment = true`. This
is for pros who take cash at the range and don't want the platform
holding their lesson revenue. The platform still gets paid its commission
— just via a different path.

**Trigger:** same `createBooking` action. Path forks on `cashOnly`:

**Steps:**

1. **Price + commission** computed the same way as Flow 3 (if pricing is
   configured — cash-only bookings are still allowed with `priceCents =
   null` and zero commission if the pro hasn't entered prices).
2. **Booking row** inserted with `paymentStatus="manual"`.
3. **No PaymentIntent.** The student never gets charged via Stripe.
   `stripePaymentIntentId` stays null.
4. **Commission claim — invoice item on the pro's subscription:**
   ```ts
   stripe.invoiceItems.create({
     customer: pro.stripeCustomerId,
     amount: platformFeeCents,
     currency: "eur",
     description: `Commission — booking #${id} (${date} ${startTime})`,
     metadata: { bookingId, type: "cash_commission" },
   }, { idempotencyKey: `commission-${booking.id}-v1` })
   ```
   The returned item ID is persisted on
   `lesson_bookings.stripe_invoice_item_id`. The item rolls onto the
   pro's next monthly/annual subscription invoice automatically — no
   separate charge, no new pro-side UX.
5. **Failure handling.** `invoiceItems.create` failures are captured to
   Sentry with `tags.area="cash-commission"` and swallowed. The booking
   still goes through — the commission will need manual reconciliation
   from `/admin`. Known edge cases (see `docs/gaps.md`):
   - Pro without an active subscription — item sits pending on the
     customer until the next invoice is generated.
   - No `stripeCustomerId` on the pro at all — throws before the
     `invoiceItems.create` call, captured to Sentry.
6. **Confirmation email.** Template renders "Payable on site" instead of
   "Amount charged", translated in EN/NL/FR via `amountOnSite` in
   `BOOKING_STUDENT_STRINGS`.

**Money direction:**
- Student → pro: off-platform, cash, untracked.
- Pro → platform: our commission, added to their next subscription
  invoice so it settles on the next scheduled Stripe charge.

**Visibility to the pro:** `/pro/billing` has a "Pending cash-only
commission" card (amber) showing the running total, booking count, and
ten most-recent line items. It only renders when there's something
pending.

## Flow 5 — Cancel within window (refund or commission reversal)

**Trigger:** student clicks Cancel on `/member/bookings`. Server action
`cancelBooking` in `src/app/(member)/member/bookings/actions.ts`.

**Guard:** `checkCancellationAllowed` uses the pro's `cancellationHours`.
Outside the window: hard block with a locale-aware deadline error. No
refund, no reversal, booking stays confirmed.

**Inside the window — two branches depending on how the booking was
paid:**

### 5a — Online booking (`paymentStatus="paid"`, has `stripePaymentIntentId`)

```ts
stripe.refunds.create({
  payment_intent: booking.stripePaymentIntentId,
  metadata: { bookingId, cancelledBy: "student" },
}, { idempotencyKey: `refund-${bookingId}-v1` })
```

On success: `paymentStatus="refunded"`, `refundedAt` set. Full refund
only — no partial refunds in v1.

On failure (network, already-refunded, too old): error logged, booking
still cancels. Needs an admin "mark as manually refunded" fallback,
tracked in `docs/gaps.md`.

### 5b — Cash-only booking (`paymentStatus="manual"`, has `stripeInvoiceItemId`)

```ts
stripe.invoiceItems.del(booking.stripeInvoiceItemId)
```

On success: clear `stripeInvoiceItemId` + `platformFeeCents` on the row
so it doesn't keep showing up in the pending-commission aggregate on
`/pro/billing`.

On failure: most commonly because the invoice item has already been
finalised onto an invoice (monthly/annual cycle fired). Stripe returns
400 "cannot delete finalised item". Today we log + swallow; the pro
needs a manual credit note in the Stripe dashboard. Also tracked in
`docs/gaps.md`.

**Common tail:** booking gets `status="cancelled"`, cancel ICS is
generated and emailed to both parties (EN/NL/FR), pro notification is
created, event logged.

**Idempotency:** `refund-{id}-v1` on refunds. Invoice item deletion is
naturally idempotent (a second delete returns a 404 we currently don't
branch on, but it's a no-op for our state).

## Flow 6 — Pro payout (platform → pro via SEPA, manual)

**Not Stripe Connect.** See `memory/project_payments_model.md` for why
Connect was rejected.

**Data source:** `lesson_bookings` rows with `paymentStatus="paid"`
grouped by pro. `pro_profiles.bankAccountHolder`, `bankIban`, `bankBic`
from the pro's `/pro/billing` bank details form (posted to
`/api/pro/bank-details`).

**Admin surface:** `/admin/payouts` shows per-pro aggregates with CSV
export. The CSV is what the admin uploads to their bank to trigger the
SEPA transfers.

**Settlement marking:** once the SEPA file has been sent, an admin
marks the payouts as settled. (Implementation details in the admin
route — reference only; not in this doc's scope.)

**Money direction:** platform → pro, off-Stripe, SEPA, on a recurring
manual cadence.

**Pro visibility:** `/pro/earnings` shows the running total and recent
lesson payments. Filtered by `paymentStatus="paid"` so cash-only
bookings don't count toward the "platform will pay this out" total —
that money never touches the platform.

## Flow 7 — Webhook-driven state transitions

Single webhook endpoint: `/api/webhooks/stripe`. Validated against
`STRIPE_WEBHOOK_SECRET`. Relevant handlers:

| Event | Action |
|---|---|
| `customer.subscription.created` / `.updated` | Refresh `pro_profiles.subscriptionStatus`, `subscriptionCurrentPeriodEnd`, `subscriptionTrialEnd`, `subscriptionPlan`. |
| `customer.subscription.deleted` | Flip to `cancelled` + clear period end. |
| `customer.subscription.trial_will_end` | Fire trial-ending email to the pro in their locale. |
| `invoice.payment_failed` | Fire payment-failed email to the pro. |
| `payment_intent.succeeded` | Idempotent flip of `lesson_bookings.paymentStatus` to `paid`. |
| `payment_intent.payment_failed` | Flip to `failed` + fire payment-failed email to the student. |

Subscriptions are retrieved with `stripe.subscriptions.retrieve()` when
the event payload doesn't carry the period end directly. A local
`SubscriptionWithPeriod` helper type patches `current_period_end` back
onto the SDK's `Stripe.Subscription` — newer API versions moved that
field onto subscription items, but our account is pre-move.

## Quick reference: booking payment states

```
pending        → inserted, PaymentIntent not yet resolved
paid           → PaymentIntent succeeded (Flow 3)
requires_action → 3DS / SCA outstanding, needs retry UI (gap)
failed         → PaymentIntent declined or errored
refunded       → Cancelled within window, Stripe refund succeeded (Flow 5a)
manual         → Cash-only booking, never charged on-platform (Flow 4)
```

## Quick reference: money flow by scenario

| Scenario | Student pays | Pro receives | Platform takes |
|---|---|---|---|
| Online booking, lesson happens | `priceCents` via Stripe | `priceCents − platformFeeCents` via SEPA batch | `platformFeeCents` immediately |
| Online booking, cancel inside window | Refunded in full | Nothing | Nothing (commission refunded too) |
| Online booking, cancel outside window | Nothing refunded | Full payout via SEPA | Full commission |
| Cash-only booking, lesson happens | Cash to pro | Student cash, off-platform | `platformFeeCents` via invoice item on next sub invoice |
| Cash-only booking, cancel inside window | N/A (no Stripe charge) | N/A | Invoice item deleted — commission waived |
| Pro subscription | — | — | Full subscription fee every cycle (after 14-day trial) |

## Cross-references

- `src/lib/stripe.ts` — fee calculation, trial length, Stripe client.
- `src/lib/pricing.ts` — subscription price env resolution + locale
  formatting.
- `src/app/(member)/member/book/actions.ts` — Flows 3 + 4.
- `src/app/(member)/member/bookings/actions.ts` — Flow 5.
- `src/app/api/stripe/confirm-subscription/route.ts` — Flow 1.
- `src/app/api/webhooks/stripe/route.ts` — Flow 7.
- `src/app/(pro)/pro/billing/` — pro-side display for Flows 1, 4, 6.
- `src/app/(pro)/pro/earnings/` — pro-side display for Flow 6.
- `src/app/(admin)/admin/payouts/` — admin surface for Flow 6.
- `docs/gaps.md` — open follow-ups (retry UI, manual refund fallback,
  cash-only edge cases).
- `memory/project_payments_model.md` — decision record on Direct vs.
  Connect.
