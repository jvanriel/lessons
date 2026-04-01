import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export const metadata = { title: "Database — Dev — Golf Lessons" };

export default async function DatabasePage() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-900">
        Database
      </h1>
      <div className="mt-8 space-y-4">
        <div className="rounded-xl border border-green-200 bg-white p-6">
          <h2 className="font-medium text-green-800">Tables</h2>
          <ul className="mt-3 space-y-2 text-sm text-green-600">
            <li>
              users — <span className="text-green-500">{count} rows</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
