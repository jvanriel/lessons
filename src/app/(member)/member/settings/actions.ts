"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export async function updateGolfProfile(data: {
  handicap: string | null;
  clubMemberNumber: string | null;
  golfGoals: string[];
  golfGoalsOther: string | null;
}): Promise<{ error?: string; success?: boolean }> {
  const session = await getSession();
  if (!session) return { error: "Not logged in." };

  let parsedHandicap: string | null = null;
  if (data.handicap) {
    const h = parseFloat(data.handicap);
    if (isNaN(h) || h < 0 || h > 54) {
      return { error: "Handicap must be between 0 and 54." };
    }
    parsedHandicap = String(h);
  }

  // Trim + cap to the column's varchar(64) so a paste overflow
  // doesn't surface as a Postgres error to the user.
  const cleanMemberNumber = data.clubMemberNumber?.trim().slice(0, 64) || null;

  const validGoals = [
    "driving", "short_game", "putting", "course_management",
    "learn_basics", "fitness", "other",
  ];
  const filtered = (data.golfGoals || []).filter((g) => validGoals.includes(g));

  await db
    .update(users)
    .set({
      handicap: parsedHandicap,
      clubMemberNumber: cleanMemberNumber,
      golfGoals: filtered.length > 0 ? filtered : null,
      golfGoalsOther: data.golfGoalsOther?.trim() || null,
    })
    .where(eq(users.id, session.userId));

  revalidatePath("/member/settings");
  return { success: true };
}
