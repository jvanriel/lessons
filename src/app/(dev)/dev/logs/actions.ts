"use server";

import { db } from "@/lib/db";
import { events, users } from "@/lib/db/schema";
import { desc, eq, and, gte, sql, or, ilike } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";

async function requireDev() {
  const session = await getSession();
  if (!session || !hasRole(session, "dev")) {
    throw new Error("Unauthorized");
  }
}

export interface EventRow {
  id: number;
  type: string;
  level: string;
  actorId: number | null;
  actorName: string | null;
  targetId: number | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface LogsQuery {
  type?: string;
  level?: string;
  actorId?: number;
  search?: string;
  since?: string; // "1h" | "24h" | "7d" | "30d" | "all"
  limit?: number;
  offset?: number;
}

export interface LogsResult {
  rows: EventRow[];
  total: number;
  stats: { type: string; count: number }[];
  levelStats: { level: string; count: number }[];
  distinctTypes: string[];
}

function sinceDate(since: string | undefined): Date | null {
  const now = Date.now();
  switch (since) {
    case "1h":
      return new Date(now - 60 * 60 * 1000);
    case "24h":
      return new Date(now - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

export async function queryEvents(q: LogsQuery): Promise<LogsResult> {
  await requireDev();

  const limit = Math.min(500, Math.max(1, q.limit ?? 100));
  const offset = Math.max(0, q.offset ?? 0);
  const since = sinceDate(q.since ?? "24h");

  const conds = [];
  if (q.type) conds.push(eq(events.type, q.type));
  if (q.level) conds.push(eq(events.level, q.level));
  if (q.actorId) conds.push(eq(events.actorId, q.actorId));
  if (since) conds.push(gte(events.createdAt, since));
  if (q.search && q.search.trim()) {
    const pattern = `%${q.search.trim()}%`;
    const searchCond = or(
      ilike(events.type, pattern),
      sql`CAST(${events.payload} AS text) ILIKE ${pattern}`
    );
    if (searchCond) conds.push(searchCond);
  }

  const whereCond = conds.length > 0 ? and(...conds) : undefined;

  // Rows with actor name
  const rows = await db
    .select({
      id: events.id,
      type: events.type,
      level: events.level,
      actorId: events.actorId,
      actorFirstName: users.firstName,
      actorLastName: users.lastName,
      targetId: events.targetId,
      payload: events.payload,
      createdAt: events.createdAt,
    })
    .from(events)
    .leftJoin(users, eq(events.actorId, users.id))
    .where(whereCond)
    .orderBy(desc(events.createdAt))
    .limit(limit)
    .offset(offset);

  // Total count
  const [{ c: total }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(events)
    .where(whereCond);

  // Aggregates by type within the same filter
  const stats = await db
    .select({
      type: events.type,
      count: sql<number>`count(*)::int`,
    })
    .from(events)
    .where(whereCond)
    .groupBy(events.type)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  // Aggregates by level
  const levelStats = await db
    .select({
      level: events.level,
      count: sql<number>`count(*)::int`,
    })
    .from(events)
    .where(whereCond)
    .groupBy(events.level);

  // Distinct types (for the type filter dropdown)
  const distinctTypesRows = await db
    .selectDistinct({ type: events.type })
    .from(events)
    .orderBy(events.type);
  const distinctTypes = distinctTypesRows.map((r) => r.type);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      type: r.type,
      level: r.level,
      actorId: r.actorId,
      actorName:
        r.actorFirstName || r.actorLastName
          ? `${r.actorFirstName ?? ""} ${r.actorLastName ?? ""}`.trim()
          : null,
      targetId: r.targetId,
      payload: r.payload,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    stats,
    levelStats,
    distinctTypes,
  };
}
