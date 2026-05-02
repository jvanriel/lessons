"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAsManuallyRefunded } from "./actions";

interface Booking {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string;
  priceCents: number | null;
  currency: string;
  stripePaymentIntentId: string | null;
  refundedAt: Date | null;
  paidAt: Date | null;
  notes: string | null;
  proDisplayName: string;
  studentEmail: string;
  studentFirstName: string;
  studentLastName: string;
}

function formatCents(cents: number | null, currency: string): string {
  if (cents == null) return "—";
  const symbol = currency.toUpperCase() === "EUR" ? "€" : currency;
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

const ALLOWED_TO_MARK = new Set([
  "paid",
  "failed",
  "requires_action",
  "pending",
]);

export default function ManualRefundForm({ booking }: { booking: Booking }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  const canMark = ALLOWED_TO_MARK.has(booking.paymentStatus) && !success;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 4) {
      setError("Reason is required (4+ chars)");
      return;
    }
    if (
      !confirm(
        `Mark booking #${booking.id} as refunded?\n\nThis sets paymentStatus="refunded", stamps refundedAt=now, and appends an audit line to the booking notes. The student is NOT emailed.`,
      )
    )
      return;

    setError(null);
    const formData = new FormData();
    formData.set("bookingId", String(booking.id));
    formData.set("reason", reason.trim());

    startTransition(async () => {
      const result = await markAsManuallyRefunded(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      router.refresh();
    });
  }

  return (
    <div className="mt-6 rounded-xl border border-green-200 bg-white p-6">
      <h2 className="font-display text-xl font-semibold text-green-900">
        Booking #{booking.id}
      </h2>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs uppercase text-green-500">Pro</dt>
          <dd className="text-green-900">{booking.proDisplayName}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-green-500">Student</dt>
          <dd className="text-green-900">
            {booking.studentFirstName} {booking.studentLastName}
            <br />
            <span className="text-xs text-green-500">
              {booking.studentEmail}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-green-500">When</dt>
          <dd className="text-green-900">
            {booking.date}
            <br />
            <span className="text-xs">
              {booking.startTime}–{booking.endTime}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-green-500">Price</dt>
          <dd className="text-green-900">
            {formatCents(booking.priceCents, booking.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-green-500">Status</dt>
          <dd className="text-green-900">{booking.status}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-green-500">Payment</dt>
          <dd>
            <span
              className={
                booking.paymentStatus === "refunded"
                  ? "text-amber-600"
                  : booking.paymentStatus === "paid"
                    ? "text-green-700"
                    : "text-green-900"
              }
            >
              {booking.paymentStatus}
            </span>
          </dd>
        </div>
        {booking.stripePaymentIntentId && (
          <div className="col-span-2">
            <dt className="text-xs uppercase text-green-500">
              Stripe PaymentIntent
            </dt>
            <dd className="text-xs font-mono text-green-700">
              {booking.stripePaymentIntentId}
            </dd>
          </div>
        )}
        {booking.refundedAt && (
          <div className="col-span-2">
            <dt className="text-xs uppercase text-green-500">Refunded at</dt>
            <dd className="text-green-900">
              {new Date(booking.refundedAt).toISOString()}
            </dd>
          </div>
        )}
        {booking.notes && (
          <div className="col-span-2">
            <dt className="text-xs uppercase text-green-500">Notes</dt>
            <dd className="whitespace-pre-wrap text-xs text-green-700">
              {booking.notes}
            </dd>
          </div>
        )}
      </dl>

      {success && (
        <p className="mt-6 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✓ Booking #{booking.id} marked as refunded.
        </p>
      )}

      {!canMark && !success && (
        <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {booking.paymentStatus === "refunded"
            ? "This booking is already marked refunded."
            : `Cannot mark a "${booking.paymentStatus}" booking — only paid, failed, requires_action, or pending.`}
        </p>
      )}

      {canMark && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="reason"
              className="block text-sm font-medium text-green-900"
            >
              Reason / Stripe ref
            </label>
            <textarea
              id="reason"
              name="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={4}
              placeholder="e.g. Stripe refunds.create returned 400 already_refunded; reconciled re_3M... in dashboard."
              className="mt-1 block w-full rounded-md border border-green-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <p className="mt-1 text-xs text-green-500">
              Appended to the booking notes alongside your email and timestamp.
            </p>
          </div>
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {pending ? "Marking…" : "Mark as manually refunded"}
          </button>
        </form>
      )}
    </div>
  );
}
