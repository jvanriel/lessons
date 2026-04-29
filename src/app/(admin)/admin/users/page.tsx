import { db } from "@/lib/db";
import { users, userEmails, proProfiles } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import UserManager from "./UserManager";

export const metadata = { title: "Users — Admin — Golf Lessons" };

export default async function AdminUsersPage() {
  const [allUsers, allEmails, allProProfiles] = await Promise.all([
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        roles: users.roles,
        lastLoginAt: users.lastLoginAt,
        deletedAt: users.deletedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt)),
    db.select().from(userEmails),
    db
      .select({
        userId: proProfiles.userId,
        subscriptionStatus: proProfiles.subscriptionStatus,
      })
      .from(proProfiles),
  ]);

  const subscriptionByUser: Record<number, string> = {};
  for (const p of allProProfiles) {
    subscriptionByUser[p.userId] = p.subscriptionStatus;
  }

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
    deletedAt: u.deletedAt?.toISOString() ?? null,
    createdAt: u.createdAt?.toISOString() ?? null,
    emails: emailsByUser[u.id] ?? [],
    subscriptionStatus: subscriptionByUser[u.id] ?? null,
  }));

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <UserManager users={serialized} />
    </div>
  );
}
