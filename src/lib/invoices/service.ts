import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, businessSettings, fxRates, invoiceLines, invoices, payments } from "@/db";
import { allocateOldestFirst, invoiceSummary, previousBalance } from "./calc";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Interbank rate (PKR per 1 unit) from open.er-api.com, cached in fx_rates by date.
// Only today's rate is available from the free feed; older dates use whatever was cached.
export async function getPkrRate(currency: string, date: string): Promise<string | null> {
  if (currency === "PKR") return "1";
  const [cached] = await db
    .select({ rate: fxRates.rate })
    .from(fxRates)
    .where(and(eq(fxRates.rateDate, date), eq(fxRates.base, currency), eq(fxRates.quote, "PKR")));
  if (cached) return Number(cached.rate).toFixed(4);
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) return null;
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${currency}`, { signal: AbortSignal.timeout(10000) });
    const body = (await res.json()) as { result?: string; rates?: Record<string, number> };
    const rate = body.result === "success" ? body.rates?.PKR : undefined;
    if (!rate) return null;
    const value = rate.toFixed(6);
    await db.insert(fxRates).values({ rateDate: today, base: currency, quote: "PKR", rate: value }).onDuplicateKeyUpdate({ set: { rate: value } });
    return rate.toFixed(4);
  } catch {
    return null;
  }
}

// Takes the next number from business settings (shared by statements and invoices).
export async function takeInvoiceNumber(tx: Tx): Promise<{ number: string; paymentTermsDays: number }> {
  const [s] = await tx.select().from(businessSettings).where(eq(businessSettings.id, 1)).for("update");
  const prefix = s?.invoicePrefix ?? "TM-";
  const n = s?.nextInvoiceNumber ?? 1;
  if (s) await tx.update(businessSettings).set({ nextInvoiceNumber: n + 1 }).where(eq(businessSettings.id, 1));
  else await tx.insert(businessSettings).values({ id: 1, name: "Technomiles", nextInvoiceNumber: n + 1 });
  return { number: `${prefix}${String(n).padStart(4, "0")}`, paymentTermsDays: s?.paymentTermsDays ?? 14 };
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type NewInvoice = {
  clientId: number;
  issueDate: string;
  dueDate?: string;
  currency: string;
  lines: { description: string; amount: number }[];
  pkrRate: string | null;
  statementId?: number;
  period?: string;
  notes?: string | null;
  invoiceNumber?: string; // statements pass the number they already took
  createdBy: number | null;
};

export async function createInvoice(tx: Tx, inv: NewInvoice, paymentTermsDays?: number): Promise<number> {
  let number = inv.invoiceNumber;
  let terms = paymentTermsDays ?? 14;
  if (!number) ({ number, paymentTermsDays: terms } = await takeInvoiceNumber(tx));
  const amount = inv.lines.reduce((a, l) => a + l.amount, 0);
  const [{ id }] = await tx
    .insert(invoices)
    .values({
      clientId: inv.clientId,
      invoiceNumber: number,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate ?? addDays(inv.issueDate, terms),
      currency: inv.currency,
      amount,
      pkrRate: inv.pkrRate,
      statementId: inv.statementId ?? null,
      period: inv.period ?? null,
      notes: inv.notes ?? null,
      createdBy: inv.createdBy,
    })
    .$returningId();
  await tx.insert(invoiceLines).values(inv.lines.map((l, i) => ({ invoiceId: id, description: l.description, amount: l.amount, sortOrder: i })));
  return id;
}

// All invoices and payments of a client, with status and previous balance per invoice.
export async function clientInvoiceLedger(clientId: number) {
  const [invs, pays] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.clientId, clientId)).orderBy(asc(invoices.issueDate), asc(invoices.id)),
    db.select().from(payments).where(eq(payments.clientId, clientId)).orderBy(asc(payments.receivedDate), asc(payments.id)),
  ]);
  const rows = invs.map((i) => ({ invoice: i, ...invoiceSummary(i, pays), previousBalance: previousBalance(i, invs, pays) }));
  const outstandingByCurrency = new Map<string, number>();
  for (const r of rows) if (r.outstanding) outstandingByCurrency.set(r.invoice.currency, (outstandingByCurrency.get(r.invoice.currency) ?? 0) + r.outstanding);
  return { rows, payments: pays, outstandingByCurrency };
}

export type ReceiptInput = {
  clientId: number | null;
  invoiceId: number | "AUTO" | null; // AUTO = oldest unpaid first; null = not for an invoice
  receivedDate: string;
  currency: string;
  amount: number;
  pkrReceived: number;
  accountId: number | null;
  reference: string | null;
  description: string | null;
  createdBy: number;
};

// Records money received, splitting it across invoices when asked to.
export async function recordReceipt(r: ReceiptInput): Promise<number> {
  const base = {
    clientId: r.clientId,
    receivedDate: r.receivedDate,
    currency: r.currency,
    accountId: r.accountId,
    reference: r.reference,
    description: r.description,
    createdBy: r.createdBy,
  };
  if (r.invoiceId !== "AUTO") {
    await db.insert(payments).values({ ...base, invoiceId: r.invoiceId, amount: r.amount, pkrReceived: r.pkrReceived });
    return 1;
  }
  const open = r.clientId
    ? await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.clientId, r.clientId), eq(invoices.currency, r.currency), isNull(invoices.voidedAt), isNull(invoices.settledAt)))
    : [];
  const pays = open.length ? await db.select().from(payments).where(inArray(payments.invoiceId, open.map((i) => i.id))) : [];
  const { allocations } = allocateOldestFirst(
    r.amount,
    r.pkrReceived,
    open.map((i) => ({ id: i.id, issueDate: i.issueDate, outstanding: invoiceSummary(i, pays).outstanding })),
  );
  await db.transaction(async (tx) => {
    for (const a of allocations) await tx.insert(payments).values({ ...base, invoiceId: a.invoiceId, amount: a.amount, pkrReceived: a.pkr });
  });
  return allocations.length;
}
