// Periods are calendar months "YYYY-MM" in the client's timezone.

export function isPeriod(v: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const idx = y * 12 + (m - 1) + months;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

// Offset of `tz` from UTC at the given instant, in milliseconds.
function tzOffsetMs(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

// UTC instant of local midnight on the given day in `tz`.
export function localMidnightUtc(y: number, m: number, d: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffsetMs(guess, tz);
  t = guess - tzOffsetMs(t, tz); // re-check across DST changes
  return new Date(t);
}

// [start, end) of the month in UTC.
export function monthRangeUtc(period: string, tz: string): { start: Date; end: Date } {
  const [y, m] = period.split("-").map(Number);
  const [ny, nm] = shiftPeriod(period, 1).split("-").map(Number);
  return { start: localMidnightUtc(y, m, 1, tz), end: localMidnightUtc(ny, nm, 1, tz) };
}

// "YYYY-MM-DD" of an instant as seen in `tz`.
export function localDate(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

export function currentPeriod(tz: string, now = new Date()): string {
  return localDate(now, tz).slice(0, 7);
}
