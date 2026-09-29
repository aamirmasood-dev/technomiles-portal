import "server-only";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, clients, contractTerms, stores } from "@/db";

export function parseId(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return n;
}

export async function getClientOr404(id: number) {
  const [client] = await db.select().from(clients).where(eq(clients.id, id));
  if (!client) notFound();
  return client;
}

export async function getStoreOr404(clientId: number, storeId: number) {
  const [store] = await db
    .select()
    .from(stores)
    .where(and(eq(stores.id, storeId), eq(stores.clientId, clientId)));
  if (!store) notFound();
  return store;
}

export async function getTermOr404(clientId: number, termId: number) {
  const [term] = await db
    .select()
    .from(contractTerms)
    .where(and(eq(contractTerms.id, termId), eq(contractTerms.clientId, clientId)));
  if (!term) notFound();
  return term;
}
