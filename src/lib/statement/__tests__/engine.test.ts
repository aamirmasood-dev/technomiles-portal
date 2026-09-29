import { describe, expect, it } from "vitest";
import type { DeductionGroup } from "@/db/schema";
import { computeStatement, type EngineInput, type EngineLine } from "../engine";

const PLATFORM: DeductionGroup[] = ["REFUNDS", "MARKETPLACE", "PAYMENT", "SHIPPING", "ADVERTISING", "SUBSCRIPTIONS", "OTHER_PLATFORM"];

function input(over: Partial<EngineInput>): EngineInput {
  return {
    period: "2026-10",
    currency: "GBP",
    term: { rateBps: 1000, fixedFee: 0, groups: PLATFORM, includeShipping: true, includeTax: false, storeIds: null, carryForwardLoss: true },
    stores: [{ id: 1, name: "Kensingtons Bedding eBay", platform: "EBAY" }],
    providers: [{ id: 7, name: "Parcelforce" }],
    lines: [],
    expenses: [],
    orders: [],
    lossBroughtForward: 0,
    adjustments: [],
    convert: () => null,
    ...over,
  };
}

const line = (category: EngineLine["category"], amount: number, storeId = 1, currency = "GBP"): EngineLine => ({
  storeId,
  category,
  amount,
  currency,
  date: "2026-10-05",
});

// Totals from the Aug 2026 eBay "Order earnings" report for kensingtons-uk.
const kbEbayAugust = [
  line("SALES", 187515), // gross after discounts
  line("MARKETPLACE_FEES", -864), // FVF fixed
  line("MARKETPLACE_FEES", -24237), // FVF variable
  line("MARKETPLACE_FEES", -713), // regulatory
  line("MARKETPLACE_FEES", -10187), // very high INAD surcharge
  line("ADVERTISING", -12076), // Promoted Listings
  line("SHIPPING_LABELS", -612),
  line("REFUNDS", -17775),
];

describe("computeStatement", () => {
  it("matches eBay's order earnings for Kensingtons (contract method)", () => {
    const r = computeStatement(input({ lines: kbEbayAugust }));
    expect(r.gross.total).toBe(187515);
    expect(r.totalDeductions).toBe(48689 + 17775);
    expect(r.base).toBe(121051); // eBay "Order earnings" £1,210.51
    expect(r.share).toBe(12105); // 10%
    expect(r.stores[0].net).toBe(121051);
  });

  it("deducts courier costs and carries a loss forward", () => {
    const r = computeStatement(
      input({
        lines: kbEbayAugust,
        expenses: [
          { id: 1, storeId: null, providerId: 7, group: "SHIPPING", amount: 127000, currency: "GBP", date: "2026-10-31", description: "Parcelforce", recurring: false },
        ],
      }),
    );
    expect(r.couriers).toEqual([{ providerId: 7, name: "Parcelforce", amount: 127000 }]);
    expect(r.baseBeforeCarry).toBe(121051 - 127000);
    expect(r.base).toBe(0);
    expect(r.share).toBe(0);
    expect(r.lossCarriedOut).toBe(5949);
  });

  it("deducts a loss brought forward before paying a share", () => {
    const r = computeStatement(input({ lines: kbEbayAugust, lossBroughtForward: 21051 }));
    expect(r.base).toBe(100000);
    expect(r.share).toBe(10000);
    expect(r.lossCarriedOut).toBe(0);
  });

  it("adds adjustments carried in from closed months", () => {
    const r = computeStatement(input({ lines: kbEbayAugust, adjustments: [{ sourcePeriod: "2026-09", baseDelta: -1051 }] }));
    expect(r.base).toBe(120000);
  });

  it("drops a loss when the term does not carry losses", () => {
    const r = computeStatement(
      input({
        term: { ...input({}).term, carryForwardLoss: false },
        lines: [line("SALES", 1000), line("REFUNDS", -5000)],
        lossBroughtForward: 999,
      }),
    );
    expect(r.base).toBe(0);
    expect(r.lossCarriedOut).toBe(0);
  });

  it("excludes tax unless included, and shipping when excluded", () => {
    const lines = [line("SALES", 10000), line("SHIPPING_CHARGED", 500), line("TAX_COLLECTED", 2000)];
    expect(computeStatement(input({ lines })).gross.total).toBe(10500);
    const t = input({}).term;
    expect(computeStatement(input({ lines, term: { ...t, includeShipping: false } })).gross.total).toBe(10000);
    expect(computeStatement(input({ lines, term: { ...t, includeTax: true } })).gross.total).toBe(12500);
  });

  it("reports but does not deduct groups that are not ticked", () => {
    const r = computeStatement(
      input({ term: { ...input({}).term, groups: ["REFUNDS"] }, lines: [line("SALES", 10000), line("MARKETPLACE_FEES", -1000)] }),
    );
    expect(r.groups.find((g) => g.group === "MARKETPLACE")).toMatchObject({ total: 1000, applied: false });
    expect(r.base).toBe(10000);
  });

  it("converts foreign lines at the date's rate and flags missing rates", () => {
    const convert = (amount: number, from: string, date: string) =>
      from === "EUR" && date === "2026-10-05" ? Math.round(amount * 0.85) : null;
    const r = computeStatement(input({ lines: [line("SALES", 10000), line("SALES", 10000, 1, "EUR")], convert }));
    expect(r.gross.sales).toBe(18500);
    expect(r.foreign).toEqual([{ currency: "EUR", lines: 1 }]);
    const r2 = computeStatement(input({ lines: [line("SALES", 10000, 1, "USD")], convert }));
    expect(r2.problems).toEqual([{ kind: "MISSING_FX", message: "No exchange rate for USD on 2026-10-05 (1 line(s))." }]);
  });

  it("limits stores and store-less expenses to the term's stores", () => {
    const r = computeStatement(
      input({
        term: { ...input({}).term, storeIds: [1] },
        stores: [
          { id: 1, name: "A", platform: "EBAY" },
          { id: 2, name: "B", platform: "EBAY" },
        ],
        lines: [line("SALES", 10000, 1), line("SALES", 99999, 2)],
        expenses: [
          { id: 1, storeId: null, providerId: null, group: "SHIPPING", amount: 500, currency: "GBP", date: "2026-10-01", description: "all", recurring: false },
          { id: 2, storeId: 1, providerId: null, group: "SHIPPING", amount: 300, currency: "GBP", date: "2026-10-01", description: "A", recurring: false },
        ],
      }),
    );
    expect(r.gross.total).toBe(10000);
    expect(r.base).toBe(9700);
  });

  describe("Jawa-style net profit", () => {
    const jawaTerm = { rateBps: 5000, fixedFee: 0, groups: [...PLATFORM, "COGS", "PURCHASES", "OTHER_MANUAL"] as DeductionGroup[], includeShipping: true, includeTax: false, storeIds: null, carryForwardLoss: true };
    const base = {
      currency: "USD",
      term: jawaTerm,
      stores: [{ id: 1, name: "Jawa Amazon", platform: "AMAZON" }],
      providers: [{ id: 9, name: "ShipStation" }],
      lines: [line("SALES", 21500, 1, "USD"), line("MARKETPLACE_FEES", -4300, 1, "USD"), line("SUBSCRIPTION", -3999, 1, "USD")],
      expenses: [
        { id: 1, storeId: null, providerId: 9, group: "SHIPPING" as const, amount: 16551, currency: "USD", date: "2026-10-31", description: "ShipStation", recurring: false },
        { id: 2, storeId: null, providerId: null, group: "PURCHASES" as const, amount: 28108, currency: "USD", date: "2026-10-12", description: "Bulk chains", recurring: false },
      ],
    };

    it("deducts per-order costs and splits 50%", () => {
      const r = computeStatement(
        input({
          ...base,
          lines: [...base.lines, line("SALES", 100000, 1, "USD")],
          orders: [{ orderId: 1, orderNumber: "113-0127128", storeId: 1, date: "2026-10-05", cost: { itemCost: 10000, handling: 778, currency: "USD", supplier: "Supplier A" } }],
        }),
      );
      // 121500 - 4300 - 3999 - 16551 - 28108 - 10778 = 57764
      expect(r.base).toBe(57764);
      expect(r.share).toBe(28882);
      expect(r.cogs).toMatchObject({ total: 10778, orderCount: 1, costedCount: 1 });
      expect(r.problems).toEqual([]);
    });

    it("blocks when an order has no cost", () => {
      const r = computeStatement(input({ ...base, orders: [{ orderId: 2, orderNumber: "#2537", storeId: 1, date: "2026-10-22", cost: null }] }));
      expect(r.problems[0].kind).toBe("MISSING_COST");
      expect(r.cogs.missing[0].orderNumber).toBe("#2537");
    });
  });
});
