"use server";

import { and, eq, gte, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, companyExpenses, companyRecurringExpenses, COMPANY_EXPENSE_CATEGORIES } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { monthBounds } from "@/lib/company";
import { fieldErrors, formObject, moneyInput, optStr, type FormState } from "@/lib/form";
import { isPeriod } from "@/lib/period";

const schema = z.object({
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  category: z.enum(COMPANY_EXPENSE_CATEGORIES),
  description: z.string().trim().min(1, "Required").max(512),
  currency: z.string().regex(/^[A-Z]{3}$/),
  amount: moneyInput.refine((v) => v !== 0, "Enter the amount"),
  pkrAmount: moneyInput,
  paidBy: z.string().regex(/^(account|partner):\d+$/, "Pick who paid"),
  notes: optStr(2000),
});

function parse(formData: FormData) {
  const parsed = schema.safeParse(formObject(formData));
  if (!parsed.success) return { error: fieldErrors(parsed.error) };
  const { paidBy, ...d } = parsed.data;
  if (d.currency === "PKR") d.pkrAmount = d.amount;
  else if (!d.pkrAmount) return { error: { error: "Please fix the highlighted fields.", fieldErrors: { pkrAmount: "Enter what it cost in PKR" } } as FormState };
  const [kind, id] = paidBy.split(":");
  return {
    values: { ...d, paidByPartnerId: kind === "partner" ? Number(id) : null, accountId: kind === "account" ? Number(id) : null },
  };
}

export async function saveCompanyExpense(expenseId: number | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const r = parse(formData);
  if (r.error) return r.error;
  if (expenseId) {
    await db.update(companyExpenses).set(r.values!).where(eq(companyExpenses.id, expenseId));
    revalidatePath("/company", "layout");
    redirect(`/company/expenses?month=${r.values!.expenseDate.slice(0, 7)}`);
  }
  await db.insert(companyExpenses).values({ ...r.values!, createdBy: user.id });
  revalidatePath("/company", "layout");
  return { ok: "Expense added." };
}

export async function deleteCompanyExpense(expenseId: number) {
  await requireAdmin();
  await db.delete(companyExpenses).where(eq(companyExpenses.id, expenseId));
  revalidatePath("/company", "layout");
}

// ---------- Fixed monthly expenses ----------

const recurringSchema = z.object({
  category: z.enum(COMPANY_EXPENSE_CATEGORIES),
  description: z.string().trim().min(1, "Required").max(512),
  amount: moneyInput.refine((v) => v > 0, "Enter the usual monthly amount (PKR)"),
});

export async function addRecurringCompanyExpense(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = recurringSchema.safeParse(formObject(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  await db.insert(companyRecurringExpenses).values(parsed.data);
  revalidatePath("/company", "layout");
  return { ok: "Fixed expense added." };
}

export async function toggleRecurringCompanyExpense(id: number, active: boolean) {
  await requireAdmin();
  await db.update(companyRecurringExpenses).set({ active }).where(eq(companyRecurringExpenses.id, id));
  revalidatePath("/company", "layout");
}

// Adds every active fixed expense to the month (paid from the company account), skipping ones already added.
export async function addFixedExpensesForMonth(period: string, accountId: number) {
  const user = await requireAdmin();
  if (!isPeriod(period)) return;
  const { from, toExclusive } = monthBounds(period);
  const [templates, existing] = await Promise.all([
    db.select().from(companyRecurringExpenses).where(eq(companyRecurringExpenses.active, true)),
    db
      .select({ recurringId: companyExpenses.recurringId })
      .from(companyExpenses)
      .where(and(gte(companyExpenses.expenseDate, from), lt(companyExpenses.expenseDate, toExclusive))),
  ]);
  const done = new Set(existing.map((e) => e.recurringId));
  const toAdd = templates.filter((t) => !done.has(t.id));
  if (toAdd.length) {
    await db.insert(companyExpenses).values(
      toAdd.map((t) => ({
        expenseDate: from,
        category: t.category,
        description: t.description,
        currency: "PKR",
        amount: t.amount,
        pkrAmount: t.amount,
        accountId,
        recurringId: t.id,
        createdBy: user.id,
      })),
    );
  }
  revalidatePath("/company", "layout");
}
