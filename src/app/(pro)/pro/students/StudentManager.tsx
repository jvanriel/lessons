"use client";

import { useState, useActionState, useTransition } from "react";
import { inviteStudent, removeStudent } from "./actions";

interface Student {
  id: number;
  userId: number;
  source: string;
  status: string;
  createdAt: Date;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
}

function sourceLabel(source: string) {
  switch (source) {
    case "self":
      return "Self-registered";
    case "invited":
      return "Invited";
    case "pro_added":
      return "Added by pro";
    default:
      return source;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "active":
      return (
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          Active
        </span>
      );
    case "pending":
      return (
        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
          Pending
        </span>
      );
    case "inactive":
      return (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
          Inactive
        </span>
      );
    default:
      return (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
          {status}
        </span>
      );
  }
}

export default function StudentManager({
  students,
}: {
  students: Student[];
}) {
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteMode, setInviteMode] = useState<"invited" | "pro_added">(
    "invited"
  );
  const [inviteState, inviteAction, invitePending] = useActionState(
    inviteStudent,
    null
  );
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState<"all" | "active" | "pending" | "inactive">("all");

  const filtered = students.filter((s) =>
    filter === "all" ? true : s.status === filter
  );

  function handleRemove(id: number) {
    if (!confirm("Remove this student? They can rejoin later.")) return;
    setRemovingId(id);
    startTransition(async () => {
      await removeStudent(id);
      setRemovingId(null);
    });
  }

  const activeCounts = {
    all: students.length,
    active: students.filter((s) => s.status === "active").length,
    pending: students.filter((s) => s.status === "pending").length,
    inactive: students.filter((s) => s.status === "inactive").length,
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-green-900">
            Students
          </h1>
          <p className="mt-1 text-sm text-green-600">
            {activeCounts.active} active student{activeCounts.active !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setInviteMode("invited");
              setShowInviteForm(true);
            }}
            className="rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-500"
          >
            Invite student
          </button>
          <button
            type="button"
            onClick={() => {
              setInviteMode("pro_added");
              setShowInviteForm(true);
            }}
            className="rounded-md border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-50"
          >
            Add student
          </button>
        </div>
      </div>

      {/* Invite/Add form */}
      {showInviteForm && (
        <div className="mt-6 rounded-xl border border-green-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-medium text-green-800">
              {inviteMode === "invited" ? "Invite a student" : "Add a student"}
            </h2>
            <button
              type="button"
              onClick={() => setShowInviteForm(false)}
              className="text-sm text-green-400 hover:text-green-600"
            >
              Cancel
            </button>
          </div>

          {inviteMode === "invited" && (
            <p className="mb-4 text-sm text-green-600">
              An email invitation with login credentials will be sent to the student.
            </p>
          )}

          <form action={inviteAction} className="space-y-3">
            <input type="hidden" name="source" value={inviteMode} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-green-700">
                  First name
                </label>
                <input
                  name="firstName"
                  required
                  className="mt-1 block w-full rounded-lg border border-green-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-green-700">
                  Last name
                </label>
                <input
                  name="lastName"
                  required
                  className="mt-1 block w-full rounded-lg border border-green-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-green-700">
                Email
              </label>
              <input
                name="email"
                type="email"
                required
                className="mt-1 block w-full rounded-lg border border-green-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
            </div>

            {inviteState?.error && (
              <p className="text-sm text-red-600">{inviteState.error}</p>
            )}
            {inviteState?.success && (
              <p className="text-sm text-green-600">
                Student {inviteMode === "invited" ? "invited" : "added"} successfully!
                {inviteState.password && (
                  <span className="block mt-1 text-xs text-green-500">
                    Temporary password: <code className="bg-green-50 px-1 py-0.5 rounded">{inviteState.password}</code>
                  </span>
                )}
              </p>
            )}

            <button
              type="submit"
              disabled={invitePending}
              className="rounded-md bg-gold-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-500 disabled:opacity-50"
            >
              {invitePending
                ? "Processing..."
                : inviteMode === "invited"
                  ? "Send invitation"
                  : "Add student"}
            </button>
          </form>
        </div>
      )}

      {/* Filter tabs */}
      <div className="mt-6 flex gap-1 rounded-lg bg-green-50 p-1">
        {(["all", "active", "pending", "inactive"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f
                ? "bg-white text-green-800 shadow-sm"
                : "text-green-500 hover:text-green-700"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} ({activeCounts[f]})
          </button>
        ))}
      </div>

      {/* Student list */}
      {filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-green-200 bg-white p-8 text-center">
          <p className="text-green-600">
            {filter === "all"
              ? "No students yet. Invite or add students to get started."
              : `No ${filter} students.`}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {filtered.map((student) => (
            <div
              key={student.id}
              className="flex items-center justify-between rounded-xl border border-green-200 bg-white p-4 transition-colors hover:border-green-300"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-sm font-medium text-green-600">
                  {student.firstName.charAt(0)}
                  {student.lastName.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-green-900">
                    {student.firstName} {student.lastName}
                  </p>
                  <p className="text-xs text-green-500">{student.email}</p>
                  {student.phone && (
                    <p className="text-xs text-green-400">{student.phone}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="flex items-center gap-2">
                    {statusBadge(student.status)}
                    <span className="text-xs text-green-400">
                      {sourceLabel(student.source)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-green-400">
                    Joined{" "}
                    {new Date(student.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
                {student.status === "active" && (
                  <button
                    type="button"
                    onClick={() => handleRemove(student.id)}
                    disabled={removingId === student.id}
                    className="rounded p-1 text-green-300 transition-colors hover:bg-red-50 hover:text-red-500"
                    title="Remove student"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
