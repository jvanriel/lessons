"use server";

import { getSession, hasRole } from "@/lib/auth";

const VERCEL_API = "https://api.vercel.com";

async function requireDev() {
  const session = await getSession();
  if (!session || !hasRole(session, "dev")) {
    throw new Error("Unauthorized");
  }
}

function getAuth() {
  const token = process.env.LOGS_VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token || token === "PLACEHOLDER_REPLACE_ME") {
    throw new Error(
      "LOGS_VERCEL_TOKEN not configured. Create one at https://vercel.com/account/tokens"
    );
  }
  if (!projectId) {
    throw new Error("VERCEL_PROJECT_ID not set");
  }
  return { token, projectId, teamId };
}

function withTeam(url: string, teamId?: string): string {
  if (!teamId) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}teamId=${teamId}`;
}

// ─── Deployments ───────────────────────────────────────

export interface DeploymentSummary {
  uid: string;
  name: string;
  url: string;
  createdAt: number;
  state: string;
  target: string | null; // "production" | null (preview)
  commitMessage?: string;
}

export async function listDeployments(
  limit = 10
): Promise<DeploymentSummary[]> {
  await requireDev();
  const { token, projectId, teamId } = getAuth();

  const url = withTeam(
    `${VERCEL_API}/v6/deployments?projectId=${projectId}&limit=${limit}`,
    teamId
  );
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vercel API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    deployments: Array<{
      uid: string;
      name: string;
      url: string;
      created: number;
      state: string;
      target?: string | null;
      meta?: { githubCommitMessage?: string };
    }>;
  };

  return data.deployments.map((d) => ({
    uid: d.uid,
    name: d.name,
    url: d.url,
    createdAt: d.created,
    state: d.state,
    target: d.target ?? null,
    commitMessage: d.meta?.githubCommitMessage,
  }));
}

// ─── Events for a deployment ───────────────────────────

export interface VercelLogEntry {
  id: string;
  created: number;
  type: string; // stdout | stderr | exit | middleware-invocation | ...
  level?: string; // error | warning
  text?: string;
  path?: string;
  statusCode?: number;
  host?: string;
  method?: string;
  proxy?: {
    method?: string;
    path?: string;
    statusCode?: number;
    region?: string;
    host?: string;
  };
}

export async function getDeploymentLogs(
  deploymentId: string,
  opts: { limit?: number; direction?: "backward" | "forward"; since?: number } = {}
): Promise<VercelLogEntry[]> {
  await requireDev();
  const { token, teamId } = getAuth();

  const limit = opts.limit ?? 100;
  const direction = opts.direction ?? "backward";
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("direction", direction);
  if (opts.since) params.set("since", String(opts.since));
  params.set("builds", "0"); // runtime only

  const url = withTeam(
    `${VERCEL_API}/v3/deployments/${deploymentId}/events?${params.toString()}`,
    teamId
  );

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vercel API ${res.status}: ${body.slice(0, 200)}`);
  }

  const raw = await res.json();
  const entries: VercelLogEntry[] = [];

  // The API returns an array of mixed event shapes.
  for (const item of raw as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;

    // Shape 1: wrapped in { type, created, payload }
    if ("payload" in obj && obj.payload && typeof obj.payload === "object") {
      const p = obj.payload as Record<string, unknown>;
      const proxy = (p.proxy as Record<string, unknown> | undefined) ?? undefined;
      entries.push({
        id: String(p.id ?? p.serial ?? Math.random()),
        created: Number(p.date ?? p.created ?? obj.created ?? 0),
        type: String(obj.type ?? "stdout"),
        text:
          typeof p.text === "string" ? p.text : undefined,
        path:
          typeof (proxy?.path) === "string" ? (proxy?.path as string) : undefined,
        statusCode:
          typeof p.statusCode === "number"
            ? (p.statusCode as number)
            : typeof (proxy?.statusCode) === "number"
              ? (proxy?.statusCode as number)
              : undefined,
        proxy: proxy
          ? {
              method: proxy.method as string | undefined,
              path: proxy.path as string | undefined,
              statusCode: proxy.statusCode as number | undefined,
              region: proxy.region as string | undefined,
              host: proxy.host as string | undefined,
            }
          : undefined,
      });
      continue;
    }

    // Shape 2: flat event { created, date, type, text, level }
    entries.push({
      id: String(obj.id ?? obj.serial ?? Math.random()),
      created: Number(obj.date ?? obj.created ?? 0),
      type: String(obj.type ?? "stdout"),
      level: obj.level as string | undefined,
      text: typeof obj.text === "string" ? obj.text : undefined,
    });
  }

  return entries;
}
