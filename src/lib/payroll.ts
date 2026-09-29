import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, clients, invoices, payments, payrollItems, staffMembers } from "@/db";
import { getPkrRate } from "./invoices/service";
import { commissionFor, netPay } from "./partners/calc";
import { periodLabel } from "./period";
import { netSalesForStores } from "./statement/load";

type Staff = typeof staffMembers.$inferSelect;

// Contract: commission is converted "at the exchange rate received by the Company", i.e. the effective
// rate on the client's payments for that month's invoice. Until the client pays, today's interbank rate.
async function receivedRate(clientId: number, currency: string, period: string) {
  const invs = await db
    .select({ id: invoices.id, number: invoices.invoiceNumber })
    .from(invoices)
    .where(and(eq(invoices.clientId, clientId), eq(invoices.period, period), eq(invoices.currency, currency)));
  if (invs.length) {
    const pays = await db.select().from(payments).where(inArray(payments.invoiceId, invs.map((i) => i.id)));
    const amount = pays.reduce((a, p) => a + p.amount, 0);
    const pkr = pays.reduce((a, p) => a + p.pkrReceived, 0);
    if (amount > 0) return { rate: (pkr / amount).toFixed(6), source: `Rate received on invoice ${invs.map((i) => i.number).join(", ")}` };
  }
  const today = new Date().toISOString().slice(0, 10);
  const rate = await getPkrRate(currency, today);
  return { rate: rate ? Number(rate).toFixed(6) : null, source: `Interbank rate ${today} (client has not paid ${periodLabel(period)} yet)` };
}

export async function commissionWorking(staff: Staff, period: string) {
  if (staff.payType !== "COMMISSION" || !staff.commissionClientId || !staff.commissionStoreIds?.length) return null;
  const [client] = await db.select().from(clients).where(eq(clients.id, staff.commissionClientId));
  if (!client) return null;
  const { net, currency } = await netSalesForStores(client, staff.commissionStoreIds, period);
  const amount = commissionFor(net, staff.commissionBps ?? 0);
  const fx = await receivedRate(client.id, currency, period);
  return { netSales: net, amount, currency, rate: fx.rate, source: fx.source, basePay: fx.rate ? Math.round(amount * Number(fx.rate)) : 0 };
}

// Creates draft payroll lines for every active staff member who has none for the month.
export async function preparePayroll(period: string) {
  const [staff, existing] = await Promise.all([
    db.select().from(staffMembers).where(eq(staffMembers.active, true)),
    db.select({ staffId: payrollItems.staffId }).from(payrollItems).where(eq(payrollItems.period, period)),
  ]);
  const have = new Set(existing.map((e) => e.staffId));
  for (const s of staff.filter((x) => !have.has(x.id))) {
    await db.insert(payrollItems).values(await draftFor(s, period));
  }
}

async function draftFor(s: Staff, period: string) {
  const c = await commissionWorking(s, period);
  const basePay = c ? c.basePay : (s.monthlySalary ?? 0);
  return {
    staffId: s.id,
    period,
    basePay,
    commissionBase: c?.netSales ?? null,
    commissionAmount: c?.amount ?? null,
    commissionCurrency: c?.currency ?? null,
    fxRate: c?.rate ?? null,
    fxSource: c?.source ?? null,
    netPay: netPay({ basePay, bonus: 0, deductions: 0, advance: 0 }),
  };
}

// Re-runs the commission working for an unpaid line (e.g. after late fees or the client's payment arrived).
export async function recalcPayrollItem(itemId: number) {
  const [item] = await db.select().from(payrollItems).where(eq(payrollItems.id, itemId));
  if (!item || item.paidDate) return;
  const [s] = await db.select().from(staffMembers).where(eq(staffMembers.id, item.staffId));
  if (!s) return;
  const d = await draftFor(s, item.period);
  await db
    .update(payrollItems)
    .set({ ...d, netPay: netPay({ basePay: d.basePay, bonus: item.bonus, deductions: item.deductions, advance: item.advance }) })
    .where(eq(payrollItems.id, itemId));
}
