// Money is held as integer minor units (pence / cents) everywhere.

export function toMinor(input: string | number): number {
  const s = String(input).trim().replace(/[,\s£$€]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Not a valid amount: ${input}`);
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  // Round half away from zero on the third decimal.
  let minor = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (Number(frac[2] ?? 0) >= 5) minor += 1;
  return neg ? -minor : minor;
}

export function fromMinor(minor: number): string {
  const neg = minor < 0;
  const abs = Math.abs(minor);
  return `${neg ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatMoney(minor: number, currency: string): string {
  // `|| 0` turns -0 into 0 so zero never prints as "-£0.00".
  const locale = currency === "USD" ? "en-US" : "en-GB";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format((minor || 0) / 100);
}
