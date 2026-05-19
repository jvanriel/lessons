import { NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import {
  getCoachingUnreadCountsForStudent,
  getCoachingUnreadCountsForPro,
} from "@/lib/coaching-unread";

/**
 * GET /api/coaching/unread
 *
 * Returns the viewer's per-conversation unread counts for the
 * coaching chat (task 122). Used by the in-app sidebar to render
 * a badge next to the "Coaching" / "Golfers" entry.
 *
 * Shape:
 *   { total: number, byProStudentId: Record<string, number> }
 *
 * Both `member` and `pro` roles are supported. A user with both
 * roles (admin testing, etc.) gets the union — counts are merged
 * so a single relationship doesn't double-count.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const counts: Record<string, number> = {};
  let total = 0;

  if (hasRole(session, "member")) {
    const c = await getCoachingUnreadCountsForStudent(session.userId);
    for (const [k, v] of c.byProStudentId.entries()) {
      counts[String(k)] = (counts[String(k)] ?? 0) + v;
    }
    total += c.total;
  }
  if (hasRole(session, "pro")) {
    const c = await getCoachingUnreadCountsForPro(session.userId);
    for (const [k, v] of c.byProStudentId.entries()) {
      // A user can hold both roles; if a single proStudentId
      // appears in both maps (extremely unusual but possible
      // for a pro who is also a golfer of another pro using
      // the same userId), don't double-count.
      if (counts[String(k)] !== undefined) continue;
      counts[String(k)] = v;
      total += v;
    }
    if (!hasRole(session, "member")) total += 0; // already added below
  }

  return NextResponse.json({ total, byProStudentId: counts });
}
