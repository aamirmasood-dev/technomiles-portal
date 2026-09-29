"use server";

import bcrypt from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, users, ROLES } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { fieldErrors, formObject, type FormState } from "@/lib/form";

const password = z.string().min(10, "At least 10 characters");

const newUserSchema = z.object({
  newName: z.string().trim().min(1, "Required").max(191),
  newEmail: z.string().trim().toLowerCase().pipe(z.email("Not a valid email")),
  newRole: z.enum(ROLES),
  newPassword: password,
});

export async function addUser(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = newUserSchema.safeParse(formObject(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const { newName: name, newEmail: email, newRole: role, newPassword: pw } = parsed.data;
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) return { error: "Please fix the highlighted fields.", fieldErrors: { newEmail: "A user with this email already exists" } };
  await db.insert(users).values({ name, email, role, passwordHash: await bcrypt.hash(pw, 12) });
  revalidatePath("/settings");
  return { ok: `Added ${name}. Share the password with them securely; they can sign in now.` };
}

// Keeps at least one active administrator, and stops admins locking themselves out.
async function wouldRemoveLastAdmin(userId: number) {
  const others = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "ADMIN"), eq(users.active, true), ne(users.id, userId)))
    .limit(1);
  return others.length === 0;
}

export async function setUserAccess(userId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const role = z.enum(ROLES).safeParse(formData.get("role"));
  if (!role.success) return { error: "Pick a role." };
  const active = formData.get("active") === "on";
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target) return { error: "User not found." };
  if (userId === me.id && (!active || role.data !== "ADMIN")) return { error: "You cannot remove your own admin access." };
  if (target.role === "ADMIN" && (role.data !== "ADMIN" || !active) && (await wouldRemoveLastAdmin(userId))) {
    return { error: "There must be at least one active administrator." };
  }
  await db.update(users).set({ role: role.data, active }).where(eq(users.id, userId));
  revalidatePath("/settings");
  return { ok: "Saved" };
}

export async function resetUserPassword(userId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const pw = password.safeParse(formData.get("password"));
  if (!pw.success) return { error: pw.error.issues[0].message };
  await db.update(users).set({ passwordHash: await bcrypt.hash(pw.data, 12) }).where(eq(users.id, userId));
  return { ok: "Password changed" };
}
