import { db } from "@/lib/db";
import { users, userEmails } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import UserManager from "./UserManager";

export const metadata = { title: "Users — Admin — Golf Lessons" };

export default async function AdminUsersPage() {
  const [allUsers, allEmails] = await Promise.all([
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        roles: users.roles,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt)),
    db.select().from(userEmails),
  ]);

  const emailsByUser: Record<
    number,
    Array<{
      id: number;
      email: string;
      label: string | null;
      isPrimary: boolean;
    }>
  > = {};
  for (const e of allEmails) {
    (emailsByUser[e.userId] ??= []).push({
      id: e.id,
      email: e.email,
      label: e.label,
      isPrimary: e.isPrimary,
    });
  }

  const serialized = allUsers.map((u) => ({
    ...u,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt?.toISOString() ?? null,
    emails: emailsByUser[u.id] ?? [],
  }));

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-900">
        Users
      </h1>
      <UserManager users={serialized} />
    </div>
  );
}
