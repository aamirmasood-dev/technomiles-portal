import { describe, expect, it } from "vitest";
import { mapBalanceTransaction, mapOrder, toMinorUnits, type ShopifyOrderNode } from "../map";

const gbp = (amount: string) => ({ shopMoney: { amount, currencyCode: "GBP" } });

function order(over: Partial<ShopifyOrderNode> = {}): ShopifyOrderNode {
  return {
    id: "gid://shopify/Order/5001",
    name: "#2537",
    processedAt: "2026-10-05T10:00:00Z",
    cancelledAt: null,
    test: false,
    taxesIncluded: true,
    displayFinancialStatus: "PAID",
    subtotalPriceSet: gbp("120.00"), // incl. 20.00 VAT
    totalShippingPriceSet: gbp("6.00"), // incl. 1.00 VAT
    totalTaxSet: gbp("21.00"),
    currentTotalPriceSet: gbp("126.00"),
    shippingLines: { nodes: [{ taxLines: [{ priceSet: gbp("1.00") }] }] },
    lineItems: {
      nodes: [
        { id: "gid://shopify/LineItem/1", sku: "DUV-KING", name: "Goose Down Duvet - King", quantity: 1, isGiftCard: false, originalUnitPriceSet: gbp("120.00"), discountedTotalSet: gbp("120.00") },
      ],
    },
    refunds: [],
    ...over,
  };
}

describe("toMinorUnits", () => {
  it("parses decimal strings", () => {
    expect(toMinorUnits("126.00")).toBe(12600);
    expect(toMinorUnits("-0.5")).toBe(-50);
    expect(toMinorUnits("3.456")).toBe(346);
    expect(toMinorUnits(null)).toBe(0);
  });
});

describe("mapOrder", () => {
  it("splits tax out of tax-inclusive prices", () => {
    const r = mapOrder(order(), "GBP")!;
    const by = Object.fromEntries(r.lines.map((l) => [l.category, l.amount]));
    expect(by).toEqual({ SALES: 10000, SHIPPING_CHARGED: 500, TAX_COLLECTED: 2100 });
    expect(r.order).toMatchObject({ externalId: "5001", orderNumber: "#2537", status: "PAID", total: 12600 });
    expect(r.order.items).toEqual([{ externalId: "1", sku: "DUV-KING", title: "Goose Down Duvet - King", quantity: 1, unitPrice: 12000 }]);
    expect(r.order.lineIds).toEqual(["order:5001:sales", "order:5001:shipping", "order:5001:tax"]);
  });

  it("uses the subtotal as-is when prices exclude tax", () => {
    const r = mapOrder(order({ taxesIncluded: false, subtotalPriceSet: gbp("100.00"), totalShippingPriceSet: gbp("5.00"), totalTaxSet: gbp("0.00") }), "GBP")!;
    expect(r.lines.map((l) => [l.category, l.amount])).toEqual([
      ["SALES", 10000],
      ["SHIPPING_CHARGED", 500],
    ]);
  });

  it("records refunds on their own date, net of refunded tax", () => {
    const r = mapOrder(
      order({
        displayFinancialStatus: "PARTIALLY_REFUNDED",
        refunds: [{ id: "gid://shopify/Refund/77", createdAt: "2026-11-10T09:00:00Z", totalRefundedSet: gbp("60.00"), refundLineItems: { nodes: [{ totalTaxSet: gbp("10.00") }] } }],
      }),
      "GBP",
    )!;
    const refund = r.lines.find((l) => l.externalId === "refund:77")!;
    expect(refund).toMatchObject({ category: "REFUNDS", amount: -5000 });
    expect(refund.postedAt.toISOString()).toBe("2026-11-10T09:00:00.000Z");
    expect(r.lines.find((l) => l.externalId === "refund:77:tax")).toMatchObject({ category: "TAX_COLLECTED", amount: -1000 });
  });

  it("skips test orders and gives unpaid orders no money lines", () => {
    expect(mapOrder(order({ test: true }), "GBP")).toBeNull();
    const r = mapOrder(order({ displayFinancialStatus: "PENDING" }), "GBP")!;
    expect(r.lines).toEqual([]);
    expect(r.order.status).toBe("UNPAID");
  });

  it("marks cancelled orders and excludes gift cards from sales", () => {
    const r = mapOrder(
      order({
        cancelledAt: "2026-10-06T00:00:00Z",
        taxesIncluded: false,
        totalTaxSet: gbp("0.00"),
        totalShippingPriceSet: gbp("0.00"),
        subtotalPriceSet: gbp("150.00"),
        lineItems: {
          nodes: [
            { id: "gid://shopify/LineItem/1", sku: "A", name: "Pillow", quantity: 1, isGiftCard: false, originalUnitPriceSet: gbp("100.00"), discountedTotalSet: gbp("100.00") },
            { id: "gid://shopify/LineItem/2", sku: null, name: "Gift card", quantity: 1, isGiftCard: true, originalUnitPriceSet: gbp("50.00"), discountedTotalSet: gbp("50.00") },
          ],
        },
      }),
      "GBP",
    )!;
    expect(r.order.status).toBe("CANCELLED");
    expect(r.lines.find((l) => l.category === "SALES")!.amount).toBe(10000);
    expect(r.order.items).toHaveLength(1);
  });
});

describe("mapBalanceTransaction", () => {
  const bt = (type: string, amount: string, fee: string) => ({
    id: "gid://shopify/ShopifyPaymentsBalanceTransaction/9",
    type,
    test: false,
    transactionDate: "2026-10-05T10:05:00Z",
    amount: { amount, currencyCode: "GBP" },
    fee: { amount: fee, currencyCode: "GBP" },
    associatedOrder: { id: "gid://shopify/Order/5001", name: "#2537" },
  });

  it("turns the processing fee into a payment fee", () => {
    expect(mapBalanceTransaction(bt("CHARGE", "126.00", "2.77"))).toEqual([
      expect.objectContaining({ externalId: "bt:9:fee", category: "PAYMENT_FEES", amount: -277, orderExternalId: "5001" }),
    ]);
  });

  it("records chargebacks as adjustments", () => {
    const lines = mapBalanceTransaction(bt("DISPUTE_WITHDRAWAL", "-126.00", "15.00"));
    expect(lines.map((l) => [l.category, l.amount])).toEqual([
      ["PAYMENT_FEES", -1500],
      ["ADJUSTMENTS", -12600],
    ]);
  });

  it("ignores test transactions", () => {
    expect(mapBalanceTransaction({ ...bt("CHARGE", "1.00", "0.10"), test: true })).toEqual([]);
  });
});
