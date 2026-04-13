"use client";

import { useState, useTransition } from "react";
import { lookupUser, exportUserData, deleteUser, type GdprLookupResult } from "./actions";

export default function GdprBrowser() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<GdprLookupResult | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [deleteSummary, setDeleteSummary] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setDeleteSummary(null);
    setShowDelete(false);
    setDeleteConfirm("");
    startTransition(async () => {
      try {
        const r = await lookupUser(email);
        setResult(r);
        if (!r.found) setError("No user found for that email.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lookup failed");
      }
    });
  }

  function handleExport() {
    startTransition(async () => {
      try {
        const r = await exportUserData(email);
        if (r.error) {
          setError(r.error);
          return;
        }
        if (r.json && r.filename) {
          const blob = new Blob([r.json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = r.filename;
          a.click();
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Export failed");
      }
    });
  }

  function handleDelete() {
    setError(null);
    setDeleteSummary(null);
    startTransition(async () => {
      try {
        const r = await deleteUser(email, deleteConfirm);
        if (r.error) {
          setError(r.error);
          return;
        }
        if (r.success && r.summary) {
          setDeleteSummary(r.summary);
          setResult(null);
          setShowDelete(false);
          setDeleteConfirm("");
          setEmail("");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Lookup form */}
      <form onSubmit={handleLookup} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          className="flex-1 rounded-md border border-green-300 bg-white px-3 py-2 text-sm text-green-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <button
          type="submit"
          disabled={isPending || !email.trim()}
          className="rounded-md bg-green-800 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {isPending ? "Looking up…" : "Look up"}
        </button>
      </form>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {deleteSummary && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <p className="font-semibold">User deleted successfully.</p>
          <ul className="mt-2 list-disc pl-5 text-xs">
            {deleteSummary.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Result */}
      {result?.found && result.user && result.summary && (
        <div className="space-y-4 rounded-xl border border-green-200 bg-white p-6">
          <div>
            <h2 className="text-lg font-semibold text-green-900">
              {result.user.firstName} {result.user.lastName}
            </h2>
            <p className="text-sm text-green-600">
              <span className="font-mono">#{result.user.id}</span> ·{" "}
              {result.user.email}
            </p>
            <p className="mt-1 text-xs text-green-500">
              Roles: {result.user.roles || "(none)"} · created{" "}
              {new Date(result.user.createdAt).toISOString().slice(0, 10)}
              {result.user.deletedAt && (
                <>
                  {" "}
                  · <span className="text-red-600">deleted {new Date(result.user.deletedAt).toISOString().slice(0, 10)}</span>
                </>
              )}
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-green-500">
              Data held
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              <SummaryRow label="Linked emails" value={result.summary.userEmails} />
              <SummaryRow label="Pro profile" value={result.summary.proProfile ? "yes" : "no"} />
              <SummaryRow label="Pro-student relations" value={result.summary.proStudentRelations} />
              <SummaryRow label="Bookings (booked by)" value={result.summary.bookings} />
              <SummaryRow label="Participants (by email)" value={result.summary.participantsByEmail} />
              <SummaryRow label="Comments authored" value={result.summary.comments} />
              <SummaryRow label="Comment reactions" value={result.summary.commentReactions} />
              <SummaryRow label="Notifications" value={result.summary.notifications} />
              <SummaryRow label="Tasks created" value={result.summary.tasksCreated} />
              <SummaryRow label="Tasks assigned" value={result.summary.tasksAssigned} />
              <SummaryRow label="Tasks shared" value={result.summary.tasksShared} />
              <SummaryRow label="Push subscriptions" value={result.summary.pushSubscriptions} />
              <SummaryRow label="Events (actor)" value={result.summary.events} />
              <SummaryRow label="Stripe events" value={result.summary.stripeEvents} />
              {result.summary.proProfile && (
                <>
                  <SummaryRow label="Pro locations" value={result.summary.proLocations} />
                  <SummaryRow label="Pro availability rows" value={result.summary.proAvailabilityRows} />
                  <SummaryRow label="Pro availability overrides" value={result.summary.proAvailabilityOverrides} />
                  <SummaryRow label="Pro pages" value={result.summary.proPages} />
                  <SummaryRow label="Pro mailings" value={result.summary.proMailings} />
                  <SummaryRow label="Pro mailing contacts" value={result.summary.proMailingContacts} />
                </>
              )}
            </dl>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 border-t border-green-100 pt-4">
            <button
              type="button"
              onClick={handleExport}
              disabled={isPending}
              className="rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
            >
              {isPending ? "Exporting…" : "Export JSON (Art. 15 / 20)"}
            </button>
            {!result.user.deletedAt && !showDelete && (
              <button
                type="button"
                onClick={() => setShowDelete(true)}
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Delete + anonymise (Art. 17)
              </button>
            )}
          </div>

          {showDelete && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">
                This will soft-delete the user row, anonymise their name/email,
                hard-delete push subscriptions + notifications + comment
                reactions, and redact their comments. Bookings and Stripe events
                are kept for tax/audit purposes. Type the email below to
                confirm.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  type="email"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder={result.user.email}
                  className="flex-1 rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-red-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={
                    isPending ||
                    deleteConfirm.trim().toLowerCase() !==
                      result.user.email.toLowerCase()
                  }
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {isPending ? "Deleting…" : "Confirm delete"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDelete(false);
                    setDeleteConfirm("");
                  }}
                  disabled={isPending}
                  className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-green-50 py-1">
      <dt className="text-xs text-green-600">{label}</dt>
      <dd className="font-mono text-sm text-green-900">{value}</dd>
    </div>
  );
}
