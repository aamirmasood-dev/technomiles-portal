import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db, billingPlans, clients, invoices, payments } from "@/db";
import { invoiceSummary, previousBalance } from "./calc";

// Every invoice with its status, newest first.
export async function allInvoices() {
  const [invs, clientRows] = await Promise.all([
    db.select().from(invoices).orderBy(desc(invoices.issueDate), desc(invoices.id)),
    db.select({ id: clients.id, name: clients.name }).from(clients),
  ]);
  const pays = invs.length ? await db.select().from(payments).where(inArray(payments.invoiceId, invs.map((i) => i.id))) : [];
  const clientName = new Map(clientRows.map((c) => [c.id, c.name]));
  const today = new Date().toISOString().slice(0, 10);
  return invs.map((i) => {
    const s = invoiceSummary(i, pays);
    return { invoice: i, clientName: clientName.get(i.clientId) ?? "", ...s, overdue: s.outstanding > 0 && i.dueDate < today };
  });
}

export async function invoiceDetail(id: number) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!inv) return null;
  const [clientInvs, clientPays, [client]] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.clientId, inv.clientId)),
    db.select().from(payments).where(eq(payments.clientId, inv.clientId)).orderBy(asc(payments.receivedDate)),
    db.select().from(clients).where(eq(clients.id, inv.clientId)),
  ]);
  return {
    invoice: inv,
    client,
    summary: invoiceSummary(inv, clientPays),
    previousBalance: previousBalance(inv, clientInvs, clientPays),
    payments: clientPays.filter((p) => p.invoiceId === inv.id),
  };
}

// Service plans whose next invoice is due within `days`.
export async function plansDue(days = 30) {
  const limit = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const rows = await db
    .select({ plan: billingPlans, clientName: clients.name })
    .from(billingPlans)
    .innerJoin(clients, eq(clients.id, billingPlans.clientId))
    .where(eq(billingPlans.active, true))
    .orderBy(asc(billingPlans.nextDueDate));
  return rows.filter((r) => r.plan.nextDueDate <= limit);
}
