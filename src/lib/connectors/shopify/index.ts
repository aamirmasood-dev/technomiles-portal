import "server-only";
import type { Connector, SyncBatch } from "../types";
import { ConnectorError } from "../types";
import { shopifyGraphql, type ShopifyCreds } from "./client";
import { mapBalanceTransaction, mapOrder, type ShopifyBalanceTransactionNode, type ShopifyOrderNode } from "./map";

export const SHOPIFY_SCOPES = ["read_orders", "read_shopify_payments_payouts"];

const ORDERS_QUERY = `
query Orders($cursor: String, $q: String!) {
  orders(first: 25, after: $cursor, query: $q, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name processedAt cancelledAt test taxesIncluded displayFinancialStatus
      subtotalPriceSet { shopMoney { amount currencyCode } }
      totalShippingPriceSet { shopMoney { amount currencyCode } }
      totalTaxSet { shopMoney { amount currencyCode } }
      currentTotalPriceSet { shopMoney { amount currencyCode } }
      shippingLines(first: 5) { nodes { taxLines { priceSet { shopMoney { amount currencyCode } } } } }
      lineItems(first: 50) {
        nodes {
          id sku name quantity isGiftCard
          originalUnitPriceSet { shopMoney { amount currencyCode } }
          discountedTotalSet { shopMoney { amount currencyCode } }
        }
      }
      refunds(first: 20) {
        id createdAt
        totalRefundedSet { shopMoney { amount currencyCode } }
        refundLineItems(first: 50) { nodes { totalTaxSet { shopMoney { amount currencyCode } } } }
      }
    }
  }
}`;

const BALANCE_QUERY = `
query Balance($cursor: String, $q: String!) {
  shopifyPaymentsAccount {
    balanceTransactions(first: 100, after: $cursor, query: $q) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id type test transactionDate
        amount { amount currencyCode }
        fee { amount currencyCode }
        associatedOrder { id name }
      }
    }
  }
}`;

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

export const shopifyConnector: Connector<ShopifyCreds> = {
  async testConnection(_store, creds) {
    const data = await shopifyGraphql<{
      shop: { name: string; currencyCode: string; myshopifyDomain: string };
      currentAppInstallation: { accessScopes: { handle: string }[] };
    }>(creds, `{ shop { name currencyCode myshopifyDomain } currentAppInstallation { accessScopes { handle } } }`);
    const granted = new Set(data.currentAppInstallation.accessScopes.map((s) => s.handle));
    const missing = SHOPIFY_SCOPES.filter((s) => !granted.has(s));
    if (missing.length) {
      throw new ConnectorError(`Connected to ${data.shop.name}, but the app is missing these scopes: ${missing.join(", ")}.`);
    }
    return `${data.shop.name} (${data.shop.myshopifyDomain}, ${data.shop.currencyCode})`;
  },

  async *fetch(store, creds, from, to, log) {
    // Orders changed in the window (new orders, refunds, cancellations).
    const q = `updated_at:>='${iso(from)}' AND updated_at:<'${iso(to)}'`;
    let cursor: string | null = null;
    let pages = 0;
    do {
      const data: { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyOrderNode[] } } =
        await shopifyGraphql(creds, ORDERS_QUERY, { cursor, q });
      const batch: SyncBatch = { orders: [], lines: [] };
      for (const node of data.orders.nodes) {
        const mapped = mapOrder(node, store.currency);
        if (!mapped) continue;
        batch.orders.push(mapped.order);
        batch.lines.push(...mapped.lines);
      }
      pages++;
      yield batch;
      cursor = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
    } while (cursor);
    log(`Orders: ${pages} page(s)`);

    // Shopify Payments fees and chargebacks.
    const bq = `processed_at:>='${iso(from)}' AND processed_at:<'${iso(to)}'`;
    cursor = null;
    let first = true;
    do {
      const data: {
        shopifyPaymentsAccount: {
          balanceTransactions: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyBalanceTransactionNode[] };
        } | null;
      } = await shopifyGraphql(creds, BALANCE_QUERY, { cursor, q: bq });
      if (!data.shopifyPaymentsAccount) {
        if (first) log("Shopify Payments is not used on this store; payment fees must be entered as expenses.");
        break;
      }
      first = false;
      const bt = data.shopifyPaymentsAccount.balanceTransactions;
      yield { orders: [], lines: bt.nodes.flatMap(mapBalanceTransaction) };
      cursor = bt.pageInfo.hasNextPage ? bt.pageInfo.endCursor : null;
    } while (cursor);
  },
};
