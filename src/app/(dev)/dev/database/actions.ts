"use server";

import { neon } from "@neondatabase/serverless";
import { getSession, hasRole } from "@/lib/auth";

// ─── Auth ──────────────────────────────────────────────

async function requireDev() {
  const session = await getSession();
  if (!session || !hasRole(session, "dev")) {
    throw new Error("Unauthorized");
  }
}

// ─── Connection ────────────────────────────────────────

function getSql() {
  const url =
    process.env.POSTGRES_URL_PREVIEW_NON_POOLING ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL!;
  return neon(url);
}

// ─── Metadata helpers ──────────────────────────────────

let tableListCache: string[] | null = null;

async function loadTableList(): Promise<string[]> {
  if (tableListCache) return tableListCache;
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  )) as { table_name: string }[];
  tableListCache = rows.map((r) => r.table_name);
  return tableListCache;
}

async function validateTable(table: string): Promise<string> {
  const list = await loadTableList();
  if (!list.includes(table)) {
    throw new Error(`Unknown table: ${table}`);
  }
  return table;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimary: boolean;
  isSerial: boolean;
}

export async function getTableSchema(table: string): Promise<ColumnInfo[]> {
  await requireDev();
  const safeTable = await validateTable(table);
  const sql = getSql();

  // Column list with data type and nullability
  const cols = (await sql.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [safeTable]
  )) as {
    column_name: string;
    data_type: string;
    is_nullable: "YES" | "NO";
    column_default: string | null;
  }[];

  // Primary key columns
  const pks = (await sql.query(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public'
       AND tc.table_name = $1
       AND tc.constraint_type = 'PRIMARY KEY'`,
    [safeTable]
  )) as { column_name: string }[];
  const pkSet = new Set(pks.map((p) => p.column_name));

  return cols.map((c) => ({
    name: c.column_name,
    dataType: c.data_type,
    isNullable: c.is_nullable === "YES",
    isPrimary: pkSet.has(c.column_name),
    isSerial: !!c.column_default?.startsWith("nextval("),
  }));
}

// ─── Table list with counts ────────────────────────────

export interface TableSummary {
  name: string;
  rowCount: number;
}

export async function listTables(): Promise<TableSummary[]> {
  await requireDev();
  const names = await loadTableList();
  const sql = getSql();

  const results: TableSummary[] = [];
  for (const name of names) {
    try {
      const rows = (await sql.query(
        `SELECT count(*)::int AS c FROM ${name}`
      )) as { c: number }[];
      results.push({ name, rowCount: rows[0]?.c ?? 0 });
    } catch {
      results.push({ name, rowCount: -1 });
    }
  }
  return results;
}

// ─── Query table rows ──────────────────────────────────

export interface QueryOptions {
  page: number;
  pageSize: number;
  sortColumn?: string;
  sortOrder?: "asc" | "desc";
  filterColumn?: string;
  filterValue?: string;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  total: number;
}

export async function queryTable(
  table: string,
  opts: QueryOptions
): Promise<QueryResult> {
  await requireDev();
  const safeTable = await validateTable(table);
  const schema = await getTableSchema(safeTable);
  const colNames = new Set(schema.map((c) => c.name));
  const sql = getSql();

  const page = Math.max(1, Math.floor(opts.page || 1));
  const pageSize = Math.min(500, Math.max(1, Math.floor(opts.pageSize || 50)));

  // Validate sort/filter columns
  const sortCol =
    opts.sortColumn && colNames.has(opts.sortColumn) ? opts.sortColumn : null;
  const sortOrder = opts.sortOrder === "desc" ? "desc" : "asc";
  const filterCol =
    opts.filterColumn && colNames.has(opts.filterColumn)
      ? opts.filterColumn
      : null;
  const filterVal = opts.filterValue?.trim() ?? "";

  // Build WHERE clause
  let whereClause = "";
  const params: unknown[] = [];
  if (filterCol && filterVal.length > 0) {
    params.push(`%${filterVal}%`);
    whereClause = `WHERE CAST("${filterCol}" AS text) ILIKE $${params.length}`;
  }

  // Count
  const countRows = (await sql.query(
    `SELECT count(*)::int AS c FROM ${safeTable} ${whereClause}`,
    params
  )) as { c: number }[];
  const total = countRows[0]?.c ?? 0;

  // Build ORDER BY
  let orderClause = "";
  if (sortCol) {
    orderClause = `ORDER BY "${sortCol}" ${sortOrder} NULLS LAST`;
  } else {
    // Default sort by primary key if available
    const pk = schema.find((c) => c.isPrimary);
    if (pk) orderClause = `ORDER BY "${pk.name}" asc`;
  }

  // Pagination
  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);
  const rows = (await sql.query(
    `SELECT * FROM ${safeTable} ${whereClause} ${orderClause} LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )) as Record<string, unknown>[];

  return { rows, total };
}

// ─── Mutations ─────────────────────────────────────────

const JSONB_COLUMNS = new Set([
  "golf_goals",
  "blocks",
  "metadata",
  "lesson_durations",
  "sections",
  "assignee_ids",
  "shared_with_ids",
  "checklist",
  "attachments",
  "payload",
]);

function parseValueForColumn(
  rawValue: string | null,
  col: ColumnInfo
): unknown {
  if (rawValue === null) return null;
  const trimmed = rawValue.trim();
  if (trimmed === "" && col.isNullable) return null;

  if (JSONB_COLUMNS.has(col.name) || col.dataType === "jsonb") {
    try {
      return JSON.parse(trimmed === "" ? "null" : trimmed);
    } catch {
      throw new Error(`Invalid JSON in column ${col.name}`);
    }
  }

  if (col.dataType === "boolean") {
    return trimmed === "true" || trimmed === "1" || trimmed === "yes";
  }
  if (
    col.dataType === "integer" ||
    col.dataType === "bigint" ||
    col.dataType === "smallint" ||
    col.dataType === "numeric"
  ) {
    if (trimmed === "") return col.isNullable ? null : 0;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) throw new Error(`Invalid number in ${col.name}`);
    return n;
  }

  return trimmed;
}

function getPrimaryKey(schema: ColumnInfo[]): ColumnInfo {
  const pk = schema.find((c) => c.isPrimary);
  if (!pk) throw new Error("Table has no primary key");
  return pk;
}

export async function updateRow(
  table: string,
  pkValue: string | number,
  values: Record<string, string | null>
): Promise<void> {
  await requireDev();
  const safeTable = await validateTable(table);
  const schema = await getTableSchema(safeTable);
  const pk = getPrimaryKey(schema);
  const sql = getSql();

  // Only allow editing non-PK, non-serial columns
  const editableCols = schema.filter((c) => !c.isPrimary && !c.isSerial);
  const assignments: string[] = [];
  const params: unknown[] = [];
  for (const col of editableCols) {
    if (!(col.name in values)) continue;
    const parsed = parseValueForColumn(values[col.name], col);
    params.push(
      JSONB_COLUMNS.has(col.name) || col.dataType === "jsonb"
        ? JSON.stringify(parsed)
        : parsed
    );
    const cast =
      JSONB_COLUMNS.has(col.name) || col.dataType === "jsonb"
        ? `::jsonb`
        : "";
    assignments.push(`"${col.name}" = $${params.length}${cast}`);
  }

  if (assignments.length === 0) return;
  params.push(pkValue);

  await sql.query(
    `UPDATE ${safeTable} SET ${assignments.join(", ")} WHERE "${pk.name}" = $${params.length}`,
    params
  );
}

export async function deleteRow(
  table: string,
  pkValue: string | number
): Promise<void> {
  await requireDev();
  const safeTable = await validateTable(table);
  const schema = await getTableSchema(safeTable);
  const pk = getPrimaryKey(schema);
  const sql = getSql();

  await sql.query(
    `DELETE FROM ${safeTable} WHERE "${pk.name}" = $1`,
    [pkValue]
  );
}
