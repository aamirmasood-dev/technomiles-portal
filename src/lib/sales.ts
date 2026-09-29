import "server-only";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db, clients, ledgerLines, orders, stores, type Platform } from "@/db";
import { loadConverter } from "./fx";
import { localDate } from "./period";

export type SalesFilter = { clientId: number | null; platform: Platform | null; storeId: number | null; from: string; to: string };

export type SalesBucket = { key: string; byPlatform: Partial<Record<Platform, number>>; total: number };

export type CurrencySales = {
  currency: string;
  gross: number; // sales + shipping charged
  refunds: number; // positive
  net: number;
  orderCount: number;
  granularity: "day" | "month";
  buckets: SalesBucket[];
  platforms: Platform[];
  rows: { clientId: number; clientName: string; storeId: number; storeName: string; platform: Platform; gross: number; refunds: number; net: number; orders: number }[];
};

const PLATFORM_ORDER: Platform[] = ["SHOPIFY", "EBAY", "AMAZON", "WALMART"];

function daysBetween(from: string, to: string) {
  return (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
}

function bucketKeys(from: string, to: string, granularity: "day" | "month"): string[] {
  const keys: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    const k = d.toISOString().slice(0, granularity === "day" ? 10 : 7);
    if (keys.at(-1) !== k) keys.push(k);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return keys;
}

// Sales per currency (never mixing GBP and USD), each client's lines converted to its own currency.
export async function salesAnalysis(f: SalesFilter): Promise<CurrencySales[]> {
  const storeRows = await db
    .select({ store: stores, client: clients })
    .from(stores)
    .innerJoin(clients, eq(clients.id, stores.clientId))
    .where(
      and(
        eq(clients.active, true),
        f.clientId ? eq(clients.id, f.clientId) : undefined,
        f.platform ? eq(stores.platform, f.platform) : undefined,
        f.storeId ? eq(stores.id, f.storeId) : undefined,
      ),
    );
  if (storeRows.length === 0) return [];
  const storeInfo = new Map(storeRows.map((r) => [r.store.id, r]));
  const ids = [...storeInfo.keys()];

  // Pad the UTC window by a day each side; exact filtering uses each client's local date below.
  const start = new Date(Date.parse(`${f.from}T00:00:00Z`) - 86400000);
  const end = new Date(Date.parse(`${f.to}T00:00:00Z`) + 2 * 86400000);
  const [lines, orderRows] = await Promise.all([
    db
      .select({ storeId: ledgerLines.storeId, category: ledgerLines.category, amount: ledgerLines.amount, currency: ledgerLines.currency, postedAt: ledgerLines.postedAt })
      .from(ledgerLines)
      .where(
        and(
          inArray(ledgerLines.storeId, ids),
          inArray(ledgerLines.category, ["SALES", "SHIPPING_CHARGED", "REFUNDS"]),
          gte(ledgerLines.postedAt, start),
          lt(ledgerLines.postedAt, end),
        ),
      ),
    db
      .select({ storeId: orders.storeId, orderDate: orders.orderDate, status: orders.status })
      .from(orders)
      .where(and(inArray(orders.storeId, ids), gte(orders.orderDate, start), lt(orders.orderDate, end))),
  ]);

  const granularity = daysBetween(f.from, f.to) > 62 ? "month" : "day";
  const keys = bucketKeys(f.from, f.to, granularity);
  const out = new Map<string, CurrencySales>();
  const get = (currency: string) => {
    let c = out.get(currency);
    if (!c) {
      c = { currency, gross: 0, refunds: 0, net: 0, orderCount: 0, granularity, buckets: keys.map((key) => ({ key, byPlatform: {}, total: 0 })), platforms: [], rows: [] };
      out.set(currency, c);
    }
    return c;
  };
  const rowFor = (c: CurrencySales, clientId: number, clientName: string, store: { id: number; name: string; platform: Platform }) => {
    let r = c.rows.find((x) => x.storeId === store.id);
    if (!r) {
      r = { clientId, clientName, storeId: store.id, storeName: store.name, platform: store.platform, gross: 0, refunds: 0, net: 0, orders: 0 };
      c.rows.push(r);
    }
    return r;
  };

  // Currency conversion per client currency.
  const converters = new Map<string, Awaited<ReturnType<typeof loadConverter>>>();
  const withDates = lines
    .map((l) => {
      const info = storeInfo.get(l.storeId)!;
      return { ...l, info, date: localDate(l.postedAt, info.client.timezone) };
    })
    .filter((l) => l.date >= f.from && l.date <= f.to);
  for (const cur of new Set(withDates.map((l) => l.info.client.currency))) {
    converters.set(
      cur,
      await loadConverter(
        cur,
        withDates.filter((l) => l.info.client.currency === cur).map((l) => ({ from: l.currency, date: l.date })),
      ),
    );
  }

  for (const l of withDates) {
    const { store, client } = l.info;
    const c = get(client.currency);
    const amount = converters.get(client.currency)!(l.amount, l.currency, l.date) ?? 0;
    const row = rowFor(c, client.id, client.name, store);
    if (l.category === "REFUNDS") {
      c.refunds -= amount;
      row.refunds -= amount;
    } else {
      c.gross += amount;
      row.gross += amount;
      const b = c.buckets.find((x) => x.key === l.date.slice(0, granularity === "day" ? 10 : 7));
      if (b) {
        b.byPlatform[store.platform] = (b.byPlatform[store.platform] ?? 0) + amount;
        b.total += amount;
      }
    }
  }
  for (const o of orderRows) {
    if (o.status === "CANCELLED") continue;
    const { store, client } = storeInfo.get(o.storeId)!;
    const date = localDate(o.orderDate, client.timezone);
    if (date < f.from || date > f.to) continue;
    const c = get(client.currency);
    c.orderCount++;
    rowFor(c, client.id, client.name, store).orders++;
  }

  for (const c of out.values()) {
    c.net = c.gross - c.refunds;
    for (const r of c.rows) r.net = r.gross - r.refunds;
    c.rows.sort(
      (a, b) =>
        a.clientName.localeCompare(b.clientName) ||
        PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform) ||
        a.storeName.localeCompare(b.storeName),
    );
    c.platforms = PLATFORM_ORDER.filter((p) => c.rows.some((r) => r.platform === p));
  }
  return [...out.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}
