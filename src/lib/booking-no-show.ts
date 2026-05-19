/**
 * No-show flow (task 155).
 *
 * Pre-task-155, a confirmed booking the student didn't turn up for
 * had no first-class representation — the pro either left it as
 * `confirmed` (polluting upcoming-lesson views) or cancelled it
 * (which clears the slot and emits a refund-style credit note).
 * Neither was right.
 *
 * What `markBookingAsNoShow` does:
 *   - Verifies the booking exists, belongs to the calling pro, is
 *     currently `confirmed`, and the lesson start is in the past.
 *   - Flips `status='no_show'` (a new status value alongside
 *     'confirmed' / 'cancelled' — the DB column is varchar, no
 *     migration needed) and sets `cancelledAt=now` so the magic-link
 *     pages that filter on `isNull(cancelledAt)` naturally hide it.
 *   - Branches by payment state:
 *       • paid → just record + send "your payment stays with the pro"
 *         FYI email. Money already routed.
 *       • pending / manual / anything-but-paid → create a Stripe
 *         Checkout session (platform-level, no Connect) with a
 *         30-day expiry, store the session id, send the student a
 *         "please settle" email with the Checkout URL. The standard
 *         `checkout.session.completed` webhook handler flips the row
 *         to paid + records platformFeeCents (Phase 2).
 *
 * Slot semantics: the booking stays "taken" in the conflict checks
 * — it's history, not a free slot. Matches Jan's design call: an
 * audit trail of what was scheduled vs not.
 *
 * Returns `{ success: true, settlementUrl? }` on success or
 * `{ error }` on user-actionable failure. Stripe failures bubble
 * up as `{ error }` so the pro UI can show a "retry" hint without
 * leaving the booking in a half-marked state.
 */
import { db } from "@/lib/db";
import {
  users,
  proLocations,
  locations,
  lessonBookings,
  proProfiles,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { getStripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/mail";
import { resolveLocale } from "@/lib/i18n";
import { formatLocationFull } from "@/lib/location-display";
import {
  buildNoShowEmail,
  getNoShowSubject,
} from "@/lib/booking-no-show-email";

const SETTLEMENT_EXPIRY_DAYS = 30;

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export type MarkNoShowResult =
  | { success: true; settlementUrl?: string }
  | { error: string };

/**
 * Decide whether a booking with the given payment status needs a
 * settlement link sent to the student. Pure helper — broken out so
 * tests can exercise the branch decision without spinning up the
 * full action.
 *
 * The "settle" outcome covers pending (online-pay pro, student bailed
 * mid-Checkout) and manual (cash-only pro, never paid). The "skip"
 * outcome covers paid (online-pay, money already routed) and the
 * defensive fallbacks (failed / refunded / requires_action / unknown)
 * where we want a human in the loop rather than auto-charging again.
 */
export function needsSettlementCheckout(
  paymentStatus: string,
): "settle" | "skip" {
  if (paymentStatus === "pending" || paymentStatus === "manual") {
    return "settle";
  }
  return "skip";
}

export interface MarkNoShowOpts {
  bookingId: number;
  proProfileId: number;
}

export async function markBookingAsNoShow(
  opts: MarkNoShowOpts,
): Promise<MarkNoShowResult> {
  const { bookingId, proProfileId } = opts;

  const [booking] = await db
    .select({
      id: lessonBookings.id,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      bookedById: lessonBookings.bookedById,
      proLocationId: lessonBookings.proLocationId,
      priceCents: lessonBookings.priceCents,
      paymentStatus: lessonBookings.paymentStatus,
      participantCount: lessonBookings.participantCount,
    })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.id, bookingId),
        eq(lessonBookings.proProfileId, proProfileId),
        eq(lessonBookings.status, "confirmed"),
      ),
    )
    .limit(1);

  if (!booking) return { error: "Booking not found." };

  const [loc] = await db
    .select({
      name: locations.name,
      address: locations.address,
      city: locations.city,
      timezone: locations.timezone,
    })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(proLocations.id, booking.proLocationId))
    .limit(1);
  if (!loc) {
    return { error: "Lesson location not found." };
  }
  const locationName = formatLocationFull(loc);

  const lessonStart = fromZonedTime(
    `${booking.date}T${booking.startTime}:00`,
    loc.timezone,
  );
  if (lessonStart.getTime() > Date.now()) {
    return { error: "Can't mark a future lesson as no-show." };
  }

  // Look up the student so we can pre-fill Checkout + later email
  // the settlement link. We need this BEFORE the row update so a
  // missing student row (defensive) doesn't strand the DB write.
  const [student] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      preferredLocale: users.preferredLocale,
    })
    .from(users)
    .where(eq(users.id, booking.bookedById))
    .limit(1);
  if (!student?.email) {
    return { error: "Student email not found." };
  }
  const studentLocale = resolveLocale(student.preferredLocale);

  // Pro display name — used by both the Stripe Checkout product
  // name and the no-show email, so resolve it once upfront.
  const [proRow] = await db
    .select({ displayName: proProfiles.displayName })
    .from(proProfiles)
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);
  const proDisplayName = proRow?.displayName ?? "your pro";

  const branch = needsSettlementCheckout(booking.paymentStatus);

  let settlementUrl: string | undefined;
  let stripeCheckoutSessionId: string | undefined;

  if (branch === "settle") {
    if (booking.priceCents == null || booking.priceCents <= 0) {
      // No price means no fee to collect (free lesson, comp pro,
      // etc.). Treat as 'skip' — still mark no-show but no link.
    } else {
      try {
        const stripe = getStripe();
        const expiresAt =
          Math.floor(Date.now() / 1000) +
          SETTLEMENT_EXPIRY_DAYS * 24 * 60 * 60;
        const base = getBaseUrl();
        const session = await stripe.checkout.sessions.create(
          {
            mode: "payment",
            customer_email: student.email,
            expires_at: expiresAt,
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: "eur",
                  unit_amount: booking.priceCents,
                  product_data: {
                    name: `Missed lesson with ${proDisplayName}`,
                    description: `${booking.date} ${booking.startTime}–${booking.endTime}`,
                  },
                },
              },
            ],
            metadata: {
              bookingId: String(booking.id),
              kind: "no-show-settlement",
            },
            payment_intent_data: {
              metadata: {
                bookingId: String(booking.id),
                kind: "no-show-settlement",
              },
              description: `No-show settlement booking #${booking.id}`,
            },
            success_url: `${base}/no-show/paid?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${base}/no-show/pending?booking=${booking.id}`,
          },
          { idempotencyKey: `no-show-${booking.id}-v1` },
        );
        settlementUrl = session.url ?? undefined;
        stripeCheckoutSessionId = session.id;
        if (!settlementUrl) {
          return { error: "Stripe did not return a Checkout URL." };
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to create the settlement payment link.";
        return { error: msg };
      }
    }
  }

  await db
    .update(lessonBookings)
    .set({
      status: "no_show",
      cancelledAt: new Date(),
      cancellationReason: "No-show",
      ...(stripeCheckoutSessionId
        ? { stripeCheckoutSessionId }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(lessonBookings.id, bookingId));

  // Notify the student. PAID variant is a plain FYI; UNPAID variant
  // carries the Checkout CTA. Fire-and-forget — the pro's action
  // already succeeded by this point, and a transient mail failure
  // shouldn't bubble back to them as an error.
  const paid = booking.paymentStatus === "paid";
  sendEmail({
    to: student.email,
    subject: getNoShowSubject({
      paid,
      proName: proDisplayName,
      locale: studentLocale,
    }),
    html: buildNoShowEmail({
      paid,
      recipientFirstName: student.firstName,
      proDisplayName,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      locationName,
      priceCents: booking.priceCents,
      settlementUrl,
      locale: studentLocale,
    }),
  }).catch(() => {});

  return { success: true, settlementUrl };
}
