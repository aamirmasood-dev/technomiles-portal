import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptJson, encryptJson } from "../crypto";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("credential encryption", () => {
  it("round-trips a value", () => {
    const creds = { clientId: "abc", clientSecret: "shh" };
    const enc = encryptJson(creds);
    expect(enc).not.toContain("shh");
    expect(decryptJson(enc)).toEqual(creds);
  });
  it("detects tampering", () => {
    const buf = Buffer.from(encryptJson({ a: 1 }), "base64");
    buf[buf.length - 1] ^= 1;
    expect(() => decryptJson(buf.toString("base64"))).toThrow();
  });
});
