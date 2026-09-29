"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, manualExpenses, recurringExpenses, shippingProviders, stores, DEDUCTION_GROUPS } from "@/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { fieldErrors, formObject, moneyInput, month, optMonth, optStr, type FormState } from "@/lib/form";

const optId = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v ? Number(v) : null));

const expenseSchema = z.object({
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  group: z.enum(DEDUCTION_GROUPS),
  storeId: optId,
  shippingProviderId: optId,
  amount: moneyInput.refine((v) => v !== 0, "Enter an amount"),
  currency: z.string().regex(/^[A-Z]{3}$/),
  description: optStr(512),
});

async function checkOwnership(clientId: number, storeId: number | null, providerId: number | null) {
  if (storeId) {
    const [s] = await db.select({ id: stores.id }).from(stores).where(and(eq(stores.id, storeId), eq(stores.clientId, clientId)));
    if (!s) throw new Error("Store does not belong to this client");
  }
  if (providerId) {
    const [p] = await db
      .select({ id: shippingProviders.id })
      .from(shippingProviders)
      .where(and(eq(shippingProviders.id, providerId), eq(shippingProviders.clientId, clientId)));
    if (!p) throw new Error("Courier does not belong to this client");
  }
}

export async function saveExpense(
  clientId: number,
  expenseId: number | null,
  returnTo: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = expenseSchema.safeParse(formObject(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const d = parsed.data;
  // A courier cost is always a shipping deduction.
  if (d.shippingProviderId) d.group = "SHIPPING";
  await checkOwnership(clientId, d.storeId, d.shippingProviderId);

  if (expenseId) {
    await db
      .update(manualExpenses)
      .set(d)
      .where(and(eq(manualExpenses.id, expenseId), eq(manualExpenses.clientId, clientId)));
  } else {
    await db.insert(manualExpenses).values({ ...d, clientId, createdBy: user.id });
  }
  revalidatePath(`/clients/${clientId}`, "layout");
  if (expenseId) redirect(returnTo);
  return { ok: "Expense added." };
}

export async function deleteExpense(clientId: number, expenseId: number, returnTo: string) {
  await requireUser();
  await db.delete(manualExpenses).where(and(eq(manualExpenses.id, expenseId), eq(manualExpenses.clientId, clientId)));
  revalidatePath(`/clients/${clientId}`, "layout");
  redirect(returnTo);
}

const recurringSchema = z.object({
  description: z.string().trim().min(1, "Required").max(512),
  group: z.enum(DEDUCTION_GROUPS),
  storeId: optId,
  amount: moneyInput.refine((v) => v !== 0, "Enter an amount"),
  currency: z.string().regex(/^[A-Z]{3}$/),
  startMonth: month,
  endMonth: optMonth,
});

export async function addRecurringExpense(clientId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = recurringSchema.safeParse(formObject(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  await checkOwnership(clientId, parsed.data.storeId, null);
  await db.insert(recurringExpenses).values({ ...parsed.data, clientId });
  revalidatePath(`/clients/${clientId}`, "layout");
  return { ok: "Recurring expense added." };
}

export async function endRecurringExpense(clientId: number, id: number, endMonth: string) {
  await requireAdmin();
  await db
    .update(recurringExpenses)
    .set({ endMonth })
    .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.clientId, clientId)));
  revalidatePath(`/clients/${clientId}`, "layout");
}

export async function deleteRecurringExpense(clientId: number, id: number) {
  await requireAdmin();
  await db.delete(recurringExpenses).where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.clientId, clientId)));
  revalidatePath(`/clients/${clientId}`, "layout");
}
