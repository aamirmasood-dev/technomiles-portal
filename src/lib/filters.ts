import "server-only";
import { currentPeriod, isPeriod, shiftPeriod } from "./period";

// ?month= for a client screen; defaults to last month in the client's timezone.
export function resolvePeriod(searchParams: Record<string, string | string[] | undefined>, timezone: string): string {
  const m = searchParams.month;
  return typeof m === "string" && isPeriod(m) ? m : shiftPeriod(currentPeriod(timezone), -1);
}
