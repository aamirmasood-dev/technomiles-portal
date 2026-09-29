"use server";

import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, users } from "@/db";
import { createSession, deleteSession } from "@/lib/session";

export type LoginState = { error?: string };

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter your email and password." };

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email));
  const ok = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;
  if (!user || !ok) return { error: "Email or password is incorrect." };

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

const setupSchema = z.object({
  name: z.string().trim().min(1).max(191),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10, "Password must be at least 10 characters"),
});

// First run only: creates the first administrator when there are no users at all.
export async function setupFirstAdmin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const [{ n }] = await db.select({ n: count() }).from(users);
  if (n > 0) return { error: "Setup has already been done. Please sign in." };
  const parsed = setupSchema.safeParse({ name: formData.get("name"), email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [{ id }] = await db
    .insert(users)
    .values({ name: parsed.data.name, email: parsed.data.email, role: "ADMIN", passwordHash: await bcrypt.hash(parsed.data.password, 12) })
    .$returningId();
  await createSession(id);
  redirect("/");
}
