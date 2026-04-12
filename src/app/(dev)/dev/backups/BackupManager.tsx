"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import {
  triggerBackup,
  getBackupList,
  getBackupContent,
  restoreBackup,
  removeBackup,
} from "./actions";
import type { BackupMeta } from "@/lib/backup";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function filenameFromPath(pathname: string): string {
  return pathname.split("/").pop() || pathname;
}

export default function BackupManager() {
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [viewDialog, setViewDialog] = useState<{
    name: string;
    content: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    startTransition(async () => {
      try {
        const list = await getBackupList();
        setBackups(list);
      } catch {
        setStatus({ type: "error", message: "Could not load backups." });
      }
    });
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCreateBackup() {
    setStatus(null);
    startTransition(async () => {
      try {
        await triggerBackup();
        setStatus({ type: "success", message: "Backup created." });
        load();
      } catch (e) {
        setStatus({
          type: "error",
          message: `Backup failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    });
  }

  async function handleView(url: string, pathname: string) {
    const content = await getBackupContent(url);
    try {
      const formatted = JSON.stringify(JSON.parse(content), null, 2);
      setViewDialog({
        name: filenameFromPath(pathname),
        content: formatted,
      });
    } catch {
      setViewDialog({ name: filenameFromPath(pathname), content });
    }
    setCopied(false);
  }

  function handleRestore(url: string) {
    setStatus(null);
    setConfirmRestore(null);
    startTransition(async () => {
      try {
        const result = await restoreBackup(url);
        const summary = Object.entries(result.tablesRestored)
          .map(([table, count]) => `${table}: ${count}`)
          .join(", ");
        setStatus({ type: "success", message: `Restored — ${summary}` });
      } catch (e) {
        setStatus({
          type: "error",
          message: `Restore failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    });
  }

  function handleDelete(url: string) {
    setStatus(null);
    setConfirmDelete(null);
    startTransition(async () => {
      try {
        await removeBackup(url);
        setStatus({ type: "success", message: "Backup deleted." });
        load();
      } catch {
        setStatus({ type: "error", message: "Delete failed." });
      }
    });
  }

  return (
    <div className="mt-6">
      {/* Actions bar */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={handleCreateBackup}
          disabled={isPending}
          className="rounded-lg bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
        >
          {isPending ? "Working..." : "Create backup"}
        </button>
      </div>

      {/* Status message */}
      {status && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${
            status.type === "success"
              ? "border border-green-200 bg-green-50 text-green-800"
              : "border border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {status.message}
        </div>
      )}

      {/* Backup list */}
      <div className="rounded-xl border border-green-200 bg-white">
        {isPending && backups.length === 0 && (
          <div className="p-8 text-center text-sm text-green-500">
            Loading...
          </div>
        )}

        {(!isPending || backups.length > 0) && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-green-100 text-left text-xs text-green-500">
                <th className="px-4 py-2.5 font-medium">File</th>
                <th className="px-4 py-2.5 font-medium">Size</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {backups.map((backup) => (
                <tr
                  key={backup.url}
                  className="border-b border-green-50 hover:bg-green-50/50"
                >
                  <td className="px-4 py-2.5 text-green-900">
                    {filenameFromPath(backup.pathname)}
                  </td>
                  <td className="px-4 py-2.5 text-green-500">
                    {formatSize(backup.size)}
                  </td>
                  <td className="px-4 py-2.5 text-green-500">
                    {new Date(backup.uploadedAt).toLocaleString()}
                  </td>
                  <td className="flex gap-2 px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => handleView(backup.url, backup.pathname)}
                      className="text-green-600 hover:text-green-800"
                      title="View"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M1.5 8s2.5-5 6.5-5 6.5 5 6.5 5-2.5 5-6.5 5S1.5 8 1.5 8z" />
                        <circle cx="8" cy="8" r="2" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const content = await getBackupContent(backup.url);
                        const blob = new Blob([content], {
                          type: "application/json",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = filenameFromPath(backup.pathname);
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                      }}
                      className="text-green-600 hover:text-green-800"
                      title="Download"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M8 2v8m0 0l-3-3m3 3l3-3M3 12h10" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRestore(backup.url)}
                      className="rounded border border-green-200 px-2 py-1 text-xs text-green-700 hover:bg-green-50"
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(backup.url)}
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}

              {backups.length === 0 && !isPending && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-green-400"
                  >
                    No backups yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* View content dialog */}
      {viewDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setViewDialog(null)}
        >
          <div
            className="mx-4 flex w-full max-w-2xl flex-col rounded-xl border border-green-200 bg-white shadow-xl"
            style={{ maxHeight: "80vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-green-100 px-5 py-3">
              <h3 className="truncate font-medium text-green-950">
                {viewDialog.name}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(viewDialog.content);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-white px-2.5 py-1 text-xs text-green-800 hover:bg-green-50"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={() => setViewDialog(null)}
                  className="text-green-400 hover:text-green-700"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M5 5l10 10M15 5L5 15" />
                  </svg>
                </button>
              </div>
            </div>
            <pre className="overflow-auto p-5 text-xs leading-relaxed text-green-900">
              {viewDialog.content}
            </pre>
          </div>
        </div>
      )}

      {/* Restore confirmation dialog */}
      {confirmRestore && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setConfirmRestore(null)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-xl border border-red-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-medium text-red-900">Restore database?</p>
            <p className="mt-2 text-sm text-red-700">
              This replaces all current data with the backup. This action
              cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRestore(null)}
                className="rounded-lg border border-green-200 px-3 py-1.5 text-sm text-green-800 hover:bg-green-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRestore(confirmRestore)}
                disabled={isPending}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? "Restoring..." : "Restore"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-xl border border-green-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-green-900">
              Delete this backup permanently?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded-lg border border-green-200 px-3 py-1.5 text-sm text-green-800 hover:bg-green-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete)}
                disabled={isPending}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
