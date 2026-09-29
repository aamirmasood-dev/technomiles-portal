import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import {
  db,
  businessSettings,
  clients,
  contractTerms,
  ledgerLines,
  manualExpenses,
  orderCosts,
  orders,
  recurringExpenses,
  shippingProviders,
  statementAdjustments,
  statements,
  stores,
} from "@/db";
import { loadConverter } from "@/lib/fx";
import { currentPeriod, localDate, monthRangeUtc, shiftPeriod } from "@/lib/period";
import { computeStatement, type EngineExpense, type EngineInput, type StatementResult } from "./engine";

type Client = typeof clients.$inferSelect;
type Term = typeof contractTerms.$inferSelect;
export type StatementRow = typeof statements.$inferSelect;

export function termCovers(term: Term, period: string) {
  return term.effectiveFrom <= period && (term.effectiveTo == null || term.effectiveTo >= period);
}

export async function termsForPeriod(clientId: number, period: string) {
  const terms = await db.select().from(contractTerms).where(eq(contractTerms.clientId, clientId)).orderBy(asc(contractTerms.id));
  return terms.filter((t) => termCovers(t, period));
}

// Everything the engine needs for one client/term/month, except the carry-forward values.
async function loadInputs(client: Client, term: Term, period: string): Promise<Omit<EngineInput, "lossBroughtForward" | "adjustments">> {
  const { start, end } = monthRangeUtc(period, client.timezone);
  const monthStart = `${period}-01`;
  const nextStart = `${shiftPeriod(period, 1)}-01`;

  const storeRows = await db.select().from(stores).where(eq(stores.clientId, client.id));
  const storeIds = storeRows.map((s) => s.id);
  const anyStore = storeIds.length > 0 ? inArray(ledgerLines.storeId, storeIds) : sql`false`;

  const [lineRows, expenseRows, recurringRows, providerRows, orderRows] = await Promise.all([
    db
      .select({
        storeId: ledgerLines.storeId,
        category: ledgerLines.category,
        amount: ledgerLines.amount,
        currency: ledgerLines.currency,
        postedAt: ledgerLines.postedAt,
      })
      .from(ledgerLines)
      .where(and(anyStore, gte(ledgerLines.postedAt, start), lt(ledgerLines.postedAt, end))),
    db
      .select()
      .from(manualExpenses)
      .where(and(eq(manualExpenses.clientId, client.id), gte(manualExpenses.expenseDate, monthStart), lt(manualExpenses.expenseDate, nextStart))),
    db
      .select()
      .from(recurringExpenses)
      .where(
        and(
          eq(recurringExpenses.clientId, client.id),
          eq(recurringExpenses.active, true),
          lte(recurringExpenses.startMonth, period),
          or(isNull(recurringExpenses.endMonth), gte(recurringExpenses.endMonth, period)),
        ),
      ),
    db.select({ id: shippingProviders.id, name: shippingProviders.name }).from(shippingProviders).where(eq(shippingProviders.clientId, client.id)),
    storeIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ order: orders, cost: orderCosts })
          .from(orders)
          .leftJoin(orderCosts, eq(orderCosts.orderId, orders.id))
          .where(
            and(
              inArray(orders.storeId, storeIds),
              gte(orders.orderDate, start),
              lt(orders.orderDate, end),
              or(isNull(orders.status), ne(orders.status, "CANCELLED")),
            ),
          ),
  ]);

  const lines = lineRows.map((l) => ({ ...l, date: localDate(l.postedAt, client.timezone) }));
  const expenses: EngineExpense[] = [
    ...expenseRows.map((e) => ({
      id: e.id,
      storeId: e.storeId,
      providerId: e.shippingProviderId,
      group: e.group,
      amount: e.amount,
      currency: e.currency,
      date: e.expenseDate,
      description: e.description ?? "",
      recurring: false,
    })),
    ...recurringRows.map((r) => ({
      id: `r${r.id}`,
      storeId: r.storeId,
      providerId: null,
      group: r.group,
      amount: r.amount,
      currency: r.currency,
      date: monthStart,
      description: r.description,
      recurring: true,
    })),
  ];
  const engineOrders = orderRows.map(({ order, cost }) => ({
    orderId: order.id,
    orderNumber: order.orderNumber ?? order.externalId,
    storeId: order.storeId,
    date: localDate(order.orderDate, client.timezone),
    cost: cost ? { itemCost: cost.itemCost, handling: cost.handling, currency: cost.currency, supplier: cost.supplier } : null,
  }));

  const convert = await loadConverter(client.currency, [
    ...lines.map((l) => ({ from: l.currency, date: l.date })),
    ...expenses.map((e) => ({ from: e.currency, date: e.date })),
    ...engineOrders.flatMap((o) => (o.cost ? [{ from: o.cost.currency, date: o.date }] : [])),
  ]);

  return {
    period,
    currency: client.currency,
    term: {
      rateBps: term.rateBps,
      fixedFee: term.fixedFee,
      groups: term.groups,
      includeShipping: term.includeShipping,
      includeTax: term.includeTax,
      storeIds: term.storeIds ?? null,
      carryForwardLoss: term.carryForwardLoss,
    },
    stores: storeRows.map((s) => ({ id: s.id, name: s.name, platform: s.platform })),
    providers: providerRows,
    lines,
    expenses,
    orders: engineOrders,
    convert,
  };
}

async function closedStatements(clientId: number, termId: number) {
  return db
    .select()
    .from(statements)
    .where(and(eq(statements.clientId, clientId), eq(statements.termId, termId)))
    .orderBy(asc(statements.period));
}

export type PendingAdjustment = { sourcePeriod: string; baseDelta: number };

// Differences between closed months' invoiced base and what the data says now.
async function driftSinceClosing(client: Client, term: Term, closed: StatementRow[]): Promise<PendingAdjustment[]> {
  if (closed.length === 0) return [];
  const applied = await db
    .select({ sourcePeriod: statementAdjustments.sourcePeriod, total: sql<string>`sum(${statementAdjustments.baseDelta})` })
    .from(statementAdjustments)
    .where(and(eq(statementAdjustments.clientId, client.id), eq(statementAdjustments.termId, term.id)))
    .groupBy(statementAdjustments.sourcePeriod);
  const alreadyApplied = new Map(applied.map((a) => [a.sourcePeriod, Number(a.total)]));

  const out: PendingAdjustment[] = [];
  for (const st of closed) {
    const snap = st.snapshot as StatementResult;
    const live = computeStatement({ ...(await loadInputs(client, term, st.period)), lossBroughtForward: 0, adjustments: [] });
    const delta = live.baseBeforeCarry - snap.baseBeforeCarry - (alreadyApplied.get(st.period) ?? 0);
    if (delta !== 0) out.push({ sourcePeriod: st.period, baseDelta: delta });
  }
  return out;
}

export type StatementView = {
  client: Client;
  term: Term;
  period: string;
  closed: StatementRow | null;
  result: StatementResult; // snapshot if closed, otherwise live
  drift: PendingAdjustment[]; // for a closed month: changes found since it was closed
  canClose: { ok: true } | { ok: false; reason: string };
  isLastClosed: boolean;
};

export async function getStatementView(client: Client, term: Term, period: string): Promise<StatementView> {
  const closed = await closedStatements(client.id, term.id);
  const byPeriod = new Map(closed.map((s) => [s.period, s]));
  const lastClosed = closed.at(-1)?.period ?? null;
  const thisClosed = byPeriod.get(period) ?? null;

  if (thisClosed) {
    const drift = (await driftSinceClosing(client, term, [thisClosed])).filter((d) => d.sourcePeriod === period);
    return {
      client,
      term,
      period,
      closed: thisClosed,
      result: thisClosed.snapshot as StatementResult,
      drift,
      canClose: { ok: false, reason: "Already closed." },
      isLastClosed: lastClosed === period,
    };
  }

  // Live: carry values come from the previous month (closed snapshot, or computed live).
  const firstOpen = lastClosed ? shiftPeriod(lastClosed, 1) : term.effectiveFrom;
  const pending = period === firstOpen ? await driftSinceClosing(client, term, closed) : [];
  const lossBroughtForward = await lossInto(client, term, period, byPeriod);
  const result = computeStatement({ ...(await loadInputs(client, term, period)), lossBroughtForward, adjustments: pending });

  let canClose: StatementView["canClose"] = { ok: true };
  if (period >= currentPeriod(client.timezone)) canClose = { ok: false, reason: "The month has not ended yet." };
  else if (period < term.effectiveFrom) canClose = { ok: false, reason: "This term does not cover this month." };
  else if (period !== firstOpen) canClose = { ok: false, reason: `Close ${firstOpen} first. Months are closed in order.` };
  else if (result.problems.length > 0) canClose = { ok: false, reason: "Resolve the problems listed below first." };

  return { client, term, period, closed: null, result, drift: [], canClose, isLastClosed: false };
}

// Loss carried out of the month before `period` (0 at the start of the term).
async function lossInto(client: Client, term: Term, period: string, closed: Map<string, StatementRow>, depth = 0): Promise<number> {
  const prev = shiftPeriod(period, -1);
  if (!term.carryForwardLoss || prev < term.effectiveFrom || depth > 36) return 0;
  const prevClosed = closed.get(prev);
  if (prevClosed) return prevClosed.lossCarriedOut;
  const lossBroughtForward = await lossInto(client, term, prev, closed, depth + 1);
  const r = computeStatement({ ...(await loadInputs(client, term, prev)), lossBroughtForward, adjustments: [] });
  return r.lossCarriedOut;
}

export async function closeStatement(client: Client, term: Term, period: string, userId: number): Promise<StatementRow> {
  const view = await getStatementView(client, term, period);
  if (!view.canClose.ok) throw new Error(view.canClose.reason);
  const r = view.result;

  return db.transaction(async (tx) => {
    const [settings] = await tx.select().from(businessSettings).where(eq(businessSettings.id, 1)).for("update");
    const prefix = settings?.invoicePrefix ?? "TM-";
    const number = settings?.nextInvoiceNumber ?? 1;
    const invoiceNumber = `${prefix}${String(number).padStart(4, "0")}`;
    if (settings) {
      await tx.update(businessSettings).set({ nextInvoiceNumber: number + 1 }).where(eq(businessSettings.id, 1));
    } else {
      await tx.insert(businessSettings).values({ id: 1, name: "Technomiles", nextInvoiceNumber: number + 1 });
    }
    const [{ id }] = await tx
      .insert(statements)
      .values({
        clientId: client.id,
        termId: term.id,
        period,
        currency: r.currency,
        base: r.base,
        amountDue: r.amountDue,
        lossCarriedOut: r.lossCarriedOut,
        invoiceNumber,
        snapshot: r,
        closedAt: new Date(),
        closedBy: userId,
      })
      .$returningId();
    if (r.adjustments.length > 0) {
      await tx.insert(statementAdjustments).values(
        r.adjustments.map((a) => ({
          clientId: client.id,
          termId: term.id,
          sourcePeriod: a.sourcePeriod,
          appliedPeriod: period,
          baseDelta: a.baseDelta,
          description: `Change to ${a.sourcePeriod} found after it was closed`,
        })),
      );
    }
    const [row] = await tx.select().from(statements).where(eq(statements.id, id));
    return row;
  });
}

// Undo the most recent close for a term (e.g. to fix a mistake before sending the invoice).
export async function reopenStatement(client: Client, term: Term, period: string) {
  const [last] = await db
    .select()
    .from(statements)
    .where(and(eq(statements.clientId, client.id), eq(statements.termId, term.id)))
    .orderBy(desc(statements.period))
    .limit(1);
  if (!last || last.period !== period) throw new Error("Only the most recently closed month can be reopened.");
  await db.transaction(async (tx) => {
    await tx
      .delete(statementAdjustments)
      .where(
        and(eq(statementAdjustments.clientId, client.id), eq(statementAdjustments.termId, term.id), eq(statementAdjustments.appliedPeriod, period)),
      );
    await tx.delete(statements).where(eq(statements.id, last.id));
  });
}
