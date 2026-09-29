"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, partnerEntries } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { BOOKS_START } from "@/lib/company";
import { formObject, moneyInput, type FormState } from "@/lib/form";
import { closeCompanyMonth, reopenCompanyMonth } from "@/lib/partners/service";
import { isPeriod } from "@/lib/period";

const reval = () => revalidatePath("/company", "layout");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

const entrySchema = z.object({
  kind: z.enum(["WITHDRAWAL", "PERSONAL_EXPENSE", "OPENING", "ADJUSTMENT", "TRANSFER"]),
  partnerId: z.coerce.number().int().positive("Pick a partner"),
  toPartnerId: z.string().optional().nullable().transform((v) => (v ? Number(v) : null)),
  entryDate: date,
  amount: moneyInput.refine((v) => v !== 0, "Enter an amount"),
  direction: z.enum(["owed_to_partner", "owed_by_partner"]).optional().nullable(),
  accountId: z.string().optional().nullable().transform((v) => (v ? Number(v) : null)),
  description: z.string().trim().max(512).optional().nullable(),
});

export async function savePartnerEntry(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const parsed = entrySchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const abs = Math.abs(d.amount);
  const base = { entryDate: d.entryDate, createdBy: user.id };
  const note = d.description?.trim();

  if (d.kind === "TRANSFER") {
    if (!d.toPartnerId || d.toPartnerId === d.partnerId) return { error: "Pick the partner who received the money." };
    const group = randomUUID();
    // The payer settles part of what they owe (balance up); the receiver has been paid outside the company (balance down).
    await db.insert(partnerEntries).values([
      { ...base, partnerId: d.partnerId, type: "TRANSFER", amount: abs, description: note || "Paid to the other partner directly", transferGroup: group },
      { ...base, partnerId: d.toPartnerId, type: "TRANSFER", amount: -abs, description: note || "Received from the other partner directly", transferGroup: group },
    ]);
  } else if (d.kind === "WITHDRAWAL") {
    await db.insert(partnerEntries).values({ ...base, partnerId: d.partnerId, type: "WITHDRAWAL", amount: -abs, accountId: d.accountId, description: note || "Paid to partner" });
  } else if (d.kind === "PERSONAL_EXPENSE") {
    if (!note) return { error: "Describe the personal expense." };
    await db.insert(partnerEntries).values({ ...base, partnerId: d.partnerId, type: "PERSONAL_EXPENSE", amount: -abs, accountId: d.accountId, description: `Personal expense paid by company: ${note}` });
  } else {
    // OPENING / ADJUSTMENT: signed by direction.
    const amount = d.direction === "owed_by_partner" ? -abs : abs;
    await db.insert(partnerEntries).values({ ...base, partnerId: d.partnerId, type: d.kind, amount, description: note || (d.kind === "OPENING" ? "Opening balance" : "Adjustment") });
  }
  reval();
  return { ok: "Saved" };
}

export async function deletePartnerEntry(entryId: number) {
  await requireAdmin();
  const [e] = await db.select().from(partnerEntries).where(eq(partnerEntries.id, entryId));
  if (!e || e.type === "PROFIT_SHARE") return; // profit shares are removed by reopening the month
  if (e.transferGroup) await db.delete(partnerEntries).where(eq(partnerEntries.transferGroup, e.transferGroup));
  else await db.delete(partnerEntries).where(eq(partnerEntries.id, entryId));
  reval();
}

export type MonthState = { error?: string };

export async function closeCompanyMonthAction(period: string, _prev: MonthState): Promise<MonthState> {
  const user = await requireAdmin();
  if (!isPeriod(period)) return { error: "Invalid month" };
  try {
    await closeCompanyMonth(period, user.id, BOOKS_START);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not close the month." };
  }
  reval();
  return {};
}

export async function reopenCompanyMonthAction(period: string, _prev: MonthState): Promise<MonthState> {
  await requireAdmin();
  try {
    await reopenCompanyMonth(period);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not reopen the month." };
  }
  reval();
  return {};
}
