"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, payrollItems, staffMembers } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { checkbox, fieldErrors, formObject, moneyInput, optStr, type FormState } from "@/lib/form";
import { netPay } from "@/lib/partners/calc";
import { isPeriod } from "@/lib/period";
import { preparePayroll, recalcPayrollItem } from "@/lib/payroll";

const reval = () => revalidatePath("/company", "layout");

export async function preparePayrollAction(period: string) {
  await requireAdmin();
  if (!isPeriod(period)) return;
  await preparePayroll(period);
  reval();
}

export async function recalcPayrollAction(itemId: number) {
  await requireAdmin();
  await recalcPayrollItem(itemId);
  reval();
}

const itemSchema = z.object({
  bonus: moneyInput,
  deductions: moneyInput,
  advance: moneyInput,
  notes: optStr(512),
  fxRate: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v.trim() : null))
    .refine((v) => v == null || /^\d+(\.\d+)?$/.test(v), "Enter a rate like 367.12"),
});

export async function updatePayrollItem(itemId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = itemSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [item] = await db.select().from(payrollItems).where(eq(payrollItems.id, itemId));
  if (!item) return { error: "Not found." };
  if (item.paidDate) return { error: "Already paid. Undo the payment to change it." };
  const d = parsed.data;
  let basePay = item.basePay;
  let fxRate = item.fxRate;
  let fxSource = item.fxSource;
  // A changed rate re-converts the commission to PKR.
  if (item.commissionAmount != null && d.fxRate && Number(d.fxRate).toFixed(6) !== Number(item.fxRate ?? 0).toFixed(6)) {
    fxRate = Number(d.fxRate).toFixed(6);
    fxSource = "Entered manually";
    basePay = Math.round(item.commissionAmount * Number(fxRate));
  }
  await db
    .update(payrollItems)
    .set({ bonus: d.bonus, deductions: d.deductions, advance: d.advance, notes: d.notes, basePay, fxRate, fxSource, netPay: netPay({ basePay, ...d }) })
    .where(eq(payrollItems.id, itemId));
  reval();
  return { ok: "Saved" };
}

const paySchema = z.object({
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  paidBy: z.string().regex(/^(account|partner):\d+$/),
});

export async function markPayrollPaid(itemId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = paySchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [kind, id] = parsed.data.paidBy.split(":");
  await db
    .update(payrollItems)
    .set({ paidDate: parsed.data.paidDate, paidByPartnerId: kind === "partner" ? Number(id) : null, accountId: kind === "account" ? Number(id) : null })
    .where(eq(payrollItems.id, itemId));
  reval();
  return { ok: "Marked as paid" };
}

export async function unpayPayrollItem(itemId: number) {
  await requireAdmin();
  await db.update(payrollItems).set({ paidDate: null, paidByPartnerId: null, accountId: null }).where(eq(payrollItems.id, itemId));
  reval();
}

export async function deletePayrollItem(itemId: number) {
  await requireAdmin();
  await db.delete(payrollItems).where(eq(payrollItems.id, itemId));
  reval();
}

// ---------- Staff ----------

const staffSchema = z.object({
  name: z.string().trim().min(1, "Required").max(191),
  jobTitle: optStr(),
  payType: z.enum(["SALARY", "COMMISSION"]),
  monthlySalary: moneyInput,
  commissionRate: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? Math.round(Number(v) * 100) : null)),
  commissionClientId: z.string().optional().nullable().transform((v) => (v ? Number(v) : null)),
  commissionStoreIds: z
    .union([z.string(), z.array(z.string()), z.null(), z.undefined()])
    .transform((v) => (v == null ? [] : Array.isArray(v) ? v : [v]).map(Number)),
  startDate: z.string().optional().nullable().transform((v) => (v ? v : null)),
  active: checkbox,
  notes: optStr(2000),
});

export async function saveStaff(staffId: number | null, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = staffSchema.safeParse(formObject(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const { commissionRate, ...d } = parsed.data;
  if (d.payType === "SALARY" && d.monthlySalary <= 0) return { error: "Please fix the highlighted fields.", fieldErrors: { monthlySalary: "Enter the monthly salary" } };
  if (d.payType === "COMMISSION") {
    if (!commissionRate) return { error: "Please fix the highlighted fields.", fieldErrors: { commissionRate: "Enter the commission %" } };
    if (!d.commissionClientId || d.commissionStoreIds.length === 0) return { error: "Pick the client and the stores the commission is based on." };
  }
  const values = {
    ...d,
    monthlySalary: d.payType === "SALARY" ? d.monthlySalary : null,
    commissionBps: d.payType === "COMMISSION" ? commissionRate : null,
    commissionClientId: d.payType === "COMMISSION" ? d.commissionClientId : null,
    commissionStoreIds: d.payType === "COMMISSION" ? d.commissionStoreIds : null,
  };
  if (staffId) await db.update(staffMembers).set(values).where(eq(staffMembers.id, staffId));
  else await db.insert(staffMembers).values(values);
  reval();
  redirect("/company/payroll");
}
