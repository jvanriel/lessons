import { NextRequest, NextResponse } from "next/server";
import { getSession, hasRole, startImpersonation, parseRoles } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || (!hasRole(session, "admin") && !hasRole(session, "dev"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await request.json();
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await startImpersonation({
    userId: target.id,
    email: target.email,
    roles: parseRoles(target.roles),
  });

  return NextResponse.json({ ok: true });
}
