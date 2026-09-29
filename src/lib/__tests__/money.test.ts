import { describe, expect, it } from "vitest";
import { fromMinor, toMinor } from "../money";

describe("toMinor", () => {
  it("parses amounts into minor units", () => {
    expect(toMinor("70")).toBe(7000);
    expect(toMinor("-9.00")).toBe(-900);
    expect(toMinor("0.48")).toBe(48);
    expect(toMinor("£1,981.90")).toBe(198190);
    expect(toMinor(-13.52)).toBe(-1352);
  });
  it("rounds half away from zero on the third decimal", () => {
    expect(toMinor("232.487")).toBe(23249);
    expect(toMinor("-17.394")).toBe(-1739);
    expect(toMinor("-0.005")).toBe(-1);
  });
  it("rejects junk", () => {
    expect(() => toMinor("--")).toThrow();
  });
});

describe("fromMinor", () => {
  it("formats minor units", () => {
    expect(fromMinor(198190)).toBe("1981.90");
    expect(fromMinor(-48)).toBe("-0.48");
    expect(fromMinor(0)).toBe("0.00");
  });
});
