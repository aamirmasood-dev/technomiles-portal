"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, assets, companyExpenses, ASSET_CATEGORIES, ASSET_CONDITIONS, ASSET_REMOVAL_REASONS } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { checkbox, fieldErrors, formObject, moneyInput, optStr, type FormState } from "@/lib/form";

const reval = () => revalidatePath("/company", "layout");

const schema = z.object({
  name: z.string().trim().min(1, "Required").max(191),
  category: z.enum(ASSET_CATEGORIES),
  quantity: z.coerce.number().int().min(1, "At least 1"),
  purchaseDate: z.string().optional().nullable().transform((v) => (v ? v : null)),
  unitPrice: moneyInput,
  condition: z.enum(ASSET_CONDITIONS),
  location: optStr(),
  serialNumber: optStr(),
  notes: optStr(2000),
  recordExpense: checkbox,
  paidBy: z.string().optional().nullable(),
});

export async function saveAsset(assetId: number | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const parsed = schema.safeParse(formObject(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const { recordExpense, paidBy, ...values } = parsed.data;
  if (assetId) {
    await db.update(assets).set(values).where(eq(assets.id, assetId));
    reval();
    redirect("/company/assets");
  }
  await db.insert(assets).values(values);
  // Optionally book the purchase as a Hardware expense in the same step.
  if (recordExpense && values.unitPrice > 0) {
    if (!values.purchaseDate) return { error: "Enter the purchase date to record it as an expense." };
    const [kind, id] = (paidBy ?? "").split(":");
    const total = values.unitPrice * values.quantity;
    await db.insert(companyExpenses).values({
      expenseDate: values.purchaseDate,
      category: "HARDWARE",
      description: `${values.quantity} × ${values.name}`,
      currency: "PKR",
      amount: total,
      pkrAmount: total,
      paidByPartnerId: kind === "partner" ? Number(id) : null,
      accountId: kind === "account" ? Number(id) : null,
      createdBy: user.id,
    });
  }
  reval();
  return { ok: `Added ${values.name}.` };
}

const removeSchema = z.object({
  removedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  removalReason: z.enum(ASSET_REMOVAL_REASONS),
  removalValue: moneyInput,
});

export async function removeAsset(assetId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = removeSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.update(assets).set(parsed.data).where(eq(assets.id, assetId));
  reval();
  return { ok: "Removed from the register." };
}

export async function restoreAsset(assetId: number) {
  await requireAdmin();
  await db.update(assets).set({ removedDate: null, removalReason: null, removalValue: null }).where(eq(assets.id, assetId));
  reval();
}
