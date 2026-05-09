/**
 * Thin Google Drive client wrapper for the admin tasks Drive
 * integration (task 16). Re-uses the same domain-wide-delegated
 * service account we already use for Gmail (mail.ts) — the
 * Workspace is silverswing.golf with golflessons.be as a user
 * alias, so the credentials and the impersonated workspace user
 * are shared with the silverswing.golf project's
 * `src/lib/google-service-account.ts`.
 *
 * Scope is limited to what the tasks integration needs:
 *   - getDriveClient(workspaceUser)     — impersonated v3 client
 *   - getTasksRootFolderId()            — find/create the shared
 *                                         "Golf Lessons - Task
 *                                         attachments" parent
 *   - getTaskFolderId(taskId, title)    — per-task subfolder
 *   - createTaskGoogleDoc(...)          — create + share a Google
 *                                         Doc / Sheet / Slides
 *
 * Files are anyone-with-link writable so collaborators can open
 * them without a per-user share. Same model as silverswing.golf.
 */
import "server-only";
import { drive, auth as driveAuth } from "@googleapis/drive";

// ─── Service account (shared with Gmail in mail.ts) ────────

/**
 * Strip surrounding double/single quotes and trim whitespace.
 * Vercel pastes can leave the env var wrapped in quotes; without
 * this, the PEM parser blows up with
 * "error:1E08010C:DECODER routines::unsupported". Mirrors
 * `stripQuotesAndTrim` in mail.ts.
 */
function stripQuotesAndTrim(raw: string | undefined): string {
  if (!raw) return "";
  let v = raw.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function getCredentials() {
  const email = stripQuotesAndTrim(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const key = stripQuotesAndTrim(
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  ).replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error("Google service account credentials not configured");
  }
  return { client_email: email, private_key: key };
}

/**
 * Workspace user the service account impersonates for Drive ops.
 * Override via `GOOGLE_DRIVE_WORKSPACE_USER` if a different user
 * should own the created files. Defaults to the
 * silverswing.golf admin user — the workspace is shared between
 * golflessons.be (alias) and silverswing.golf (primary).
 */
const WORKSPACE_USER =
  process.env.GOOGLE_DRIVE_WORKSPACE_USER?.trim() ||
  "it.admin@silverswing.golf";

export function getDriveClient(userEmail: string = WORKSPACE_USER) {
  const auth = new driveAuth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ["https://www.googleapis.com/auth/drive"],
    clientOptions: { subject: userEmail },
  });
  return drive({ version: "v3", auth });
}

// ─── Folder helpers ────────────────────────────────────

/**
 * Doc / sheet / slides MIME types the integration creates. These
 * are also the contentType strings stored on the comment
 * attachment so the renderer can show a Google-shaped icon if it
 * wants to.
 */
export const GOOGLE_DOC_MIME = {
  document: "application/vnd.google-apps.document",
  spreadsheet: "application/vnd.google-apps.spreadsheet",
  presentation: "application/vnd.google-apps.presentation",
} as const;

export type GoogleDocType = keyof typeof GOOGLE_DOC_MIME;

const FOLDER_MIME = "application/vnd.google-apps.folder";
const ROOT_FOLDER_NAME = "Golf Lessons - Task attachments";

/**
 * In-memory cache of the root folder id so we don't hit the
 * Drive `files.list` API on every doc creation.
 */
let cachedRootFolderId: string | null = null;

export async function getTasksRootFolderId(): Promise<string> {
  if (cachedRootFolderId) return cachedRootFolderId;
  const drive = getDriveClient();
  const res = await drive.files.list({
    q: `name = '${ROOT_FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and 'root' in parents and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
  });
  const existing = res.data.files?.[0]?.id;
  if (existing) {
    cachedRootFolderId = existing;
    return existing;
  }
  const created = await drive.files.create({
    requestBody: {
      name: ROOT_FOLDER_NAME,
      mimeType: FOLDER_MIME,
    },
    fields: "id",
  });
  cachedRootFolderId = created.data.id!;
  return cachedRootFolderId;
}

/**
 * Find or create the per-task subfolder under the tasks root.
 * Folder name format: `Task #{id} — {title}`. Renaming the task
 * later doesn't rename the folder — it'd be a moot rename since
 * the folder is rarely opened directly by humans.
 */
export async function getTaskFolderId(
  taskId: number,
  taskTitle: string,
): Promise<string> {
  const drive = getDriveClient();
  const rootId = await getTasksRootFolderId();
  const folderName = `Task #${taskId} — ${taskTitle.slice(0, 80)}`.replace(
    /'/g,
    "\\'",
  );
  const res = await drive.files.list({
    q: `name = '${folderName}' and mimeType = '${FOLDER_MIME}' and '${rootId}' in parents and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
  });
  const existing = res.data.files?.[0]?.id;
  if (existing) return existing;
  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: FOLDER_MIME,
      parents: [rootId],
    },
    fields: "id",
  });
  return created.data.id!;
}

// ─── Document creation ─────────────────────────────────

export interface CreatedGoogleDoc {
  /** Drive file id — kept in case we ever want to rename / delete. */
  googleFileId: string;
  /** webViewLink — what the user clicks to open the doc. */
  url: string;
  name: string;
  contentType: string;
}

/**
 * Create a Google Doc / Sheet / Slides in the per-task folder
 * and grant anyone-with-link writer access. Returns the bits the
 * comments component needs to attach the file.
 */
export async function createTaskGoogleDoc(opts: {
  taskId: number;
  taskTitle: string;
  type: GoogleDocType;
  title: string;
}): Promise<CreatedGoogleDoc> {
  const drive = getDriveClient();
  const folderId = await getTaskFolderId(opts.taskId, opts.taskTitle);
  const file = await drive.files.create({
    requestBody: {
      name: opts.title,
      mimeType: GOOGLE_DOC_MIME[opts.type],
      parents: [folderId],
    },
    fields: "id, webViewLink",
  });
  // Anyone-with-link writer — same default as silverswing.golf so
  // collaborators don't need a per-user grant.
  await drive.permissions.create({
    fileId: file.data.id!,
    requestBody: { role: "writer", type: "anyone" },
  });
  return {
    googleFileId: file.data.id!,
    url: file.data.webViewLink!,
    name: opts.title,
    contentType: GOOGLE_DOC_MIME[opts.type],
  };
}
