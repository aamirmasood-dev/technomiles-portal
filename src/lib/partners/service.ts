import "server-only";
import { and, asc, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db, companyAccounts, companyExpenses, companyMonths, partnerEntries, partners, payments, payrollItems, staffMembers } from "@/db";
import { monthBounds } from "@/lib/company";
import { periodLabel, shiftPeriod } from "@/lib/period";
import { partnerSettlements, splitProfit } from "./calc";

// Company result for a month on a cash basis: money received - expenses - salaries paid in that month.
export async function monthFigures(period: string) {
  const { from, toExclusive } = monthBounds(period);
  const [[inc], [exp], [pay]] = await Promise.all([
    db.select({ n: sql<string>`coalesce(sum(${payments.pkrReceived}), 0)` }).from(payments).where(and(gte(payments.receivedDate, from), lt(payments.receivedDate, toExclusive))),
    db
      .select({ n: sql<string>`coalesce(sum(${companyExpenses.pkrAmount}), 0)` })
      .from(companyExpenses)
      .where(and(gte(companyExpenses.expenseDate, from), lt(companyExpenses.expenseDate, toExclusive))),
    db
      .select({ n: sql<string>`coalesce(sum(${payrollItems.netPay}), 0)` })
      .from(payrollItems)
      .where(and(gte(payrollItems.paidDate, from), lt(payrollItems.paidDate, toExclusive))),
  ]);
  const income = Number(inc.n);
  const expenses = Number(exp.n);
  const payroll = Number(pay.n);
  return { income, expenses, payroll, profit: income - expenses - payroll };
}

export type LedgerRow = { date: string; kind: string; description: string; amount: number; entryId?: number; balance?: number };

// Everything that moves a partner's balance, oldest first, with a running balance.
export async function partnerLedger(partnerId: number): Promise<LedgerRow[]> {
  const [entries, exps, pays] = await Promise.all([
    db.select().from(partnerEntries).where(eq(partnerEntries.partnerId, partnerId)),
    db.select().from(companyExpenses).where(eq(companyExpenses.paidByPartnerId, partnerId)),
    db
      .select({ item: payrollItems, name: staffMembers.name })
      .from(payrollItems)
      .innerJoin(staffMembers, eq(staffMembers.id, payrollItems.staffId))
      .where(and(eq(payrollItems.paidByPartnerId, partnerId), isNotNull(payrollItems.paidDate))),
  ]);
  const rows: LedgerRow[] = [
    ...entries.map((e): LedgerRow => ({ date: e.entryDate, kind: e.type, description: e.description, amount: e.amount, entryId: e.id })),
    ...exps.map((e): LedgerRow => ({ date: e.expenseDate, kind: "EXPENSE_PAID", description: `Paid company expense: ${e.description}`, amount: e.pkrAmount })),
    ...pays.map(({ item, name }): LedgerRow => ({ date: item.paidDate!, kind: "SALARY_PAID", description: `Paid salary: ${name}, ${periodLabel(item.period)}`, amount: item.netPay })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.entryId ?? 0) - (b.entryId ?? 0));
  let bal = 0;
  for (const r of rows) r.balance = bal += r.amount;
  return rows;
}

export async function partnerSummary() {
  const list = await db.select().from(partners).where(eq(partners.active, true)).orderBy(asc(partners.id));
  const withBalances = await Promise.all(
    list.map(async (p) => {
      const ledger = await partnerLedger(p.id);
      return { partner: p, ledger, balance: ledger.at(-1)?.balance ?? 0 };
    }),
  );
  const settlements = partnerSettlements(withBalances.map((w) => ({ id: w.partner.id, shareBps: w.partner.shareBps, balance: w.balance })));
  return { partners: withBalances, settlements };
}

export async function closedMonths() {
  return db.select().from(companyMonths).orderBy(desc(companyMonths.period));
}

// Posts each partner's share of the month's profit (or loss). Months close in order.
export async function closeCompanyMonth(period: string, userId: number, firstPeriod: string) {
  const [last] = await db.select().from(companyMonths).orderBy(desc(companyMonths.period)).limit(1);
  const expected = last ? shiftPeriod(last.period, 1) : null;
  if (last && period !== expected) throw new Error(`Close ${periodLabel(expected!)} first. Months are closed in order.`);
  if (!last && period < firstPeriod) throw new Error(`The company books start in ${periodLabel(firstPeriod)}.`);
  const f = await monthFigures(period);
  const list = await db.select().from(partners).where(eq(partners.active, true)).orderBy(asc(partners.id));
  const { toExclusive } = monthBounds(period);
  const lastDay = new Date(Date.parse(`${toExclusive}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  await db.transaction(async (tx) => {
    await tx.insert(companyMonths).values({ period, ...f, closedAt: new Date(), closedBy: userId });
    const shares = splitProfit(f.profit, list);
    if (shares.length) {
      await tx.insert(partnerEntries).values(
        shares.map((s) => ({
          partnerId: s.partnerId,
          entryDate: lastDay,
          type: "PROFIT_SHARE" as const,
          amount: s.amount,
          description: `${f.profit >= 0 ? "Profit" : "Loss"} share for ${periodLabel(period)}`,
          period,
          createdBy: userId,
        })),
      );
    }
  });
}

export async function reopenCompanyMonth(period: string) {
  const [last] = await db.select().from(companyMonths).orderBy(desc(companyMonths.period)).limit(1);
  if (!last || last.period !== period) throw new Error("Only the most recently closed month can be reopened.");
  await db.transaction(async (tx) => {
    await tx.delete(partnerEntries).where(and(eq(partnerEntries.type, "PROFIT_SHARE"), eq(partnerEntries.period, period)));
    await tx.delete(companyMonths).where(eq(companyMonths.id, last.id));
  });
}

// Bank balance: opening + received - expenses - salaries - partner withdrawals paid from the account.
export async function accountBalances() {
  const accounts = await db.select().from(companyAccounts).where(eq(companyAccounts.active, true)).orderBy(asc(companyAccounts.id));
  return Promise.all(
    accounts.map(async (a) => {
      const sum = async (q: Promise<{ n: string }[]>) => Number((await q)[0].n);
      const [inflow, exp, pay, withdrawals] = await Promise.all([
        sum(db.select({ n: sql<string>`coalesce(sum(${payments.pkrReceived}), 0)` }).from(payments).where(and(eq(payments.accountId, a.id), gte(payments.receivedDate, a.openingDate)))),
        sum(db.select({ n: sql<string>`coalesce(sum(${companyExpenses.pkrAmount}), 0)` }).from(companyExpenses).where(and(eq(companyExpenses.accountId, a.id), gte(companyExpenses.expenseDate, a.openingDate)))),
        sum(db.select({ n: sql<string>`coalesce(sum(${payrollItems.netPay}), 0)` }).from(payrollItems).where(and(eq(payrollItems.accountId, a.id), gte(payrollItems.paidDate, a.openingDate)))),
        // Withdrawals are stored negative on the partner, so adding them reduces the bank.
        sum(db.select({ n: sql<string>`coalesce(sum(${partnerEntries.amount}), 0)` }).from(partnerEntries).where(and(eq(partnerEntries.accountId, a.id), gte(partnerEntries.entryDate, a.openingDate)))),
      ]);
      return { account: a, balance: a.openingBalance + inflow - exp - pay + withdrawals };
    }),
  );
}
