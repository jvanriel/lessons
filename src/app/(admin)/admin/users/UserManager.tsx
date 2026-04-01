"use client";

import { useState, useActionState, useTransition, useRef, useEffect } from "react";
import {
  createUser,
  updateUser,
  deleteUser,
  resetPassword,
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
  emails: UserEmail[];
}

const ROLES = ["member", "admin", "pro", "dev"];

const inputClass =
  "block w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

export default function UserManager({ users }: { users: User[] }) {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

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
    <div className="mt-6">
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
              <tr key={user.id} className="hover:bg-green-50/50">
                <td className="px-4 py-3 text-green-900">
                  {user.firstName} {user.lastName}
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
                    ? new Date(user.lastLoginAt).toLocaleDateString()
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
  const [, startTransition] = useTransition();
  const [resetResult, setResetResult] = useState<string | null>(null);
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
    if (!confirm(`Reset password for ${user.firstName} ${user.lastName}?`))
      return;
    startTransition(async () => {
      const result = await resetPassword(user.id);
      if (result.error) alert(result.error);
      else if (result.password) {
        setResetResult(result.password);
      }
    });
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
      {/* Reset password result */}
      {resetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl border border-green-200 bg-white p-6 shadow-2xl">
            <h3 className="font-display text-lg font-semibold text-green-900">
              Password Reset
            </h3>
            <p className="mt-2 text-sm text-green-700">
              New password for {user.firstName} {user.lastName}:
            </p>
            <div className="mt-3 rounded-lg bg-green-50 px-4 py-3 font-mono text-sm text-green-900 select-all">
              {resetResult}
            </div>
            <p className="mt-2 text-xs text-green-500">
              Copy this password — it won't be shown again.
            </p>
            <button
              onClick={() => setResetResult(null)}
              className="mt-4 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
            >
              Done
            </button>
          </div>
        </div>
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
            <button
              onClick={handleResetPassword}
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
            <button
              onClick={handleDelete}
              className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
            >
              Delete user
            </button>
          </div>
        )}
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
