import type { Category, Platform } from "@/db/schema";

// What every platform connector produces. Amounts are signed minor units, seller's point of view.
export type NormalizedLine = {
  externalId: string; // unique within the store, stable across re-syncs
  orderExternalId: string | null;
  postedAt: Date;
  category: Category;
  amount: number;
  currency: string;
  description: string;
  sourceType: string;
};

export type NormalizedOrder = {
  externalId: string;
  orderNumber: string;
  orderDate: Date;
  status: string; // CANCELLED and UNPAID orders need no cost entry
  currency: string;
  total: number;
  items: { externalId: string; sku: string | null; title: string; quantity: number; unitPrice: number | null }[];
  // All ledger line ids this order currently produces; stale ones are removed on re-sync.
  lineIds: string[];
};

export type SyncBatch = { orders: NormalizedOrder[]; lines: NormalizedLine[] };

export type StoreContext = {
  id: number;
  platform: Platform;
  currency: string;
  region: string | null;
  marketplaceId: string | null;
  accountRef: string | null;
};

export interface Connector<Creds> {
  // Checks the credentials and returns a short human-readable summary (e.g. shop name).
  testConnection(store: StoreContext, creds: Creds): Promise<string>;
  // Yields batches for everything changed in [from, to).
  fetch(store: StoreContext, creds: Creds, from: Date, to: Date, log: (msg: string) => void): AsyncGenerator<SyncBatch>;
}

export class ConnectorError extends Error {}
