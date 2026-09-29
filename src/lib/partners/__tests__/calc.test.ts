import { describe, expect, it } from "vitest";
import { commissionFor, netPay, partnerSettlements, splitProfit } from "../calc";

const k = (n: number) => n * 1000 * 100; // PKR thousands -> paisa

describe("payroll", () => {
  it("pays 1% commission only on positive net sales", () => {
    expect(commissionFor(121051, 100)).toBe(1211); // £1,210.51 -> £12.11
    expect(commissionFor(-5000, 100)).toBe(0);
    expect(commissionFor(0, 100)).toBe(0);
  });
  it("computes net pay", () => {
    expect(netPay({ basePay: k(70), bonus: k(5), deductions: k(2), advance: k(10) })).toBe(k(63));
  });
});

describe("profit sharing", () => {
  it("splits 50/50 and keeps every paisa", () => {
    expect(splitProfit(k(290), [{ id: 1, shareBps: 5000 }, { id: 2, shareBps: 5000 }])).toEqual([
      { partnerId: 1, amount: k(145) },
      { partnerId: 2, amount: k(145) },
    ]);
    expect(splitProfit(101, [{ id: 1, shareBps: 5000 }, { id: 2, shareBps: 5000 }]).map((p) => p.amount)).toEqual([51, 50]);
    expect(splitProfit(-k(20), [{ id: 1, shareBps: 5000 }, { id: 2, shareBps: 5000 }]).map((p) => p.amount)).toEqual([-k(10), -k(10)]);
  });
});

describe("partnerSettlements (owner's example)", () => {
  const aamir = 1;
  const imran = 2;
  it("Imran took 200k of a 145k share while Aamir took 90k: Imran owes Aamir 55k", () => {
    const s = partnerSettlements([
      { id: aamir, shareBps: 5000, balance: k(145) - k(90) },
      { id: imran, shareBps: 5000, balance: k(145) - k(200) },
    ]);
    expect(s).toEqual([{ from: imran, to: aamir, amount: k(55) }]);
  });

  it("accumulates when it happens again next month", () => {
    // Month 2: another 145k each; Imran takes 180k, Aamir 110k -> Imran over by another 35k.
    const s = partnerSettlements([
      { id: aamir, shareBps: 5000, balance: k(55) + k(145) - k(110) },
      { id: imran, shareBps: 5000, balance: -k(55) + k(145) - k(180) },
    ]);
    expect(s).toEqual([{ from: imran, to: aamir, amount: k(90) }]);
  });

  it("owes nothing between partners when both are equally paid or unpaid", () => {
    expect(partnerSettlements([{ id: aamir, shareBps: 5000, balance: k(145) }, { id: imran, shareBps: 5000, balance: k(145) }])).toEqual([]);
  });

  it("counts company expenses a partner paid personally in their favour", () => {
    // Both drew 100k of 145k shares, but Aamir also paid 40k rent personally.
    const s = partnerSettlements([
      { id: aamir, shareBps: 5000, balance: k(45) + k(40) },
      { id: imran, shareBps: 5000, balance: k(45) },
    ]);
    expect(s).toEqual([{ from: imran, to: aamir, amount: k(20) }]);
  });
});
