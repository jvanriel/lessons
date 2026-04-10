"use client";

import { useState, useRef, useActionState } from "react";
import Link from "next/link";
import { inviteStudent, type ProQuickBookData } from "./actions";
import { ProQuickBook } from "./ProQuickBook";
import { EditStudentDialog } from "./EditStudentDialog";

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
  preferredLocationId: number | null;
  preferredDuration: number | null;
  preferredDayOfWeek: number | null;
  preferredTime: string | null;
  preferredInterval: string | null;
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
  currentStudentId,
  currentBooking,
  currentQuickBook,
}: {
  students: Student[];
  currentStudentId: number | null;
  currentBooking: { date: string; startTime: string; endTime: string } | null;
  currentQuickBook: ProQuickBookData | null;
}) {
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteMode, setInviteMode] = useState<"invited" | "pro_added">(
    "invited"
  );
  const [inviteState, inviteAction, invitePending] = useActionState(
    inviteStudent,
    null
  );
  const [filter, setFilter] = useState<"all" | "active" | "pending" | "inactive">("all");
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [search, setSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const currentStudent = currentStudentId
    ? students.find((s) => s.id === currentStudentId) ?? null
    : null;

  const filtered = students
    .filter((s) => (filter === "all" ? true : s.status === filter))
    .filter((s) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        s.firstName.toLowerCase().includes(q) ||
        s.lastName.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
      );
    });

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
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-semibold text-green-900">
              Students
            </h1>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="rounded-full p-1 text-green-400 transition-colors hover:bg-green-50 hover:text-green-600"
              title="Help"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827m0 0v.5m0 2h.008v.008H12v-.008Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </button>
          </div>
          <p className="mt-1 text-sm text-green-600">
            {activeCounts.active} active student{activeCounts.active !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setInviteMode("invited");
              setGeneratedPassword("");
              setShowInviteForm(true);
            }}
            className="rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-500"
          >
            <span className="sm:hidden">Invite</span>
            <span className="hidden sm:inline">Invite student</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setInviteMode("pro_added");
              setGeneratedPassword("");
              setShowInviteForm(true);
            }}
            className="rounded-md border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-50"
          >
            <span className="sm:hidden">Add</span>
            <span className="hidden sm:inline">Add student</span>
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
            <div>
              <label className="text-sm font-medium text-green-700">
                Password
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  name="password"
                  type="text"
                  required
                  value={generatedPassword}
                  onChange={(e) => setGeneratedPassword(e.target.value)}
                  className="block w-full rounded-lg border border-green-200 px-3 py-2 text-sm font-mono focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
                    let pw = "";
                    const arr = new Uint8Array(12);
                    crypto.getRandomValues(arr);
                    for (const b of arr) pw += chars[b % chars.length];
                    setGeneratedPassword(pw);
                  }}
                  className="shrink-0 rounded-lg border border-green-200 px-3 py-2 text-xs font-medium text-green-700 transition-colors hover:bg-green-50"
                >
                  Generate
                </button>
              </div>
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

      {/* Current student — next lesson */}
      {currentStudent && currentBooking && (
        <div className="mt-6 rounded-xl border-2 border-gold-300 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-100 text-sm font-medium text-gold-700">
                {currentStudent.firstName.charAt(0)}
                {currentStudent.lastName.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-medium text-green-900">
                  {currentStudent.firstName} {currentStudent.lastName}
                </p>
                <p className="text-xs text-green-500">
                  {new Date(currentBooking.date + "T00:00:00").toLocaleDateString(
                    "en-US",
                    { weekday: "short", month: "short", day: "numeric" }
                  )}
                </p>
                <p className="text-xs text-green-400">
                  {currentBooking.startTime} - {currentBooking.endTime}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/pro/students/${currentStudent.id}`}
                className="flex items-center gap-1.5 rounded-md border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-50"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                </svg>
                Chat
              </Link>
              <button
                type="button"
                onClick={() => setEditingStudent(currentStudent)}
                className="flex items-center gap-1.5 rounded-md border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-50"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                </svg>
                Edit
              </button>
            </div>
          </div>
          {currentQuickBook && (
            <ProQuickBook
              proStudentId={currentStudent.id}
              studentName={`${currentStudent.firstName} ${currentStudent.lastName}`}
              initialData={currentQuickBook}
              autoOpen
            />
          )}
        </div>
      )}

      {/* Search + filter */}
      <div className="mt-6 flex items-center gap-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search students..."
            className="w-full rounded-lg border border-green-200 bg-white py-2 pl-9 pr-3 text-sm text-green-900 outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400/30"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mt-3 flex gap-1 rounded-lg bg-green-50 p-1">
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
          {filtered.map((student) => {
            const isSelected = selectedStudentId === student.id;
            return (
              <div
                key={student.id}
                className={`rounded-xl border bg-white transition-colors ${
                  isSelected
                    ? "border-gold-300"
                    : "border-green-200 hover:border-green-300"
                }`}
              >
                {/* Row header — click to expand */}
                <button
                  type="button"
                  onClick={() =>
                    setSelectedStudentId(isSelected ? null : student.id)
                  }
                  className="flex w-full items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium ${
                        isSelected
                          ? "bg-gold-100 text-gold-700"
                          : "bg-green-100 text-green-600"
                      }`}
                    >
                      {student.firstName.charAt(0)}
                      {student.lastName.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-900">
                        {student.firstName} {student.lastName}
                      </p>
                      <p className="text-xs text-green-500">{student.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        {statusBadge(student.status)}
                      </div>
                    </div>
                    <svg
                      className={`h-4 w-4 text-green-400 transition-transform ${
                        isSelected ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                      />
                    </svg>
                  </div>
                </button>

                {/* Expanded panel */}
                {isSelected && (
                  <div className="border-t border-green-100 px-4 pb-4">
                    {/* Action buttons */}
                    <div className="mt-3 flex gap-2">
                      <Link
                        href={`/pro/students/${student.id}`}
                        className="flex items-center gap-1.5 rounded-md border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-50"
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                          />
                        </svg>
                        Chat
                      </Link>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingStudent(student);
                        }}
                        className="flex items-center gap-1.5 rounded-md border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-50"
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                          />
                        </svg>
                        Edit
                      </button>
                    </div>

                    {/* Quick book */}
                    {student.status === "active" && (
                      <ProQuickBook
                        proStudentId={student.id}
                        studentName={`${student.firstName} ${student.lastName}`}
                        autoOpen
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit student dialog */}
      {editingStudent && (
        <EditStudentDialog
          student={editingStudent}
          onClose={() => setEditingStudent(null)}
        />
      )}

      {/* Help dialog */}
      {showHelp && (
        <HelpDialog onClose={() => setShowHelp(false)} />
      )}
    </div>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const backdropRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-16"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl border border-green-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-green-100 px-5 py-4">
          <h3 className="font-display text-lg font-semibold text-green-900">
            Managing your students
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-green-400 hover:text-green-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-5 px-5 py-5 text-sm text-green-700 leading-relaxed">
          <div>
            <h4 className="font-medium text-green-900">Adding students</h4>
            <p className="mt-1">
              There are two ways to add a student:
            </p>
            <ul className="mt-2 space-y-2 pl-4">
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong className="text-green-900">Invite</strong> — sends an email
                with login credentials. The student&apos;s status is &quot;pending&quot; until
                they log in for the first time.
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong className="text-green-900">Add</strong> — creates the student
                account immediately as &quot;active&quot;. Use this when you&apos;re setting up
                the account in person, e.g. during a lesson.
              </li>
            </ul>
            <p className="mt-2">
              Both require a password. Click <strong>Generate</strong> to create a
              secure random password, or type one manually.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-green-900">Quick Book</h4>
            <p className="mt-1">
              Once a student has booked at least one lesson, the system remembers
              their preferred location, duration, day, and time. You&apos;ll see date and
              time buttons on each student card — <strong>hold any time slot</strong> to
              instantly book a lesson for them.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-green-900">Edit &amp; manage</h4>
            <p className="mt-1">
              Click the <strong>Edit</strong> button on a student card to update their
              name, email, phone, and booking preferences. From the same dialog you
              can also reset their password or remove them.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-green-900">Invite vs. Reset password</h4>
            <div className="mt-2 rounded-lg border border-green-100 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-green-50 text-green-800">
                    <th className="px-3 py-2 font-medium"></th>
                    <th className="px-3 py-2 font-medium">Invite / Add</th>
                    <th className="px-3 py-2 font-medium">Reset password</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-green-100">
                  <tr>
                    <td className="px-3 py-2 font-medium text-green-800">When to use</td>
                    <td className="px-3 py-2">Someone <strong>new</strong> who has never used Golf Lessons before</td>
                    <td className="px-3 py-2">An <strong>existing</strong> student who can&apos;t log in anymore</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-medium text-green-800">What it does</td>
                    <td className="px-3 py-2"><strong>Creates a new account</strong>, connects them to you, and sends a welcome email with login instructions</td>
                    <td className="px-3 py-2"><strong>Changes the password</strong> on their existing account and emails them the new one</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-medium text-green-800">Their data</td>
                    <td className="px-3 py-2">Fresh account — no bookings or history</td>
                    <td className="px-3 py-2">Everything stays: bookings, preferences, chat history</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-medium text-green-800">Where</td>
                    <td className="px-3 py-2"><strong>Invite</strong> / <strong>Add</strong> buttons at the top of this page</td>
                    <td className="px-3 py-2"><strong>Edit</strong> button on the student card → Account section</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-green-900">Student status</h4>
            <ul className="mt-1 space-y-1 pl-4">
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-green-500">
                <strong className="text-green-900">Active</strong> — can book lessons and chat with you.
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-yellow-500">
                <strong className="text-green-900">Pending</strong> — invited but hasn&apos;t logged in yet.
                Becomes active on first login.
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gray-400">
                <strong className="text-green-900">Inactive</strong> — removed. They
                can be re-invited later.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
