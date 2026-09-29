import "server-only";
import { and, desc, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import { db, clients, ledgerLines, orderItems, orders, stores, syncLogs } from "@/db";
import { CONNECTORS } from "./connectors";
import { ConnectorError, type StoreContext, type SyncBatch } from "./connectors/types";
import { decryptJson } from "./crypto";
import { localMidnightUtc } from "./period";

type Store = typeof stores.$inferSelect;

const OVERLAP_MS = 3 * 86400000; // re-fetch the last 3 days to catch late fees and refunds
const STALE_RUN_MS = 30 * 60000;

export function storeContext(s: Store): StoreContext {
  return { id: s.id, platform: s.platform, currency: s.currency, region: s.region, marketplaceId: s.marketplaceId, accountRef: s.accountRef };
}

export function storeCreds<T>(s: Store): T | null {
  return s.credentialsEnc ? decryptJson<T>(s.credentialsEnc) : null;
}

export type SyncResult = { status: "OK" | "ERROR" | "SKIPPED"; message: string; orders: number; lines: number };

export async function runSync(storeId: number): Promise<SyncResult> {
  const [row] = await db.select({ store: stores, tz: clients.timezone }).from(stores).innerJoin(clients, eq(clients.id, stores.clientId)).where(eq(stores.id, storeId));
  if (!row) return { status: "ERROR", message: "Store not found", orders: 0, lines: 0 };
  const { store, tz } = row;
  const connector = CONNECTORS[store.platform];
  if (!connector) return { status: "SKIPPED", message: `No connector for ${store.platform} yet`, orders: 0, lines: 0 };
  const creds = storeCreds(store);
  if (!creds) return { status: "SKIPPED", message: "Store is not connected", orders: 0, lines: 0 };

  const [running] = await db
    .select({ id: syncLogs.id })
    .from(syncLogs)
    .where(and(eq(syncLogs.storeId, store.id), eq(syncLogs.status, "RUNNING"), gt(syncLogs.startedAt, new Date(Date.now() - STALE_RUN_MS))))
    .limit(1);
  if (running) return { status: "SKIPPED", message: "A sync is already running for this store", orders: 0, lines: 0 };

  const [y, m, d] = store.syncStartDate.split("-").map(Number);
  const startFloor = localMidnightUtc(y, m, d, tz);
  const from = new Date(Math.max(startFloor.getTime(), store.lastSyncAt ? store.lastSyncAt.getTime() - OVERLAP_MS : 0));
  const to = new Date(Date.now() - 2 * 60000);

  const [{ id: logId }] = await db
    .insert(syncLogs)
    .values({ storeId: store.id, startedAt: new Date(), status: "RUNNING", rangeFrom: from, rangeTo: to })
    .$returningId();
  await db.update(stores).set({ lastSyncStatus: "RUNNING" }).where(eq(stores.id, store.id));

  const notes: string[] = [];
  let orderCount = 0;
  let lineCount = 0;
  try {
    for await (const batch of connector.fetch(storeContext(store), creds, from, to, (msg) => notes.push(msg))) {
      const r = await saveBatch(store.id, batch);
      orderCount += r.orders;
      lineCount += r.lines;
    }
    const message = [`${orderCount} orders, ${lineCount} transactions`, ...notes].join(". ");
    await db.update(syncLogs).set({ status: "OK", finishedAt: new Date(), ordersUpserted: orderCount, linesUpserted: lineCount, message }).where(eq(syncLogs.id, logId));
    await db.update(stores).set({ lastSyncStatus: "OK", lastSyncAt: to, lastSyncMessage: message }).where(eq(stores.id, store.id));
    return { status: "OK", message, orders: orderCount, lines: lineCount };
  } catch (e) {
    const message = e instanceof ConnectorError ? e.message : `Unexpected error: ${e instanceof Error ? e.message : String(e)}`;
    if (!(e instanceof ConnectorError)) console.error(`Sync failed for store ${store.id}`, e);
    await db.update(syncLogs).set({ status: "ERROR", finishedAt: new Date(), ordersUpserted: orderCount, linesUpserted: lineCount, message }).where(eq(syncLogs.id, logId));
    await db.update(stores).set({ lastSyncStatus: "ERROR", lastSyncMessage: message }).where(eq(stores.id, store.id));
    return { status: "ERROR", message, orders: orderCount, lines: lineCount };
  }
}

// Upserts one batch. Re-syncing the same data is safe: everything is keyed by (store, external id).
async function saveBatch(storeId: number, batch: SyncBatch): Promise<{ orders: number; lines: number }> {
  return db.transaction(async (tx) => {
    for (const o of batch.orders) {
      await tx
        .insert(orders)
        .values({ storeId, externalId: o.externalId, orderNumber: o.orderNumber, orderDate: o.orderDate, status: o.status, currency: o.currency, total: o.total })
        .onDuplicateKeyUpdate({ set: { orderNumber: o.orderNumber, orderDate: o.orderDate, status: o.status, currency: o.currency, total: o.total } });
    }
    const referenced = [...new Set([...batch.orders.map((o) => o.externalId), ...batch.lines.flatMap((l) => (l.orderExternalId ? [l.orderExternalId] : []))])];
    const idRows = referenced.length
      ? await tx.select({ id: orders.id, externalId: orders.externalId }).from(orders).where(and(eq(orders.storeId, storeId), inArray(orders.externalId, referenced)))
      : [];
    const orderId = new Map(idRows.map((r) => [r.externalId, r.id]));

    for (const o of batch.orders) {
      const id = orderId.get(o.externalId)!;
      for (const it of o.items) {
        await tx
          .insert(orderItems)
          .values({ orderId: id, externalId: it.externalId, sku: it.sku, title: it.title.slice(0, 512), quantity: it.quantity, unitPrice: it.unitPrice })
          .onDuplicateKeyUpdate({ set: { sku: it.sku, title: it.title.slice(0, 512), quantity: it.quantity, unitPrice: it.unitPrice } });
      }
      const keep = o.items.map((it) => it.externalId);
      await tx.delete(orderItems).where(and(eq(orderItems.orderId, id), keep.length ? notInArray(orderItems.externalId, keep) : sql`true`));
      // Money lines this order no longer produces (e.g. order became unpaid/voided).
      await tx
        .delete(ledgerLines)
        .where(
          and(
            eq(ledgerLines.storeId, storeId),
            eq(ledgerLines.orderExternalId, o.externalId),
            inArray(ledgerLines.sourceType, ["ORDER", "REFUND"]),
            o.lineIds.length ? notInArray(ledgerLines.externalId, o.lineIds) : sql`true`,
          ),
        );
    }

    for (const l of batch.lines) {
      const values = {
        orderId: l.orderExternalId ? (orderId.get(l.orderExternalId) ?? null) : null,
        orderExternalId: l.orderExternalId,
        postedAt: l.postedAt,
        category: l.category,
        amount: l.amount,
        currency: l.currency,
        description: l.description.slice(0, 512),
        sourceType: l.sourceType,
      };
      await tx.insert(ledgerLines).values({ storeId, externalId: l.externalId, ...values }).onDuplicateKeyUpdate({ set: values });
    }
    return { orders: batch.orders.length, lines: batch.lines.length };
  });
}

export async function recentSyncLogs(storeId: number, limit = 15) {
  return db.select().from(syncLogs).where(eq(syncLogs.storeId, storeId)).orderBy(desc(syncLogs.startedAt)).limit(limit);
}
