"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PLATFORM_FEE_PERCENT } from "@/lib/stripe";

interface Payout {
  proProfileId: number;
  proDisplayName: string;
  proEmail: string;
  bankAccountHolder: string | null;
  bankIban: string | null;
  bankBic: string | null;
  totalLessons: number;
  grossRevenue: number;
  platformFees: number;
  netPayout: number;
}

interface PayoutsProps {
  month: string;
  payouts: Payout[];
  totalGross: number;
  totalFees: number;
  totalNet: number;
  totalLessons: number;
}

function formatCents(cents: number) {
  return `€${(cents / 100).toFixed(2)}`;
}

function formatIban(iban: string) {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

function formatMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function getMonthOptions() {
  const options: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return options;
}

export default function PayoutsClient({
  month,
  payouts,
  totalGross,
  totalFees,
  totalNet,
  totalLessons,
}: PayoutsProps) {
  const router = useRouter();
  const prosWithoutBank = payouts.filter((p) => !p.bankIban);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-green-900">
            Payouts
          </h1>
          <p className="mt-2 text-green-700">
            Monthly lesson payment payouts to pros.
          </p>
        </div>
        <Button
          onClick={() =>
            window.open(`/api/admin/payouts?month=${month}&format=csv`, "_blank")
          }
          className="bg-gold-600 text-white hover:bg-gold-500"
          disabled={payouts.length === 0}
        >
          Download CSV
        </Button>
      </div>

      {/* Month selector */}
      <div className="mt-6">
        <select
          value={month}
          onChange={(e) =>
            router.push(`/admin/payouts?month=${e.target.value}`)
          }
          className="rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
        >
          {getMonthOptions().map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-green-200 bg-white p-5">
          <p className="text-xs font-medium uppercase text-green-500">
            Total lessons
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-green-900">
            {totalLessons}
          </p>
        </div>
        <div className="rounded-xl border border-green-200 bg-white p-5">
          <p className="text-xs font-medium uppercase text-green-500">
            Gross revenue
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-green-900">
            {formatCents(totalGross)}
          </p>
        </div>
        <div className="rounded-xl border border-green-200 bg-white p-5">
          <p className="text-xs font-medium uppercase text-green-500">
            Platform fees ({PLATFORM_FEE_PERCENT}%)
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-gold-700">
            {formatCents(totalFees)}
          </p>
        </div>
        <div className="rounded-xl border border-green-200 bg-white p-5">
          <p className="text-xs font-medium uppercase text-green-500">
            Net to pay out
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-green-900">
            {formatCents(totalNet)}
          </p>
        </div>
      </div>

      {/* Missing bank details warning */}
      {prosWithoutBank.length > 0 && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">
            {prosWithoutBank.length}{" "}
            {prosWithoutBank.length === 1 ? "pro has" : "pros have"} no bank
            details:
          </span>{" "}
          {prosWithoutBank.map((p) => p.proDisplayName).join(", ")}
        </div>
      )}

      {/* Payouts table */}
      <div className="mt-6 rounded-xl border border-green-200 bg-white shadow-sm">
        <div className="border-b border-green-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-green-900">
            {formatMonth(month)} — Per Pro
          </h2>
        </div>

        {payouts.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-green-500">
            No paid lessons this month.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-green-100 text-left text-xs font-medium uppercase text-green-500">
                  <th className="px-6 py-3">Pro</th>
                  <th className="px-6 py-3">IBAN</th>
                  <th className="px-6 py-3 text-right">Lessons</th>
                  <th className="px-6 py-3 text-right">Gross</th>
                  <th className="px-6 py-3 text-right">Fee</th>
                  <th className="px-6 py-3 text-right">Net payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-green-50">
                {payouts.map((p) => (
                  <tr key={p.proProfileId} className="hover:bg-green-50/50">
                    <td className="px-6 py-3">
                      <div className="font-medium text-green-900">
                        {p.proDisplayName}
                      </div>
                      <div className="text-xs text-green-500">{p.proEmail}</div>
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-green-700">
                      {p.bankIban ? (
                        <div>
                          <div>{formatIban(p.bankIban)}</div>
                          {p.bankAccountHolder && (
                            <div className="text-green-500">
                              {p.bankAccountHolder}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-amber-600">Missing</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right text-green-900">
                      {p.totalLessons}
                    </td>
                    <td className="px-6 py-3 text-right text-green-900">
                      {formatCents(p.grossRevenue)}
                    </td>
                    <td className="px-6 py-3 text-right text-green-500">
                      {formatCents(p.platformFees)}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-green-900">
                      {formatCents(p.netPayout)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-green-200 bg-green-50/50 font-semibold">
                  <td className="px-6 py-3 text-green-900">Total</td>
                  <td className="px-6 py-3" />
                  <td className="px-6 py-3 text-right text-green-900">
                    {totalLessons}
                  </td>
                  <td className="px-6 py-3 text-right text-green-900">
                    {formatCents(totalGross)}
                  </td>
                  <td className="px-6 py-3 text-right text-green-500">
                    {formatCents(totalFees)}
                  </td>
                  <td className="px-6 py-3 text-right text-green-900">
                    {formatCents(totalNet)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
