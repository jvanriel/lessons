import Link from "next/link";
import { listTables } from "./actions";
import PageHeading from "@/components/app/PageHeading";

export const metadata = { title: "Database — Dev — Golf Lessons" };

export default async function DatabasePage() {
  const tables = await listTables();

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <PageHeading
        title="Database"
        subtitle="Browse and edit records. Handle with care — writes go straight to the database."
        helpSlug="dev.database"
        locale="en"
      />

      <div className="mt-8 rounded-xl border border-green-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-green-100 text-left text-xs text-green-500">
              <th className="px-4 py-2.5 font-medium">Table</th>
              <th className="px-4 py-2.5 font-medium text-right">Rows</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {tables.map((t) => (
              <tr
                key={t.name}
                className="border-b border-green-50 hover:bg-green-50/50"
              >
                <td className="px-4 py-2.5 font-mono text-green-900">
                  {t.name}
                </td>
                <td className="px-4 py-2.5 text-right text-green-500">
                  {t.rowCount >= 0 ? t.rowCount.toLocaleString() : "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/dev/database/${t.name}`}
                    className="text-xs text-gold-600 hover:text-gold-500"
                  >
                    Browse &rarr;
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
