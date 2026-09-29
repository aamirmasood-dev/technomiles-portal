// Demo data from the owner's Aug 2026 Excel workbooks, for trying the app before the connectors run.
//   npm run demo -- add      load it (and let the contract terms cover Aug/Sep 2026 so the profit sheet shows it)
//   npm run demo -- remove   delete every demo row and restore the terms to start in Oct 2026
// Demo rows are tagged: external ids start with "DEMO-", manual expense descriptions with "[DEMO]".
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { and, eq, inArray, like, lt } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as s from "../src/db/schema";

config({ path: ".env.local" });
config();

const DEMO = "DEMO-";
const LIVE_START = "2026-10";
const DEMO_START = "2026-08";

type Line = { cat: s.Category; amount: number; desc: string; date?: string };
type Fixture = {
  stores: {
    store: string;
    orders: {
      ext: string;
      number: string;
      date: string;
      currency: string;
      total: number;
      items: { sku: string | null; title: string; qty: number }[];
      lines: Line[];
      cost?: { itemCost: number; supplier: string } | null;
    }[];
    lines: Line[];
  }[];
  expenses: { client: string; provider: string | null; group: s.DeductionGroup; amount: number; currency: string; date: string; description: string }[];
};

type Db = MySql2Database<typeof s>;

// Noon UTC keeps the date the same in both UK and US timezones.
const at = (date: string) => new Date(`${date}T12:00:00Z`);

async function main() {
  const mode = process.argv[2];
  if (mode !== "add" && mode !== "remove") {
    console.error("Usage: npm run demo -- add | remove");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(conn, { schema: s, mode: "default" });
  await remove(db);
  if (mode === "add") await add(db);
  await conn.end();
}

async function remove(db: Db) {
  const demoOrders = await db.select({ id: s.orders.id }).from(s.orders).where(like(s.orders.externalId, `${DEMO}%`));
  const ids = demoOrders.map((o) => o.id);
  if (ids.length) {
    await db.delete(s.orderCosts).where(inArray(s.orderCosts.orderId, ids));
    await db.delete(s.orderItems).where(inArray(s.orderItems.orderId, ids));
    await db.delete(s.orders).where(inArray(s.orders.id, ids));
  }
  await db.delete(s.ledgerLines).where(like(s.ledgerLines.externalId, `${DEMO}%`));
  await db.delete(s.manualExpenses).where(like(s.manualExpenses.description, "[DEMO]%"));
  // Statements closed for demo months, and the adjustments they created.
  await db.delete(s.statementAdjustments).where(lt(s.statementAdjustments.appliedPeriod, LIVE_START));
  await db.delete(s.statements).where(lt(s.statements.period, LIVE_START));
  await db.update(s.contractTerms).set({ effectiveFrom: LIVE_START }).where(eq(s.contractTerms.effectiveFrom, DEMO_START));
  const [left] = await db.select({ id: s.statements.id }).from(s.statements).limit(1);
  if (!left) await db.update(s.businessSettings).set({ nextInvoiceNumber: 1 }).where(eq(s.businessSettings.id, 1));
  console.log(`Removed demo data (${ids.length} orders).`);
}

async function add(db: Db) {
  const fx: Fixture = JSON.parse(readFileSync(new URL("./demo/august-2026.json", import.meta.url), "utf8"));
  const storeRows = await db.select().from(s.stores);
  const byName = new Map(storeRows.map((st) => [st.name, st]));
  let orderCount = 0;
  let lineCount = 0;

  for (const fs of fx.stores) {
    const store = byName.get(fs.store);
    if (!store) {
      console.warn(`Skipped ${fs.store}: no store with that name`);
      continue;
    }
    for (const o of fs.orders) {
      const [{ id: orderId }] = await db
        .insert(s.orders)
        .values({ storeId: store.id, externalId: DEMO + o.ext, orderNumber: o.number, orderDate: at(o.date), currency: o.currency, total: o.total, status: "DEMO" })
        .$returningId();
      orderCount++;
      if (o.items.length) {
        await db.insert(s.orderItems).values(o.items.map((it, i) => ({ orderId, externalId: String(i), sku: it.sku, title: it.title, quantity: it.qty })));
      }
      if (o.cost) {
        await db.insert(s.orderCosts).values({ orderId, supplier: o.cost.supplier, itemCost: o.cost.itemCost, handling: 0, currency: o.currency });
      }
      await db.insert(s.ledgerLines).values(
        o.lines.map((l, i) => ({
          storeId: store.id,
          externalId: `${DEMO}${o.ext}-${i}`,
          orderId,
          orderExternalId: o.ext,
          postedAt: at(l.date ?? o.date),
          category: l.cat,
          amount: l.amount,
          currency: o.currency,
          description: l.desc,
          sourceType: "DEMO",
        })),
      );
      lineCount += o.lines.length;
    }
    if (fs.lines.length) {
      await db.insert(s.ledgerLines).values(
        fs.lines.map((l, i) => ({
          storeId: store.id,
          externalId: `${DEMO}${store.id}-store-${i}`,
          postedAt: at(l.date!),
          category: l.cat,
          amount: l.amount,
          currency: store.currency,
          description: l.desc,
          sourceType: "DEMO",
        })),
      );
      lineCount += fs.lines.length;
    }
  }

  const clientRows = await db.select().from(s.clients);
  const providers = await db.select().from(s.shippingProviders);
  for (const e of fx.expenses) {
    const client = clientRows.find((c) => c.name === e.client);
    if (!client) continue;
    const provider = providers.find((p) => p.clientId === client.id && p.name === e.provider);
    await db.insert(s.manualExpenses).values({
      clientId: client.id,
      shippingProviderId: provider?.id ?? null,
      expenseDate: e.date,
      group: e.group,
      amount: e.amount,
      currency: e.currency,
      description: `[DEMO] ${e.description}`,
    });
  }
  await db
    .update(s.contractTerms)
    .set({ effectiveFrom: DEMO_START })
    .where(and(eq(s.contractTerms.effectiveFrom, LIVE_START)));
  console.log(`Added demo data: ${orderCount} orders, ${lineCount} transactions, ${fx.expenses.length} expenses. Terms now start ${DEMO_START}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
