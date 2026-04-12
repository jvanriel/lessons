"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import {
  listFolder,
  deleteBlob,
  getBlobContent,
  type FolderListing,
  type BlobFile,
} from "./actions";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function isImage(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(name);
}
function isVideo(name: string): boolean {
  return /\.(mp4|mov|webm|ogv)$/i.test(name);
}
function isText(name: string): boolean {
  return /\.(json|txt|md|log|csv|xml|html|css|js|ts|yaml|yml)$/i.test(name);
}

export default function BlobBrowser() {
  const [prefix, setPrefix] = useState("");
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BlobFile | null>(null);
  const [viewing, setViewing] = useState<BlobFile | null>(null);
  const [viewContent, setViewContent] = useState<string | null>(null);

  const load = useCallback((p: string) => {
    setStatus(null);
    startTransition(async () => {
      try {
        const result = await listFolder(p);
        setListing(result);
      } catch (e) {
        setStatus({
          type: "error",
          message: `Failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    });
  }, []);

  useEffect(() => {
    load(prefix);
  }, [prefix, load]);

  function navigate(newPrefix: string) {
    setPrefix(newPrefix);
  }

  async function handleView(file: BlobFile) {
    setViewing(file);
    setViewContent(null);
    if (isText(file.name) || file.name.endsWith(".json")) {
      try {
        const text = await getBlobContent(file.url);
        try {
          setViewContent(JSON.stringify(JSON.parse(text), null, 2));
        } catch {
          setViewContent(text);
        }
      } catch {
        setViewContent("(failed to load)");
      }
    }
  }

  async function handleDownload(file: BlobFile) {
    try {
      const res = await fetch(file.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setStatus({
        type: "error",
        message: `Download failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    const file = confirmDelete;
    setConfirmDelete(null);
    setStatus(null);
    try {
      await deleteBlob(file.url);
      setStatus({ type: "success", message: `Deleted ${file.name}` });
      load(prefix);
    } catch (e) {
      setStatus({
        type: "error",
        message: `Delete failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  // Breadcrumb
  const parts = prefix
    .replace(/\/$/, "")
    .split("/")
    .filter((s) => s.length > 0);
  const crumbs = parts.map((part, i) => ({
    label: part,
    prefix: parts.slice(0, i + 1).join("/") + "/",
  }));

  const canGoUp = prefix.length > 0;
  const parent = canGoUp
    ? parts.slice(0, -1).join("/") + (parts.length > 1 ? "/" : "")
    : "";

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <button
          onClick={() => navigate("")}
          className="font-mono text-green-500 hover:text-green-800"
        >
          root
        </button>
        {crumbs.map((c) => (
          <span key={c.prefix} className="flex items-center gap-1">
            <span className="text-green-300">/</span>
            <button
              onClick={() => navigate(c.prefix)}
              className="font-mono text-green-700 hover:text-green-900"
            >
              {c.label}
            </button>
          </span>
        ))}
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

      {/* Listing */}
      <div className="rounded-xl border border-green-200 bg-white">
        {isPending && !listing && (
          <div className="p-8 text-center text-xs text-green-500">
            Loading...
          </div>
        )}

        {listing && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-green-100 text-left text-green-500">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 text-right font-medium">Size</th>
                <th className="px-4 py-2 font-medium">Uploaded</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {canGoUp && (
                <tr
                  className="cursor-pointer border-b border-green-50 hover:bg-green-50/50"
                  onClick={() => navigate(parent)}
                >
                  <td className="px-4 py-2 font-mono text-green-700">
                    <span className="mr-1">↑</span>.. (parent)
                  </td>
                  <td colSpan={3}></td>
                </tr>
              )}

              {listing.folders.map((f) => (
                <tr
                  key={f.prefix}
                  className="cursor-pointer border-b border-green-50 hover:bg-green-50/50"
                  onClick={() => navigate(f.prefix)}
                >
                  <td className="px-4 py-2 font-mono text-green-900">
                    <span className="mr-1">📁</span>
                    {f.name}/
                  </td>
                  <td colSpan={3}></td>
                </tr>
              ))}

              {listing.files.map((file) => (
                <tr
                  key={file.url}
                  className="border-b border-green-50 hover:bg-green-50/50"
                >
                  <td className="px-4 py-2 font-mono text-green-900">
                    <span className="mr-1">📄</span>
                    {file.name}
                  </td>
                  <td className="px-4 py-2 text-right text-green-500">
                    {formatSize(file.size)}
                  </td>
                  <td className="px-4 py-2 text-green-500">
                    {new Date(file.uploadedAt).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      onClick={() => handleView(file)}
                      className="mr-2 text-gold-600 hover:text-gold-500"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleDownload(file)}
                      className="mr-2 text-green-600 hover:text-green-800"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => setConfirmDelete(file)}
                      className="text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}

              {!isPending &&
                listing.folders.length === 0 &&
                listing.files.length === 0 &&
                !canGoUp && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-green-400"
                    >
                      Empty
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        )}
      </div>

      {/* View dialog */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10"
          onClick={() => setViewing(null)}
        >
          <div
            className="w-full max-w-3xl rounded-xl border border-green-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-green-100 px-5 py-3">
              <h3 className="truncate font-mono text-sm text-green-900">
                {viewing.name}
              </h3>
              <button
                onClick={() => setViewing(null)}
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
            <div className="max-h-[70vh] overflow-auto p-5">
              {isImage(viewing.name) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={viewing.url}
                  alt={viewing.name}
                  className="mx-auto max-h-[60vh] rounded-md"
                />
              ) : isVideo(viewing.name) ? (
                <video
                  src={viewing.url}
                  controls
                  className="mx-auto max-h-[60vh] rounded-md"
                />
              ) : viewContent !== null ? (
                <pre className="whitespace-pre-wrap text-xs text-green-900">
                  {viewContent}
                </pre>
              ) : isText(viewing.name) ? (
                <p className="text-xs text-green-400">Loading content...</p>
              ) : (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-green-600">
                    Preview not available for this file type.
                  </p>
                  <button
                    onClick={() => handleDownload(viewing)}
                    className="rounded-md bg-gold-600 px-4 py-2 text-xs font-medium text-white hover:bg-gold-500"
                  >
                    Download
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-red-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-medium text-red-900">
              Delete {confirmDelete.name}?
            </p>
            <p className="mt-2 text-xs text-red-700 break-all">
              {confirmDelete.pathname} — {formatSize(confirmDelete.size)}
            </p>
            <p className="mt-2 text-xs text-red-700">
              This removes the file from Vercel Blob. Cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
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
