"use client";

import { useState, useActionState, useTransition, useRef, useEffect } from "react";
import {
  createUser,
  updateUser,
  deleteUser,
  purgeUser,
  resetPassword,
  resetPasswordWithNotification,
  sendInvite,
  activateAsPro,
  addUserEmail,
  removeUserEmail,
} from "./actions";

interface UserEmail {
  id: number;
  email: string;
  label: string | null;
  isPrimary: boolean;
}

interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  roles: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
  deletedAt: string | null;
  emails: UserEmail[];
}

const ROLES = ["member", "admin", "pro", "dev"];

const inputClass =
  "block w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

export default function UserManager({ users }: { users: User[] }) {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.firstName.toLowerCase().includes(q) ||
      u.lastName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.roles?.toLowerCase().includes(q) ||
      u.emails.some((e) => e.email.toLowerCase().includes(q))
    );
  });

  return (
    <div>
      {/* Title */}
      <div className="flex items-center gap-2 mb-6">
        <h1 className="font-display text-3xl font-semibold text-green-900">
          Users
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

      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users..."
          className={inputClass + " max-w-xs"}
        />
        <button
          onClick={() => {
            setShowCreate(true);
            setSelectedUser(null);
          }}
          className="rounded-lg bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500"
        >
          Add User
        </button>
      </div>

      {/* User table */}
      <div className="overflow-hidden rounded-xl border border-green-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-green-100 bg-green-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-green-700">
                Name
              </th>
              <th className="px-4 py-3 text-left font-medium text-green-700">
                Email
              </th>
              <th className="px-4 py-3 text-left font-medium text-green-700">
                Roles
              </th>
              <th className="px-4 py-3 text-left font-medium text-green-700">
                Last login
              </th>
              <th className="w-24 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-green-50">
            {filtered.map((user) => (
              <tr key={user.id} className={`hover:bg-green-50/50 ${user.deletedAt ? "opacity-50" : ""}`}>
                <td className="px-4 py-3 text-green-900">
                  {user.firstName} {user.lastName}
                  {user.deletedAt && (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                      deleted
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-green-600">{user.email}</span>
                  {user.emails.length > 1 && (
                    <span className="ml-1.5 text-[10px] text-green-400">
                      +{user.emails.length - 1}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {user.roles
                    ?.split(",")
                    .filter(Boolean)
                    .map((role) => (
                      <span
                        key={role}
                        className="mr-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700"
                      >
                        {role.trim()}
                      </span>
                    ))}
                </td>
                <td className="px-4 py-3 text-green-500">
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleDateString("en-GB")
                    : "Never"}
                </td>
                <td className="px-4 py-3">
                  <UserRowActions
                    user={user}
                    onEdit={() => {
                      setSelectedUser(user);
                      setShowCreate(false);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <CreateUserDialog onClose={() => setShowCreate(false)} />
      )}

      {/* Edit dialog */}
      {selectedUser && (
        <UserDialog
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}

      {showHelp && (
        <AdminUsersHelp onClose={() => setShowHelp(false)} />
      )}
    </div>
  );
}

function AdminUsersHelp({ onClose }: { onClose: () => void }) {
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
            User management
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
            <h4 className="font-medium text-green-900">Creating users</h4>
            <p className="mt-1">
              Click <strong>Create user</strong> to add a new account. Assign one
              or more roles:
            </p>
            <ul className="mt-2 space-y-1 pl-4">
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong className="text-green-900">Member</strong> — can browse pros, book lessons, and use coaching chat.
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong className="text-green-900">Pro</strong> — can manage students, availability, bookings, and earnings.
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong className="text-green-900">Admin</strong> — can manage all users, CMS, tasks, payouts, and settings.
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong className="text-green-900">Dev</strong> — access to database, blob store, and logs.
              </li>
            </ul>
            <p className="mt-2">
              A user can have multiple roles (e.g. a pro who is also a member).
            </p>
          </div>

          <div>
            <h4 className="font-medium text-green-900">Editing users</h4>
            <p className="mt-1">
              Click any user row to open their detail panel. You can update their
              name, email, phone, roles, and manage their email aliases.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-green-900">Email aliases</h4>
            <p className="mt-1">
              Users can have multiple email addresses. The primary email is used for
              login and notifications. Aliases allow login from additional addresses
              without changing the primary email.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-green-900">Password management</h4>
            <div className="mt-2 rounded-lg border border-green-100 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-green-50 text-green-800">
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 font-medium">What it does</th>
                    <th className="px-3 py-2 font-medium">When to use</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-green-100">
                  <tr>
                    <td className="px-3 py-2 font-medium text-green-800">Create user</td>
                    <td className="px-3 py-2">Creates a <strong>new account</strong> with the given password and roles</td>
                    <td className="px-3 py-2">Someone new who has never used Golf Lessons</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-medium text-green-800">Send invite</td>
                    <td className="px-3 py-2">Sends a <strong>welcome email</strong> with login instructions to an existing account</td>
                    <td className="px-3 py-2">User was created but hasn&apos;t received or lost their invite email</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-medium text-green-800">Reset password</td>
                    <td className="px-3 py-2">Generates a new password on an <strong>existing account</strong>. Shows it once for you to share.</td>
                    <td className="px-3 py-2">Existing user forgot password, you&apos;re with them in person</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-medium text-green-800">Reset + email</td>
                    <td className="px-3 py-2">Same as reset, but also <strong>emails</strong> the new password to the user</td>
                    <td className="px-3 py-2">Existing user forgot password, not with you in person</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-green-900">Activate as Pro</h4>
            <p className="mt-1">
              Creates a pro profile for a user so they can start managing students,
              availability, and receive bookings. The user also gets the &quot;pro&quot; role
              if they don&apos;t have it yet.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-green-900">Impersonation</h4>
            <p className="mt-1">
              Admins can impersonate any member or pro account to troubleshoot
              issues. Use the impersonation feature in the top bar — it shows a
              yellow banner while active and doesn&apos;t affect the original user&apos;s session.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-green-900">Deleting users</h4>
            <p className="mt-1">
              Permanently removes the user account and all associated data. This
              action cannot be undone. Use with caution — consider deactivating
              instead when possible.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserRowActions({
  user,
  onEdit,
}: {
  user: User;
  onEdit: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  function handleResetPassword() {
    setMenuOpen(false);
    setShowReset(true);
  }

  function handleDelete() {
    setMenuOpen(false);
    if (
      !confirm(
        `Delete user ${user.firstName} ${user.lastName}? This cannot be undone.`
      )
    )
      return;
    startTransition(async () => {
      const result = await deleteUser(user.id);
      if (result.error) alert(result.error);
    });
  }

  return (
    <div className="flex items-center gap-1" ref={ref}>
      {/* Invite dialog */}
      {showInvite && (
        <InviteUserDialog
          user={user}
          onClose={() => setShowInvite(false)}
        />
      )}

      {/* Reset password dialog */}
      {showReset && (
        <ResetPasswordDialog
          user={user}
          onClose={() => setShowReset(false)}
        />
      )}

      {/* Edit icon */}
      <button
        onClick={onEdit}
        className="rounded p-1.5 text-green-500 transition-colors hover:bg-green-100 hover:text-green-700"
        title="Edit user"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
        </svg>
      </button>

      {/* More menu */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="rounded p-1.5 text-green-500 transition-colors hover:bg-green-100 hover:text-green-700"
          title="More actions"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-green-200 bg-white py-1 shadow-lg">
            {user.roles?.includes("pro_pending") && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  if (
                    !confirm(
                      `Activate ${user.firstName} ${user.lastName} as a Golf Pro? This will create a pro profile and send a notification email.`
                    )
                  )
                    return;
                  startTransition(async () => {
                    const result = await activateAsPro(user.id);
                    if (result.error) alert(result.error);
                  });
                }}
                className="block w-full px-4 py-2 text-left text-sm text-gold-600 hover:bg-gold-50"
              >
                Activate as Pro
              </button>
            )}
            <button
              onClick={() => {
                setMenuOpen(false);
                setShowInvite(true);
              }}
              className="block w-full px-4 py-2 text-left text-sm text-green-700 hover:bg-green-50"
            >
              Invite user
            </button>
            <button
              onClick={handleResetPassword}
              className="block w-full px-4 py-2 text-left text-sm text-green-700 hover:bg-green-50"
            >
              Reset password
            </button>
            <div className="my-1 border-t border-green-100" />
            {user.deletedAt ? (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  if (!confirm(`Permanently purge ${user.firstName} ${user.lastName}? This will remove all data and cannot be undone.`)) return;
                  startTransition(async () => {
                    const result = await purgeUser(user.id);
                    if (result.error) alert(result.error);
                  });
                }}
                className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                Purge permanently
              </button>
            ) : (
              <button
                onClick={handleDelete}
                className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                Delete user
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InviteUserDialog({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  // All emails for this user
  const allEmails = [
    user.email,
    ...user.emails
      .filter((e) => e.email !== user.email)
      .map((e) => e.email),
  ];

  const [sendTo, setSendTo] = useState(user.email);
  const [customEmail, setCustomEmail] = useState("");
  const [copyToMe, setCopyToMe] = useState(true);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Generate password once on mount
  const [generatedPassword] = useState(() => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    let pw = "";
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    for (const b of arr) pw += chars[b % chars.length];
    return pw;
  });

  function handleCopyPassword() {
    navigator.clipboard.writeText(generatedPassword).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleSend() {
    const targetEmail =
      sendTo === "__custom__" ? customEmail.trim().toLowerCase() : sendTo;
    if (!targetEmail) {
      setError("Please enter an email address.");
      return;
    }

    setSending(true);
    setError(null);

    const result = await sendInvite(
      user.id,
      generatedPassword,
      targetEmail,
      comment,
      copyToMe
    );

    if (result.error) {
      setError(result.error);
      setSending(false);
      return;
    }

    setSent(true);
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-12">
      <div className="w-full max-w-md rounded-xl border border-green-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-green-100 px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-green-950">
            Invite {user.firstName} {user.lastName}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-green-800/50 hover:bg-green-100"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4">
          {sent ? (
            /* Success state */
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <p className="text-sm font-medium text-green-800">
                  Invitation sent!
                </p>
                <p className="mt-1 text-sm text-green-600">
                  {user.firstName} can now log in with the credentials below.
                </p>
              </div>
              <div className="space-y-2 rounded-lg border border-green-200 bg-green-50/50 p-4">
                <div className="text-xs text-green-600">
                  Login: <span className="font-medium text-green-900">{user.email}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-green-600">
                  Password:{" "}
                  <span className="font-mono font-medium text-green-900">
                    {generatedPassword}
                  </span>
                  <button
                    onClick={handleCopyPassword}
                    className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                      copied
                        ? "bg-green-700 text-white"
                        : "border border-green-300 text-green-600 hover:bg-green-100"
                    }`}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full rounded-lg bg-green-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-800"
              >
                Done
              </button>
            </div>
          ) : (
            /* Send form */
            <div className="space-y-4">
              {/* Generated password — shown upfront */}
              <div>
                <label className="block text-sm font-medium text-green-800">
                  Generated password
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 font-mono text-sm text-green-900 select-all">
                    {generatedPassword}
                  </div>
                  <button
                    onClick={handleCopyPassword}
                    className={`rounded-lg px-3 py-2.5 text-xs font-medium transition-colors ${
                      copied
                        ? "bg-green-700 text-white"
                        : "border border-green-300 text-green-700 hover:bg-green-50"
                    }`}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-green-800">
                  Send invitation to
                </label>
                <select
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  className={inputClass + " mt-1"}
                >
                  {allEmails.map((email) => (
                    <option key={email} value={email}>
                      {email}
                    </option>
                  ))}
                  <option value="__custom__">Other email address...</option>
                </select>
                {sendTo === "__custom__" && (
                  <input
                    type="email"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="Enter email address"
                    className={inputClass + " mt-2"}
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-green-800">
                  Personal message (optional)
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="Add a personal note to the invitation..."
                  className={inputClass + " mt-1 resize-none"}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-green-700">
                <input
                  type="checkbox"
                  checked={copyToMe}
                  onChange={(e) => setCopyToMe(e.target.checked)}
                  className="h-4 w-4 rounded border-green-300 text-green-600"
                />
                Send a copy to myself
              </label>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-green-200 px-4 py-2 text-sm font-medium text-green-800 hover:bg-green-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={
                    sending ||
                    (sendTo === "__custom__" && !customEmail.trim())
                  }
                  className="rounded-lg bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
                >
                  {sending ? "Sending..." : "Send Invite"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendNotification, setSendNotification] = useState(true);

  // Generate password on mount
  const [generatedPassword] = useState(() => {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    let pw = "";
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    for (const b of arr) pw += chars[b % chars.length];
    return pw;
  });

  function handleCopy() {
    navigator.clipboard.writeText(generatedPassword).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleReset() {
    setSending(true);
    setError(null);

    const result = await resetPasswordWithNotification(
      user.id,
      generatedPassword,
      sendNotification
    );

    if (result.error) {
      setError(result.error);
      setSending(false);
      return;
    }

    setDone(true);
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-12">
      <div className="w-full max-w-md rounded-xl border border-green-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-green-100 px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-green-950">
            Reset Password
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-green-800/50 hover:bg-green-100"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4">
          {done ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <p className="text-sm font-medium text-green-800">
                  Password reset for {user.firstName} {user.lastName}
                </p>
                {sendNotification && (
                  <p className="mt-1 text-xs text-green-600">
                    A notification email has been sent to {user.email}.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 font-mono text-sm text-green-900 select-all">
                  {generatedPassword}
                </div>
                <button
                  onClick={handleCopy}
                  className={`rounded-lg px-3 py-2.5 text-xs font-medium transition-colors ${
                    copied
                      ? "bg-green-700 text-white"
                      : "border border-green-300 text-green-700 hover:bg-green-50"
                  }`}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <button
                onClick={onClose}
                className="w-full rounded-lg bg-green-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-800"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-green-700">
                Reset the password for{" "}
                <strong>{user.firstName} {user.lastName}</strong> ({user.email}).
              </p>

              <div>
                <label className="block text-sm font-medium text-green-800">
                  New password
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 font-mono text-sm text-green-900 select-all">
                    {generatedPassword}
                  </div>
                  <button
                    onClick={handleCopy}
                    className={`rounded-lg px-3 py-2.5 text-xs font-medium transition-colors ${
                      copied
                        ? "bg-green-700 text-white"
                        : "border border-green-300 text-green-700 hover:bg-green-50"
                    }`}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-green-700">
                <input
                  type="checkbox"
                  checked={sendNotification}
                  onChange={(e) => setSendNotification(e.target.checked)}
                  className="h-4 w-4 rounded border-green-300 text-green-600"
                />
                Notify the user by email
              </label>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-green-200 px-4 py-2 text-sm font-medium text-green-800 hover:bg-green-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReset}
                  disabled={sending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {sending ? "Resetting..." : "Reset Password"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UserDialog({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    async (
      prev: { error?: string; success?: boolean } | null,
      formData: FormData
    ) => {
      const result = await updateUser(prev, formData);
      if (result.success) onClose();
      return result;
    },
    null
  );

  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    user.roles?.split(",").filter(Boolean) ?? []
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-12">
      <div
        className="w-full max-w-lg rounded-xl border border-green-200 bg-white shadow-2xl"
        style={{ maxHeight: "85vh" }}
      >
        <div className="flex items-center justify-between border-b border-green-100 px-6 py-4">
          <h2 className="font-display text-xl font-semibold text-green-950">
            Edit User #{user.id}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-green-800/50 hover:bg-green-100"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
          <form action={action} className="space-y-4">
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="roles" value={selectedRoles.join(",")} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-green-800">
                  First name *
                </label>
                <input
                  name="firstName"
                  required
                  defaultValue={user.firstName}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-green-800">
                  Last name *
                </label>
                <input
                  name="lastName"
                  required
                  defaultValue={user.lastName}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-green-800">
                Email *
              </label>
              <input
                name="email"
                type="email"
                required
                defaultValue={user.email}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-green-800">
                Roles
              </label>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() =>
                      setSelectedRoles((prev) =>
                        prev.includes(role)
                          ? prev.filter((r) => r !== role)
                          : [...prev, role]
                      )
                    }
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      selectedRoles.includes(role)
                        ? "bg-green-700 text-white"
                        : "border border-green-300 text-green-600 hover:bg-green-50"
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            {state?.error && (
              <p className="text-sm text-red-600">{state.error}</p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-green-200 px-4 py-2 text-sm font-medium text-green-800 hover:bg-green-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
              >
                {pending ? "Saving..." : "Save"}
              </button>
            </div>
          </form>

          {/* Email aliases */}
          <div className="mt-6 border-t border-green-100 pt-6">
            <h3 className="text-sm font-semibold text-green-800">
              Email Addresses
            </h3>
            <div className="mt-3 space-y-2">
              {user.emails.map((e) => (
                <EmailRow key={e.id} entry={e} userId={user.id} />
              ))}
            </div>
            <AddEmailForm userId={user.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const [selectedRoles, setSelectedRoles] = useState<string[]>(["member"]);
  const [state, action, pending] = useActionState(
    async (
      prev: { error?: string; success?: boolean } | null,
      formData: FormData
    ) => {
      const result = await createUser(prev, formData);
      if (result.success) onClose();
      return result;
    },
    null
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-12">
      <div className="w-full max-w-lg rounded-xl border border-green-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-green-100 px-6 py-4">
          <h2 className="font-display text-xl font-semibold text-green-950">
            Add User
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-green-800/50 hover:bg-green-100">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4">
          <form action={action} className="space-y-4">
            <input type="hidden" name="roles" value={selectedRoles.join(",")} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-green-800">First name *</label>
                <input name="firstName" required className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-green-800">Last name *</label>
                <input name="lastName" required className={inputClass} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-green-800">Email *</label>
              <input name="email" type="email" required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-green-800">Password</label>
              <input name="password" type="password" className={inputClass} />
              <p className="mt-1 text-xs text-green-500">Leave blank to create without password.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-green-800">Roles</label>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() =>
                      setSelectedRoles((prev) =>
                        prev.includes(role)
                          ? prev.filter((r) => r !== role)
                          : [...prev, role]
                      )
                    }
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      selectedRoles.includes(role)
                        ? "bg-green-700 text-white"
                        : "border border-green-300 text-green-600 hover:bg-green-50"
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>
            {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-green-200 px-4 py-2 text-sm font-medium text-green-800 hover:bg-green-50">
                Cancel
              </button>
              <button type="submit" disabled={pending} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
                {pending ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function EmailRow({
  entry,
  userId,
}: {
  entry: UserEmail;
  userId: number;
}) {
  const [, startTransition] = useTransition();

  function handleRemove() {
    if (!confirm(`Remove ${entry.email}?`)) return;
    startTransition(async () => {
      const result = await removeUserEmail(entry.id);
      if (result.error) alert(result.error);
    });
  }

  return (
    <div className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-green-800">{entry.email}</span>
        {entry.label && (
          <span className="rounded-full bg-green-200 px-2 py-0.5 text-[10px] text-green-700">
            {entry.label}
          </span>
        )}
        {entry.isPrimary && (
          <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-medium text-gold-700">
            primary
          </span>
        )}
      </div>
      {!entry.isPrimary && (
        <button
          onClick={handleRemove}
          className="text-xs text-red-400 hover:text-red-600"
        >
          Remove
        </button>
      )}
    </div>
  );
}

function AddEmailForm({ userId }: { userId: number }) {
  const [state, action, pending] = useActionState(addUserEmail, null);

  return (
    <form action={action} className="mt-3 flex gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input
        name="email"
        type="email"
        placeholder="Add email..."
        required
        className={inputClass + " flex-1"}
      />
<button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-green-800 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        Add
      </button>
      {state?.error && (
        <span className="self-center text-xs text-red-500">{state.error}</span>
      )}
    </form>
  );
}
