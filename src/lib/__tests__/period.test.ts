import { describe, expect, it } from "vitest";
import { localDate, monthRangeUtc, shiftPeriod } from "../period";

describe("periods", () => {
  it("shifts months across years", () => {
    expect(shiftPeriod("2026-10", 1)).toBe("2026-11");
    expect(shiftPeriod("2026-12", 1)).toBe("2027-01");
    expect(shiftPeriod("2027-01", -1)).toBe("2026-12");
  });

  it("uses the client's timezone for month boundaries (incl. DST)", () => {
    const uk = monthRangeUtc("2026-10", "Europe/London");
    expect(uk.start.toISOString()).toBe("2026-09-30T23:00:00.000Z"); // BST
    expect(uk.end.toISOString()).toBe("2026-11-01T00:00:00.000Z"); // GMT
    const us = monthRangeUtc("2026-10", "America/Chicago");
    expect(us.start.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(us.end.toISOString()).toBe("2026-11-01T05:00:00.000Z");
  });

  it("formats local dates", () => {
    expect(localDate(new Date("2026-09-30T23:30:00Z"), "Europe/London")).toBe("2026-10-01");
    expect(localDate(new Date("2026-10-01T03:00:00Z"), "America/Chicago")).toBe("2026-09-30");
  });
});
