// Pure mapping from Shopify Admin GraphQL payloads to orders and ledger lines.
import type { NormalizedLine, NormalizedOrder } from "../types";

type Money = { shopMoney: { amount: string; currencyCode: string } };

export type ShopifyOrderNode = {
  id: string; // gid://shopify/Order/123
  name: string; // #1001
  processedAt: string;
  cancelledAt: string | null;
  test: boolean;
  taxesIncluded: boolean;
  displayFinancialStatus: string | null;
  subtotalPriceSet: Money | null;
  totalShippingPriceSet: Money;
  totalTaxSet: Money | null;
  currentTotalPriceSet: Money;
  shippingLines: { nodes: { taxLines: { priceSet: Money }[] }[] };
  lineItems: {
    nodes: {
      id: string;
      sku: string | null;
      name: string;
      quantity: number;
      isGiftCard: boolean;
      originalUnitPriceSet: Money;
      discountedTotalSet: Money;
    }[];
  };
  refunds: {
    id: string;
    createdAt: string;
    totalRefundedSet: Money;
    refundLineItems: { nodes: { totalTaxSet: Money | null }[] };
  }[];
};

export type ShopifyBalanceTransactionNode = {
  id: string;
  type: string;
  test: boolean;
  transactionDate: string;
  amount: { amount: string; currencyCode: string };
  fee: { amount: string; currencyCode: string };
  associatedOrder: { id: string; name: string } | null;
};

// Financial statuses that mean money was actually taken.
const PAID_STATUSES = new Set(["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED", "REFUNDED"]);
const DISPUTE_TYPES = new Set(["DISPUTE_WITHDRAWAL", "DISPUTE_REVERSAL"]);

export function toMinorUnits(amount: string | undefined | null): number {
  if (!amount) return 0;
  const neg = amount.startsWith("-");
  const [whole, frac = ""] = amount.replace("-", "").split(".");
  const minor = Number(whole) * 100 + Number((frac + "00").slice(0, 2)) + (Number(frac[2] ?? 0) >= 5 ? 1 : 0);
  return neg ? -minor : minor;
}

const m = (x: Money | null | undefined) => toMinorUnits(x?.shopMoney.amount);
export const legacyId = (gid: string) => gid.split("/").pop()!.split("?")[0];

export function mapOrder(node: ShopifyOrderNode, shopCurrency: string): { order: NormalizedOrder; lines: NormalizedLine[] } | null {
  if (node.test) return null;
  const id = legacyId(node.id);
  const currency = node.currentTotalPriceSet.shopMoney.currencyCode || shopCurrency;
  const paid = PAID_STATUSES.has(node.displayFinancialStatus ?? "");
  const processedAt = new Date(node.processedAt);
  const lines: NormalizedLine[] = [];
  const line = (suffix: string, category: NormalizedLine["category"], amount: number, description: string, postedAt = processedAt) => {
    if (amount !== 0) {
      lines.push({ externalId: `order:${id}:${suffix}`, orderExternalId: id, postedAt, category, amount, currency, description, sourceType: "ORDER" });
    }
  };

  if (paid) {
    const totalTax = m(node.totalTaxSet);
    const shippingTax = node.shippingLines.nodes.reduce((a, s) => a + s.taxLines.reduce((b, t) => b + m(t.priceSet), 0), 0);
    const giftCards = node.lineItems.nodes.filter((li) => li.isGiftCard).reduce((a, li) => a + m(li.discountedTotalSet), 0);
    const shipping = m(node.totalShippingPriceSet);
    // With tax-inclusive prices, subtotal and shipping contain their tax: take it out.
    const sales = m(node.subtotalPriceSet) - giftCards - (node.taxesIncluded ? totalTax - shippingTax : 0);
    const shippingCharged = shipping - (node.taxesIncluded ? shippingTax : 0);
    line("sales", "SALES", sales, `Order ${node.name}`);
    line("shipping", "SHIPPING_CHARGED", shippingCharged, `Shipping ${node.name}`);
    line("tax", "TAX_COLLECTED", totalTax, `Tax ${node.name}`);

    for (const r of node.refunds) {
      const rid = legacyId(r.id);
      const total = m(r.totalRefundedSet);
      const tax = r.refundLineItems.nodes.reduce((a, x) => a + m(x.totalTaxSet), 0);
      const at = new Date(r.createdAt);
      if (total === 0) continue;
      lines.push({ externalId: `refund:${rid}`, orderExternalId: id, postedAt: at, category: "REFUNDS", amount: -(total - tax), currency, description: `Refund ${node.name}`, sourceType: "REFUND" });
      if (tax) {
        lines.push({ externalId: `refund:${rid}:tax`, orderExternalId: id, postedAt: at, category: "TAX_COLLECTED", amount: -tax, currency, description: `Tax refunded ${node.name}`, sourceType: "REFUND" });
      }
    }
  }

  const order: NormalizedOrder = {
    externalId: id,
    orderNumber: node.name,
    orderDate: processedAt,
    status: node.cancelledAt ? "CANCELLED" : paid ? (node.displayFinancialStatus ?? "PAID") : "UNPAID",
    currency,
    total: m(node.currentTotalPriceSet),
    items: node.lineItems.nodes
      .filter((li) => !li.isGiftCard)
      .map((li) => ({ externalId: legacyId(li.id), sku: li.sku || null, title: li.name, quantity: li.quantity, unitPrice: m(li.originalUnitPriceSet) })),
    lineIds: lines.map((l) => l.externalId),
  };
  return { order, lines };
}

export function mapBalanceTransaction(node: ShopifyBalanceTransactionNode): NormalizedLine[] {
  if (node.test) return [];
  const id = legacyId(node.id);
  const at = new Date(node.transactionDate);
  const orderId = node.associatedOrder ? legacyId(node.associatedOrder.id) : null;
  const ref = node.associatedOrder?.name ?? node.type.toLowerCase();
  const out: NormalizedLine[] = [];
  const fee = toMinorUnits(node.fee.amount);
  if (fee !== 0) {
    out.push({ externalId: `bt:${id}:fee`, orderExternalId: orderId, postedAt: at, category: "PAYMENT_FEES", amount: -fee, currency: node.fee.currencyCode, description: `Shopify Payments fee ${ref}`, sourceType: node.type });
  }
  if (DISPUTE_TYPES.has(node.type)) {
    const amount = toMinorUnits(node.amount.amount);
    if (amount !== 0) {
      out.push({ externalId: `bt:${id}:dispute`, orderExternalId: orderId, postedAt: at, category: "ADJUSTMENTS", amount, currency: node.amount.currencyCode, description: `Chargeback ${ref}`, sourceType: node.type });
    }
  }
  return out;
}
