"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, billingPlans, clients, invoices, payments } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { fieldErrors, formObject, moneyInput, optStr, type FormState } from "@/lib/form";
import { createInvoice, getPkrRate, recordReceipt } from "@/lib/invoices/service";
import { toMinor } from "@/lib/money";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const currency = z.string().regex(/^[A-Z]{3}$/, "Pick a currency");
const rate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine((v) => v == null || /^\d+(\.\d+)?$/.test(v), "Enter a rate like 367.12")
  .transform((v) => (v == null ? null : Number(v).toFixed(6)));

function revalidateAll(clientId?: number | null) {
  revalidatePath("/company", "layout");
  if (clientId) revalidatePath(`/clients/${clientId}`, "layout");
}

// ---------- Invoices ----------

const invoiceSchema = z.object({
  clientId: z.coerce.number().int().positive("Pick a client"),
  issueDate: date,
  dueDate: date,
  currency,
  pkrRate: rate,
  notes: optStr(2000),
});

export async function saveNewInvoice(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const parsed = invoiceSchema.safeParse(formObject(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const descriptions = formData.getAll("lineDescription").map(String);
  const amounts = formData.getAll("lineAmount").map(String);
  const lines: { description: string; amount: number }[] = [];
  for (let i = 0; i < descriptions.length; i++) {
    if (!descriptions[i].trim() && !amounts[i]?.trim()) continue;
    if (!descriptions[i].trim()) return { error: `Line ${i + 1} needs a description.` };
    try {
      lines.push({ description: descriptions[i].trim().slice(0, 512), amount: toMinor(amounts[i]) });
    } catch {
      return { error: `Line ${i + 1}: enter an amount like 250.00` };
    }
  }
  if (lines.length === 0) return { error: "Add at least one line." };
  if (lines.reduce((a, l) => a + l.amount, 0) <= 0) return { error: "The invoice total must be more than zero." };
  const d = parsed.data;
  const planId = Number(formData.get("planId")) || null;

  const id = await db.transaction(async (tx) => {
    const newId = await createInvoice(tx, { ...d, lines, createdBy: user.id });
    // Invoicing a service plan moves its next due date on by one period.
    if (planId) {
      const [plan] = await tx.select().from(billingPlans).where(and(eq(billingPlans.id, planId), eq(billingPlans.clientId, d.clientId)));
      if (plan) {
        const next = new Date(`${plan.nextDueDate}T00:00:00Z`);
        if (plan.interval === "YEARLY") next.setUTCFullYear(next.getUTCFullYear() + 1);
        else next.setUTCMonth(next.getUTCMonth() + 1);
        await tx.update(billingPlans).set({ nextDueDate: next.toISOString().slice(0, 10) }).where(eq(billingPlans.id, plan.id));
      }
    }
    return newId;
  });
  revalidateAll(d.clientId);
  redirect(`/company/invoices/${id}`);
}

export async function updateInvoiceRate(invoiceId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const r = rate.safeParse(formData.get("pkrRate"));
  if (!r.success) return { error: r.error.issues[0].message };
  await db.update(invoices).set({ pkrRate: r.data }).where(eq(invoices.id, invoiceId));
  revalidateAll();
  return { ok: "Rate saved" };
}

export async function settleInvoice(invoiceId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const note = String(formData.get("note") ?? "").trim() || "Marked as fully received";
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) return { error: "Invoice not found." };
  await db.update(invoices).set({ settledAt: new Date(), settledNote: note.slice(0, 512) }).where(eq(invoices.id, invoiceId));
  revalidateAll(inv.clientId);
  return { ok: "Marked as fully received." };
}

export async function unsettleInvoice(invoiceId: number) {
  await requireAdmin();
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  await db.update(invoices).set({ settledAt: null, settledNote: null }).where(eq(invoices.id, invoiceId));
  revalidateAll(inv?.clientId);
}

export async function voidInvoice(invoiceId: number) {
  await requireAdmin();
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) return;
  const [paid] = await db.select({ id: payments.id }).from(payments).where(eq(payments.invoiceId, invoiceId)).limit(1);
  // Statement invoices are cancelled by reopening the month; paid invoices keep their history.
  if (paid || inv.statementId) redirect(`/company/invoices/${invoiceId}?cannotVoid=1`);
  await db.update(invoices).set({ voidedAt: new Date() }).where(eq(invoices.id, invoiceId));
  revalidateAll(inv.clientId);
}

// ---------- Payments received ----------

const receiptSchema = z.object({
  clientId: z.string().optional().nullable().transform((v) => (v ? Number(v) : null)),
  invoiceId: z.string().optional().nullable().transform((v) => (v === "AUTO" ? ("AUTO" as const) : v ? Number(v) : null)),
  receivedDate: date,
  currency,
  amount: moneyInput.refine((v) => v > 0, "Enter the amount received"),
  pkrReceived: moneyInput.refine((v) => v > 0, "Enter the PKR credited by the bank"),
  accountId: z.string().optional().nullable().transform((v) => (v ? Number(v) : null)),
  reference: optStr(191),
  description: optStr(512),
});

export async function saveReceipt(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const parsed = receiptSchema.safeParse(formObject(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const d = parsed.data;
  if (d.currency === "PKR" && d.pkrReceived !== d.amount) d.pkrReceived = d.amount;
  if (!d.clientId && d.invoiceId != null) return { error: "Pick the client for an invoice payment." };
  if (!d.clientId && !d.description) return { error: "Please fix the highlighted fields.", fieldErrors: { description: "Describe what this payment was for" } };
  if (typeof d.invoiceId === "number") {
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, d.invoiceId));
    if (!inv || inv.clientId !== d.clientId) return { error: "That invoice does not belong to this client." };
    if (inv.currency !== d.currency) return { error: `Invoice ${inv.invoiceNumber} is in ${inv.currency}; record the payment in ${inv.currency}.` };
  }
  const parts = await recordReceipt({ ...d, createdBy: user.id });
  revalidateAll(d.clientId);
  return { ok: parts > 1 ? `Payment recorded and split across ${parts} invoices (oldest first).` : "Payment recorded." };
}

export async function deletePayment(paymentId: number) {
  await requireAdmin();
  const [p] = await db.select().from(payments).where(eq(payments.id, paymentId));
  await db.delete(payments).where(eq(payments.id, paymentId));
  revalidateAll(p?.clientId);
}

// ---------- Billing plans (service clients) ----------

const planSchema = z.object({
  description: z.string().trim().min(1, "Required").max(512),
  amount: moneyInput.refine((v) => v > 0, "Enter the amount"),
  currency,
  interval: z.enum(["MONTHLY", "YEARLY"]),
  nextDueDate: date,
});

export async function addBillingPlan(clientId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = planSchema.safeParse(formObject(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId));
  if (!client) return { error: "Client not found." };
  await db.insert(billingPlans).values({ ...parsed.data, clientId });
  revalidateAll(clientId);
  return { ok: "Billing plan added." };
}

export async function toggleBillingPlan(clientId: number, planId: number, active: boolean) {
  await requireAdmin();
  await db.update(billingPlans).set({ active }).where(and(eq(billingPlans.id, planId), eq(billingPlans.clientId, clientId)));
  revalidateAll(clientId);
}

export async function currentPkrRate(currency: string) {
  await requireAdmin();
  return getPkrRate(currency, new Date().toISOString().slice(0, 10));
}


