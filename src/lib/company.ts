import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, clients, companyAccounts, partners } from "@/db";
import { currentPeriod, isPeriod, shiftPeriod } from "./period";

export const COMPANY_TZ = "Asia/Karachi";
// First month of the company books (profit sharing starts here).
export const BOOKS_START = "2026-10";

export function companyPeriod(searchParams: Record<string, string | string[] | undefined>) {
  const m = searchParams.month;
  return typeof m === "string" && isPeriod(m) ? m : currentPeriod(COMPANY_TZ);
}

export function monthBounds(period: string) {
  return { from: `${period}-01`, toExclusive: `${shiftPeriod(period, 1)}-01` };
}

export async function companyLookups() {
  const [accounts, partnerRows, clientRows] = await Promise.all([
    db.select().from(companyAccounts).where(eq(companyAccounts.active, true)).orderBy(asc(companyAccounts.id)),
    db.select().from(partners).where(eq(partners.active, true)).orderBy(asc(partners.id)),
    db.select({ id: clients.id, name: clients.name, currency: clients.currency }).from(clients).orderBy(asc(clients.name)),
  ]);
  return { accounts, partners: partnerRows, clients: clientRows };
}
