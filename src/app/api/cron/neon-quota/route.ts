import { NextRequest, NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { logEvent } from "@/lib/events";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";

/**
 * GET /api/cron/neon-quota
 *
 * Fetches current-billing-period compute usage for each configured Neon
 * project and pages ntfy when a project crosses 70% / 85% / 95% of its
 * monthly compute-hours quota. Converts the "blind cliff at 100%" (the
 * 2026-04-23 Neon 402 outage) into graded warnings with time to react.
 *
 * Schedule: every 6h via vercel.json crons.
 *
 * Env:
 *   NEON_API_KEY         Bearer token for console.neon.tech/api/v2.
 *   NEON_PROJECTS        Comma-separated "projectId:label:quotaHours"
 *                        tuples, e.g. "abc123:preview:300,def456:production:300".
 *                        If a project isn't listed here it isn't checked.
 *
 * State tracking: we write a `neon.quota.threshold` event whenever we
 * page, and skip re-paging if the most recent such event for this
 * project (within the current 35-day window) is already at ≥ the current
 * threshold. Rolls over naturally at the next billing cycle since usage
 * resets below 70%.
 */

const ALERT_THRESHOLDS = [0.7, 0.85, 0.95] as const;

interface ProjectSpec {
  projectId: string;
  label: string;
  quotaHours: number;
}

function parseProjectSpecs(raw: string): ProjectSpec[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((tuple) => {
      const [projectId, label, hoursRaw] = tuple.split(":").map((p) => p.trim());
      const quotaHours = Number(hoursRaw);
      if (!projectId || !label || !Number.isFinite(quotaHours) || quotaHours <= 0) {
        throw new Error(
          `Invalid NEON_PROJECTS tuple "${tuple}" — expected "projectId:label:quotaHours"`,
        );
      }
      return { projectId, label, quotaHours };
    });
}

interface NeonProjectResponse {
  project?: {
    compute_time_seconds?: number;
    consumption_period_start?: string;
  };
  compute_time_seconds?: number;
  consumption_period_start?: string;
}

async function fetchProjectUsage(
  projectId: string,
  apiKey: string,
): Promise<{ computeTimeSeconds: number; periodStart: string | null }> {
  const res = await fetch(
    `https://console.neon.tech/api/v2/projects/${projectId}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`Neon API ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as NeonProjectResponse;
  // Neon wraps the payload in `project` on most endpoints; be defensive
  // in case the shape changes.
  const p = body.project ?? body;
  const computeTimeSeconds = Number(p.compute_time_seconds ?? 0);
  const periodStart = p.consumption_period_start ?? null;
  return { computeTimeSeconds, periodStart };
}

type ThresholdEventPayload = {
  projectId: string;
  label: string;
  threshold: number;
  percent: number;
  computeTimeSeconds: number;
  quotaSeconds: number;
  periodStart: string | null;
} & Record<string, unknown>;

async function lastAlertedThreshold(
  projectId: string,
  periodStart: string | null,
): Promise<number> {
  // Look back far enough to catch the current billing period; 35 days
  // covers monthly cycles with slack. If periodStart is known, clamp
  // to that.
  const since = periodStart
    ? new Date(periodStart)
    : new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);

  const [row] = await db
    .select({ payload: events.payload })
    .from(events)
    .where(
      and(
        eq(events.type, "neon.quota.threshold"),
        gte(events.createdAt, since),
      ),
    )
    .orderBy(desc(events.createdAt))
    .limit(20);
  // `events` is append-only so we grab a few and filter by projectId.
  void row;
  const rows = await db
    .select({ payload: events.payload, createdAt: events.createdAt })
    .from(events)
    .where(
      and(
        eq(events.type, "neon.quota.threshold"),
        gte(events.createdAt, since),
      ),
    )
    .orderBy(desc(events.createdAt))
    .limit(20);
  for (const r of rows) {
    const p = r.payload as ThresholdEventPayload | null;
    if (p?.projectId === projectId) return p.threshold;
  }
  return 0;
}

async function alertNtfy(
  spec: ProjectSpec,
  percent: number,
  threshold: number,
) {
  const NTFY_URL = process.env.NTFY_URL;
  const NTFY_AUTH = process.env.NTFY_AUTH;
  const NTFY_TOPIC = process.env.NTFY_TOPIC || "golf-alerts";
  if (!NTFY_URL || !NTFY_AUTH) return;

  const priority = threshold >= 0.95 ? "urgent" : "high";
  const title = `Neon ${spec.label}: ${Math.round(percent * 100)}% of compute quota`;
  const body =
    threshold >= 0.95
      ? `Upgrade the Neon plan NOW — 402 lockout imminent.`
      : `Used ${Math.round(percent * 100)}% of the ${spec.quotaHours}h monthly compute quota. Consider upgrading before the next tier.`;

  await fetch(`${NTFY_URL}/${NTFY_TOPIC}`, {
    method: "POST",
    headers: {
      Title: title,
      Priority: priority,
      Authorization: `Basic ${NTFY_AUTH}`,
      Tags: "warning",
    },
    body,
  }).catch((err) => console.error("ntfy neon-quota failed:", err));
}

export async function GET(request: NextRequest) {
  // Auth: Vercel Cron secret OR a dev session for manual triggering.
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (authHeader === `Bearer ${cronSecret}` && cronSecret) {
    // ok
  } else {
    const session = await getSession();
    if (!session || !hasRole(session, "dev")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const apiKey = process.env.NEON_API_KEY;
  const projectsRaw = process.env.NEON_PROJECTS;
  if (!apiKey || !projectsRaw) {
    return NextResponse.json(
      {
        skipped: true,
        reason: "NEON_API_KEY or NEON_PROJECTS not configured",
      },
      { status: 200 },
    );
  }

  let specs: ProjectSpec[];
  try {
    specs = parseProjectSpecs(projectsRaw);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }

  const report: Array<{
    projectId: string;
    label: string;
    percent: number;
    quotaHours: number;
    computeHours: number;
    alertedThreshold: number | null;
    skippedExistingThreshold: number | null;
  }> = [];

  for (const spec of specs) {
    try {
      const { computeTimeSeconds, periodStart } = await fetchProjectUsage(
        spec.projectId,
        apiKey,
      );
      const quotaSeconds = spec.quotaHours * 3600;
      const percent = quotaSeconds > 0 ? computeTimeSeconds / quotaSeconds : 0;

      // Current threshold band: highest band we've crossed.
      const currentThreshold =
        [...ALERT_THRESHOLDS].reverse().find((t) => percent >= t) ?? 0;

      let alerted: number | null = null;
      let skipped: number | null = null;

      if (currentThreshold > 0) {
        const already = await lastAlertedThreshold(spec.projectId, periodStart);
        if (already >= currentThreshold) {
          skipped = already;
        } else {
          await alertNtfy(spec, percent, currentThreshold);
          await logEvent({
            type: "neon.quota.threshold",
            level: currentThreshold >= 0.95 ? "error" : "warn",
            payload: {
              projectId: spec.projectId,
              label: spec.label,
              threshold: currentThreshold,
              percent,
              computeTimeSeconds,
              quotaSeconds,
              periodStart,
            } as ThresholdEventPayload,
          });
          alerted = currentThreshold;
        }
      }

      report.push({
        projectId: spec.projectId,
        label: spec.label,
        percent,
        quotaHours: spec.quotaHours,
        computeHours: computeTimeSeconds / 3600,
        alertedThreshold: alerted,
        skippedExistingThreshold: skipped,
      });
    } catch (err) {
      console.error(
        `[neon-quota] ${spec.label} (${spec.projectId}) failed:`,
        err,
      );
      report.push({
        projectId: spec.projectId,
        label: spec.label,
        percent: -1,
        quotaHours: spec.quotaHours,
        computeHours: -1,
        alertedThreshold: null,
        skippedExistingThreshold: null,
      });
    }
  }

  return NextResponse.json({ ok: true, report });
}
