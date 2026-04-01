"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, setSessionCookie } from "@/lib/auth";

export async function register(
  _prevState: { error: string } | null,
  formData: FormData
) {
  const firstName = (formData.get("firstName") as string).trim();
  const lastName = (formData.get("lastName") as string).trim();
  const email = (formData.get("email") as string).trim().toLowerCase();
  const phone = (formData.get("phone") as string)?.trim() || "";
  const password = formData.get("password") as string;
  const confirm = formData.get("confirmPassword") as string;

  if (!firstName || !lastName || !email || !password) {
    return { error: "All fields are required." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const [existing] = await db
    .select({ id: users.id, roles: users.roles })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const hashed = await hashPassword(password);

  let userId: number;

  if (existing && (!existing.roles || existing.roles.trim() === "")) {
    await db
      .update(users)
      .set({
        firstName,
        lastName,
        phone,
        password: hashed,
        roles: "member",
      })
      .where(eq(users.id, existing.id));
    userId = existing.id;
  } else if (existing) {
    return { error: "An account with this email already exists." };
  } else {
    const inserted = await db
      .insert(users)
      .values({
        firstName,
        lastName,
        email,
        phone,
        password: hashed,
        roles: "member",
      })
      .returning({ id: users.id });
    userId = inserted[0].id;
  }

  await setSessionCookie({
    userId,
    email,
    roles: ["member"],
  });

  redirect("/member/dashboard");
}
