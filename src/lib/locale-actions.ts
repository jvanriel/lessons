"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { isLocale } from "@/lib/i18n";

export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;

  const c = await cookies();
  c.set("locale", locale, {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    sameSite: "lax",
  });

  const session = await getSession();
  if (session) {
    await db
      .update(users)
      .set({ preferredLocale: locale })
      .where(eq(users.id, session.userId));
  }

  revalidatePath("/", "layout");
}
