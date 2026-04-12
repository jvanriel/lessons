"use server";

import { getSession, hasRole } from "@/lib/auth";

const SENTRY_API = "https://sentry.io/api/0";

async function requireDev() {
  const session = await getSession();
  if (!session || !hasRole(session, "dev")) {
    throw new Error("Unauthorized");
  }
}

function getConfig() {
  // Prefer a dedicated read token (event:read + event:admin scopes).
  // Fall back to SENTRY_AUTH_TOKEN (Marketplace-provisioned) which typically
  // only has project:write for source map uploads.
  const token = process.env.SENTRY_READ_TOKEN || process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  if (!token || !org || !project) {
    throw new Error(
      "Sentry not configured (SENTRY_READ_TOKEN / SENTRY_ORG / SENTRY_PROJECT)"
    );
  }
  return { token, org, project };
}

async function sentryFetch<T>(path: string): Promise<T> {
  const { token } = getConfig();
  const url = `${SENTRY_API}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sentry API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ─── Issues ────────────────────────────────────────────

export interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  level: string; // error | warning | info | fatal
  status: string; // unresolved | resolved | ignored
  count: string; // stringified number
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
  metadata?: { value?: string; type?: string };
  project: { id: string; name: string; slug: string };
}

export interface ListIssuesOpts {
  statsPeriod?: "24h" | "7d" | "14d" | "30d";
  query?: string; // "is:unresolved" | "" | custom
  limit?: number;
}

export async function listIssues(
  opts: ListIssuesOpts = {}
): Promise<SentryIssue[]> {
  await requireDev();
  const { org, project } = getConfig();

  const params = new URLSearchParams();
  params.set("statsPeriod", opts.statsPeriod ?? "24h");
  params.set("query", opts.query ?? "is:unresolved");
  params.set("limit", String(opts.limit ?? 50));

  return sentryFetch<SentryIssue[]>(
    `/projects/${org}/${project}/issues/?${params.toString()}`
  );
}

// ─── Issue detail + latest event ───────────────────────

export interface SentryFrame {
  filename?: string;
  function?: string;
  lineno?: number;
  colno?: number;
  inApp?: boolean;
  module?: string;
  context?: Array<[number, string]>;
}

export interface SentryException {
  type?: string;
  value?: string;
  stacktrace?: { frames?: SentryFrame[] };
}

export interface SentryBreadcrumb {
  timestamp?: string;
  type?: string; // "default" | "http" | "navigation" | "ui.click" | "console"
  category?: string;
  level?: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface SentryEventDetail {
  id: string;
  eventID: string;
  message?: string;
  platform?: string;
  dateCreated: string;
  tags?: Array<{ key: string; value: string }>;
  user?: {
    id?: string;
    email?: string;
    username?: string;
    ip_address?: string;
  } | null;
  entries?: Array<{
    type: string;
    data?: {
      values?: SentryException[] | SentryBreadcrumb[];
      method?: string;
      url?: string;
      query?: Array<[string, string]>;
      headers?: Array<[string, string]>;
    };
  }>;
  release?: { version?: string } | null;
  environment?: string;
}

export async function getLatestEvent(
  issueId: string
): Promise<SentryEventDetail> {
  await requireDev();
  const { org } = getConfig();
  return sentryFetch<SentryEventDetail>(
    `/organizations/${org}/issues/${issueId}/events/latest/`
  );
}

// ─── Issue actions ─────────────────────────────────────

export async function resolveIssue(issueId: string): Promise<void> {
  await requireDev();
  const { token, org } = getConfig();
  const res = await fetch(
    `${SENTRY_API}/organizations/${org}/issues/${issueId}/`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "resolved" }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sentry API ${res.status}: ${body.slice(0, 200)}`);
  }
}

// ─── Project stats ─────────────────────────────────────

export interface ProjectStats {
  unresolved: number;
  thisPeriodCount: number;
  firstIssueAt: string | null;
}

export async function getProjectStats(): Promise<ProjectStats> {
  await requireDev();
  const issues = await listIssues({
    statsPeriod: "24h",
    query: "is:unresolved",
    limit: 100,
  });
  const thisPeriodCount = issues.reduce(
    (sum, i) => sum + Number(i.count || "0"),
    0
  );
  const firstSeen = issues
    .map((i) => i.firstSeen)
    .sort()
    .at(0);
  return {
    unresolved: issues.length,
    thisPeriodCount,
    firstIssueAt: firstSeen ?? null,
  };
}
