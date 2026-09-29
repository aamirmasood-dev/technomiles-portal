import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, fxRates } from "@/db";
import type { Converter } from "./statement/engine";

// ECB reference rates via frankfurter (free, no key). Weekends/holidays return the previous business day.
const FX_API = "https://api.frankfurter.dev/v1";

type Need = { from: string; date: string };

// Makes sure rates for every (from -> to, date) exist in fx_rates, fetching missing ones.
// Returns a converter backed by the cached rates; unknown rates convert to null.
export async function loadConverter(to: string, needs: Need[]): Promise<Converter> {
  const today = new Date().toISOString().slice(0, 10);
  const wanted = uniq(needs.filter((n) => n.from !== to).map((n) => `${n.from}|${n.date}`)).map((k) => {
    const [from, date] = k.split("|");
    return { from, date };
  });
  const rates = new Map<string, number>();
  if (wanted.length > 0) {
    const rows = await db
      .select()
      .from(fxRates)
      .where(
        and(
          eq(fxRates.quote, to),
          inArray(fxRates.base, uniq(wanted.map((w) => w.from))),
          inArray(fxRates.rateDate, uniq(wanted.map((w) => w.date))),
        ),
      );
    for (const r of rows) rates.set(`${r.base}|${r.rateDate}`, Number(r.rate));

    for (const w of wanted) {
      const key = `${w.from}|${w.date}`;
      if (rates.has(key) || w.date > today) continue;
      const rate = await fetchRate(w.from, to, w.date);
      if (rate == null) continue;
      rates.set(key, rate);
      await db
        .insert(fxRates)
        .values({ rateDate: w.date, base: w.from, quote: to, rate: rate.toFixed(8) })
        .onDuplicateKeyUpdate({ set: { rate: rate.toFixed(8) } });
    }
  }

  return (amount, from, date) => {
    if (from === to) return amount;
    const rate = rates.get(`${from}|${date}`);
    return rate == null ? null : Math.round(amount * rate);
  };
}

async function fetchRate(from: string, to: string, date: string): Promise<number | null> {
  try {
    const res = await fetch(`${FX_API}/${date}?base=${from}&symbols=${to}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { rates?: Record<string, number> };
    return body.rates?.[to] ?? null;
  } catch {
    return null;
  }
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
