import { describe, expect, it } from "vitest";
import { contractTerms, statements } from "../schema";

describe("JSON columns", () => {
  it("read MySQL JSON (already parsed) and MariaDB JSON (LONGTEXT string) alike", () => {
    expect(contractTerms.groups.mapFromDriverValue('["REFUNDS","MARKETPLACE"]' as never)).toEqual(["REFUNDS", "MARKETPLACE"]);
    expect(contractTerms.groups.mapFromDriverValue(["REFUNDS"] as never)).toEqual(["REFUNDS"]);
    expect(statements.snapshot.mapFromDriverValue('{"base":100}' as never)).toEqual({ base: 100 });
    expect(contractTerms.storeIds.mapToDriverValue([1, 2])).toBe("[1,2]");
  });
});
