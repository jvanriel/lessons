import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, hasRole } from "@/lib/auth";
import { lookupBookingForRefund } from "./actions";
import ManualRefundForm from "./ManualRefundForm";

export const metadata = { title: "Manual refund — Admin — Golf Lessons" };

interface Props {
  searchParams: Promise<{ booking?: string }>;
}

export default async function ManualRefundPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session || !hasRole(session, "admin")) redirect("/login");

  const { booking: bookingIdStr } = await searchParams;
  const bookingId = bookingIdStr ? parseInt(bookingIdStr, 10) : null;
  const booking =
    bookingId && !isNaN(bookingId)
      ? await lookupBookingForRefund(bookingId)
      : null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href="/admin"
        className="text-sm text-green-600 hover:text-green-700"
      >
        ← Admin
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-green-900">
        Manual refund
      </h1>
      <p className="mt-2 text-sm text-green-600">
        Mark a booking as refunded after reconciling the refund directly in
        the Stripe dashboard. Use when{" "}
        <code className="rounded bg-green-50 px-1 text-xs">
          stripe.refunds.create
        </code>{" "}
        failed (network hiccup, payment too old, already-refunded) so the row
        stays in sync with reality.
      </p>

      {/* Lookup form */}
      <form className="mt-8 flex items-end gap-3" method="get">
        <div className="flex-1">
          <label
            htmlFor="booking"
            className="block text-sm font-medium text-green-900"
          >
            Booking ID
          </label>
          <input
            id="booking"
            name="booking"
            type="number"
            min={1}
            defaultValue={bookingIdStr ?? ""}
            required
            className="mt-1 block w-full rounded-md border border-green-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
        >
          Look up
        </button>
      </form>

      {/* Result */}
      {bookingId && !booking && (
        <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No booking with ID {bookingId} found.
        </p>
      )}

      {booking && <ManualRefundForm booking={booking} />}
    </div>
  );
}
