import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const metadata = { title: "Users — Admin — Golf Lessons" };

export default async function AdminUsersPage() {
  const allUsers = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      roles: users.roles,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-900">
        Users
      </h1>
      <div className="mt-8 overflow-hidden rounded-xl border border-green-200 bg-white">
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
            </tr>
          </thead>
          <tbody className="divide-y divide-green-50">
            {allUsers.map((user) => (
              <tr key={user.id} className="hover:bg-green-50/50">
                <td className="px-4 py-3 text-green-900">
                  {user.firstName} {user.lastName}
                </td>
                <td className="px-4 py-3 text-green-600">{user.email}</td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
