import Link from "next/link";
import { notFound } from "next/navigation";
import { getTableSchema, listTables } from "../actions";
import TableBrowser from "./TableBrowser";

export const metadata = { title: "Table — Dev — Golf Lessons" };

export default async function TablePage({
  params,
}: {
  params: Promise<{ table: string }>;
}) {
  const { table } = await params;

  // Check the table exists before rendering
  const all = await listTables();
  if (!all.find((t) => t.name === table)) {
    notFound();
  }

  const schema = await getTableSchema(table);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/dev/database"
          className="text-green-500 hover:text-green-700"
        >
          Database
        </Link>
        <span className="text-green-400">/</span>
        <span className="font-mono text-green-900">{table}</span>
      </div>

      <h1 className="mt-2 font-display text-3xl font-semibold text-green-950">
        {table}
      </h1>
      <p className="mt-2 text-sm text-green-600">
        {schema.length} columns.{" "}
        {schema.filter((c) => c.isPrimary).map((c) => c.name).join(", ") ||
          "No primary key"}{" "}
        is the primary key.
      </p>

      <div className="mt-6">
        <TableBrowser table={table} schema={schema} />
      </div>
    </div>
  );
}
