import { describe, expect, it } from "vitest";
import { allocateOldestFirst, invoiceSummary, previousBalance, type InvoiceLike } from "../calc";

const inv = (id: number, issueDate: string, amount: number, over: Partial<InvoiceLike> = {}): InvoiceLike => ({
  id,
  issueDate,
  currency: "GBP",
  amount,
  pkrRate: "370.00",
  settledAt: null,
  voidedAt: null,
  ...over,
});

describe("invoiceSummary", () => {
  it("tracks installments, PKR received and the exchange difference", () => {
    const aug = inv(1, "2026-09-05", 78400);
    const pays = [
      { invoiceId: 1, receivedDate: "2026-09-20", amount: 40000, pkrReceived: 14600000 }, // £400 -> PKR 146,000
    ];
    const s = invoiceSummary(aug, pays);
    expect(s).toMatchObject({ paid: 40000, outstanding: 38400, status: "PARTLY_PAID", pkrReceived: 14600000 });
    expect(s.pkrAtInvoiceRate).toBe(14800000); // £400 at 370
    expect(s.exchangeDifference).toBe(-200000); // received PKR 2,000 less than at invoice rate
    expect(s.pkrEquivalent).toBe(29008000);
  });

  it("marks fully received with a small shortfall written off", () => {
    const s = invoiceSummary(inv(1, "2026-09-05", 10000, { settledAt: new Date("2026-10-01") }), [
      { invoiceId: 1, receivedDate: "2026-09-30", amount: 9950, pkrReceived: 3600000 },
    ]);
    expect(s).toMatchObject({ status: "SETTLED", outstanding: 0, writtenOff: 50 });
  });

  it("is PAID when payments cover the amount, and VOID when voided", () => {
    expect(invoiceSummary(inv(1, "2026-09-05", 100), [{ invoiceId: 1, receivedDate: "2026-09-06", amount: 100, pkrReceived: 1 }]).status).toBe("PAID");
    expect(invoiceSummary(inv(1, "2026-09-05", 100, { voidedAt: new Date() }), []).status).toBe("VOID");
  });
});

describe("previousBalance", () => {
  it("carries the unpaid part of earlier invoices onto the next one", () => {
    const aug = inv(1, "2026-09-05", 78400);
    const sep = inv(2, "2026-10-05", 90000);
    const pays = [
      { invoiceId: 1, receivedDate: "2026-09-20", amount: 40000, pkrReceived: 0 },
      { invoiceId: 1, receivedDate: "2026-10-10", amount: 38400, pkrReceived: 0 }, // after Sep invoice was issued
    ];
    expect(previousBalance(sep, [aug, sep], pays)).toBe(38400);
    expect(previousBalance(aug, [aug, sep], pays)).toBe(0);
  });

  it("ignores other currencies, voided and already-settled invoices", () => {
    const next = inv(9, "2026-12-01", 100);
    const all = [
      inv(1, "2026-10-01", 500, { currency: "USD" }),
      inv(2, "2026-10-01", 500, { voidedAt: new Date() }),
      inv(3, "2026-10-01", 500, { settledAt: new Date("2026-11-01T00:00:00Z") }),
      inv(4, "2026-10-01", 500, { settledAt: new Date("2026-12-15T00:00:00Z") }), // settled after: still owed then
      next,
    ];
    expect(previousBalance(next, all, [])).toBe(500);
  });
});

describe("allocateOldestFirst", () => {
  it("pays the oldest invoice first and splits PKR in proportion", () => {
    const r = allocateOldestFirst(100000, 37000000, [
      { id: 2, issueDate: "2026-10-05", outstanding: 90000 },
      { id: 1, issueDate: "2026-09-05", outstanding: 38400 },
    ]);
    expect(r.allocations).toEqual([
      { invoiceId: 1, amount: 38400, pkr: 14208000 },
      { invoiceId: 2, amount: 61600, pkr: 22792000 },
    ]);
  });

  it("returns an unallocated remainder when the client overpays", () => {
    const r = allocateOldestFirst(1000, 3700, [{ id: 1, issueDate: "2026-09-05", outstanding: 600 }]);
    expect(r.allocations).toEqual([
      { invoiceId: 1, amount: 600, pkr: 2220 },
      { invoiceId: null, amount: 400, pkr: 1480 },
    ]);
  });
});
