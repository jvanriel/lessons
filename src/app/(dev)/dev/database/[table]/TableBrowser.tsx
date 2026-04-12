"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { queryTable, updateRow, deleteRow, type ColumnInfo } from "../actions";

interface TableBrowserProps {
  table: string;
  schema: ColumnInfo[];
}

const PAGE_SIZE = 50;

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" && value.length > 100) {
    return value.slice(0, 100) + "…";
  }
  return String(value);
}

function toEditableString(value: unknown, col: ColumnInfo): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  if (col.dataType === "boolean") return value ? "true" : "false";
  return String(value);
}

export default function TableBrowser({ table, schema }: TableBrowserProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [filterColumn, setFilterColumn] = useState<string>(
    schema.find((c) => c.isPrimary)?.name || schema[0]?.name || ""
  );
  const [filterValue, setFilterValue] = useState("");
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState<Record<string, unknown> | null>(
    null
  );
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const pk = schema.find((c) => c.isPrimary);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(() => {
    startTransition(async () => {
      try {
        const result = await queryTable(table, {
          page,
          pageSize: PAGE_SIZE,
          sortColumn,
          sortOrder,
          filterColumn: filterValue ? filterColumn : undefined,
          filterValue: filterValue || undefined,
        });
        setRows(result.rows);
        setTotal(result.total);
      } catch (e) {
        setStatus({
          type: "error",
          message: `Query failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    });
  }, [table, page, sortColumn, sortOrder, filterColumn, filterValue]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleSort(column: string) {
    if (sortColumn === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortOrder("asc");
    }
    setPage(1);
  }

  function handleFilterChange(value: string) {
    setFilterValue(value);
    setPage(1);
  }

  async function handleSaveEdit(values: Record<string, string>) {
    if (!editing || !pk) return;
    setStatus(null);
    try {
      await updateRow(table, editing[pk.name] as string | number, values);
      setStatus({ type: "success", message: "Row updated." });
      setEditing(null);
      load();
    } catch (e) {
      setStatus({
        type: "error",
        message: `Update failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  async function handleConfirmDelete() {
    if (!deleting || !pk) return;
    setStatus(null);
    try {
      await deleteRow(table, deleting[pk.name] as string | number);
      setStatus({ type: "success", message: "Row deleted." });
      setDeleting(null);
      load();
    } catch (e) {
      setStatus({
        type: "error",
        message: `Delete failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={filterColumn}
          onChange={(e) => setFilterColumn(e.target.value)}
          className="rounded-md border border-green-200 bg-white px-2 py-1.5 text-xs text-green-900"
        >
          {schema.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={filterValue}
          onChange={(e) => handleFilterChange(e.target.value)}
          placeholder="Filter (contains)…"
          className="flex-1 min-w-[200px] rounded-md border border-green-200 bg-white px-3 py-1.5 text-xs text-green-900 placeholder:text-green-400"
        />
        <button
          onClick={() => {
            setFilterValue("");
            setPage(1);
          }}
          className="rounded-md border border-green-200 px-3 py-1.5 text-xs text-green-700 hover:bg-green-50"
        >
          Clear
        </button>
        <span className="text-xs text-green-500">
          {total.toLocaleString()} rows · page {page}/{pages}
        </span>
      </div>

      {status && (
        <div
          className={`mb-3 rounded-md px-3 py-2 text-xs ${
            status.type === "success"
              ? "border border-green-200 bg-green-50 text-green-800"
              : "border border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {status.message}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-green-200 bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-green-100 text-left text-green-500">
              {schema.map((c) => {
                const isSorted = sortColumn === c.name;
                return (
                  <th
                    key={c.name}
                    className="cursor-pointer whitespace-nowrap px-3 py-2 font-medium hover:bg-green-50"
                    onClick={() => toggleSort(c.name)}
                    title={c.dataType}
                  >
                    <span className={c.isPrimary ? "text-gold-600" : ""}>
                      {c.name}
                    </span>
                    {isSorted && (
                      <span className="ml-1">
                        {sortOrder === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </th>
                );
              })}
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !isPending && (
              <tr>
                <td
                  colSpan={schema.length + 1}
                  className="px-3 py-8 text-center text-green-400"
                >
                  No rows
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr
                key={pk ? String(row[pk.name]) : i}
                className="border-b border-green-50 hover:bg-green-50/50"
              >
                {schema.map((c) => (
                  <td
                    key={c.name}
                    className="whitespace-nowrap px-3 py-1.5 font-mono text-green-800"
                  >
                    {formatCell(row[c.name])}
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-1.5 text-right">
                  {pk && (
                    <button
                      onClick={() => setEditing(row)}
                      className="text-xs text-gold-600 hover:text-gold-500"
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page <= 1 || isPending}
          className="rounded-md border border-green-200 px-3 py-1.5 text-xs text-green-700 hover:bg-green-50 disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="text-xs text-green-500">
          Page {page} of {pages}
        </span>
        <button
          onClick={() => setPage(Math.min(pages, page + 1))}
          disabled={page >= pages || isPending}
          className="rounded-md border border-green-200 px-3 py-1.5 text-xs text-green-700 hover:bg-green-50 disabled:opacity-40"
        >
          Next →
        </button>
      </div>

      {/* Edit dialog */}
      {editing && pk && (
        <EditDialog
          schema={schema}
          row={editing}
          onClose={() => setEditing(null)}
          onSave={handleSaveEdit}
          onDelete={() => {
            setDeleting(editing);
            setEditing(null);
          }}
          pkName={pk.name}
        />
      )}

      {/* Delete confirmation */}
      {deleting && pk && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDeleting(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-red-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-medium text-red-900">
              Delete row {String(deleting[pk.name])}?
            </p>
            <p className="mt-2 text-xs text-red-700">
              This removes the row from <code>{table}</code>. Cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleting(null)}
                className="rounded-md border border-green-200 px-3 py-1.5 text-xs text-green-800 hover:bg-green-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Edit dialog ───────────────────────────────────────

interface EditDialogProps {
  schema: ColumnInfo[];
  row: Record<string, unknown>;
  pkName: string;
  onClose: () => void;
  onSave: (values: Record<string, string>) => void;
  onDelete: () => void;
}

function EditDialog({
  schema,
  row,
  pkName,
  onClose,
  onSave,
  onDelete,
}: EditDialogProps) {
  const editableCols = schema.filter((c) => !c.isPrimary && !c.isSerial);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const c of editableCols) {
      initial[c.name] = toEditableString(row[c.name], c);
    }
    return initial;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-green-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-green-100 px-5 py-3">
          <h3 className="font-medium text-green-950">
            Edit row{" "}
            <span className="font-mono text-sm text-gold-600">
              {String(row[pkName])}
            </span>
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-green-400 hover:bg-green-50 hover:text-green-700"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 4l10 10M14 4L4 14" />
            </svg>
          </button>
        </div>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4">
          {editableCols.map((c) => {
            const isMultiline =
              c.dataType === "jsonb" ||
              c.dataType === "text" ||
              values[c.name]?.includes("\n") ||
              (values[c.name]?.length ?? 0) > 60;
            return (
              <div key={c.name}>
                <label className="flex items-baseline justify-between text-xs font-medium text-green-800">
                  <span>{c.name}</span>
                  <span className="text-[10px] text-green-400">
                    {c.dataType}
                    {c.isNullable ? " · nullable" : ""}
                  </span>
                </label>
                {isMultiline ? (
                  <textarea
                    value={values[c.name] ?? ""}
                    onChange={(e) =>
                      setValues({ ...values, [c.name]: e.target.value })
                    }
                    rows={5}
                    className="mt-1 block w-full rounded-md border border-green-200 bg-white px-3 py-2 font-mono text-xs text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                  />
                ) : (
                  <input
                    type="text"
                    value={values[c.name] ?? ""}
                    onChange={(e) =>
                      setValues({ ...values, [c.name]: e.target.value })
                    }
                    className="mt-1 block w-full rounded-md border border-green-200 bg-white px-3 py-2 font-mono text-xs text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-between gap-2 border-t border-green-100 px-5 py-3">
          <button
            onClick={onDelete}
            className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            Delete row
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-green-200 px-3 py-1.5 text-xs text-green-800 hover:bg-green-50"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(values)}
              className="rounded-md bg-gold-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-gold-500"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
