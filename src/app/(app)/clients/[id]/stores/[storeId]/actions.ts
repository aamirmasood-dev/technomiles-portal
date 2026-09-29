"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, stores } from "@/db";
import { requireUser } from "@/lib/auth";
import { encryptJson } from "@/lib/crypto";
import { getStoreOr404 } from "@/lib/queries";
import { CONNECTORS } from "@/lib/connectors";
import { ConnectorError } from "@/lib/connectors/types";
import { normalizeShopDomain, type ShopifyCreds } from "@/lib/connectors/shopify/client";
import { runSync, storeContext, storeCreds } from "@/lib/sync";
import type { FormState } from "@/lib/form";

const shopifySchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("client"), shopDomain: z.string(), clientId: z.string().trim().min(10, "Paste the Client ID"), clientSecret: z.string().trim().min(10, "Paste the Client Secret") }),
  z.object({ method: z.literal("token"), shopDomain: z.string(), accessToken: z.string().trim().regex(/^shpat_/, "Admin API tokens start with shpat_") }),
]);

export async function saveShopifyConnection(clientId: number, storeId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const store = await getStoreOr404(clientId, storeId);
  const parsed = shopifySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message;
    return { error: "Please fix the highlighted fields.", fieldErrors: fe };
  }
  const domain = normalizeShopDomain(parsed.data.shopDomain);
  if (!domain) return { error: "Please fix the highlighted fields.", fieldErrors: { shopDomain: "Use the store's .myshopify.com address" } };
  const creds: ShopifyCreds =
    parsed.data.method === "client"
      ? { shopDomain: domain, clientId: parsed.data.clientId, clientSecret: parsed.data.clientSecret }
      : { shopDomain: domain, accessToken: parsed.data.accessToken };

  let summary: string;
  try {
    summary = await CONNECTORS.SHOPIFY!.testConnection(storeContext(store), creds);
  } catch (e) {
    return { error: e instanceof ConnectorError ? e.message : "Could not reach Shopify. Check the shop address." };
  }
  await db
    .update(stores)
    .set({ credentialsEnc: encryptJson(creds), accountRef: domain, lastSyncStatus: null, lastSyncMessage: null })
    .where(eq(stores.id, store.id));
  revalidatePath(`/clients/${clientId}`, "layout");
  return { ok: `Connected to ${summary}. Credentials saved (encrypted). You can now run "Sync now".` };
}

export async function testStoreConnection(clientId: number, storeId: number, _prev: FormState): Promise<FormState> {
  await requireUser();
  const store = await getStoreOr404(clientId, storeId);
  const connector = CONNECTORS[store.platform];
  const creds = storeCreds(store);
  if (!connector || !creds) return { error: "This store is not connected yet." };
  try {
    return { ok: `Connection OK: ${await connector.testConnection(storeContext(store), creds)}` };
  } catch (e) {
    return { error: e instanceof ConnectorError ? e.message : "Connection failed." };
  }
}

export async function syncStoreNow(clientId: number, storeId: number, _prev: FormState): Promise<FormState> {
  await requireUser();
  await getStoreOr404(clientId, storeId);
  const r = await runSync(storeId);
  revalidatePath(`/clients/${clientId}`, "layout");
  revalidatePath("/");
  return r.status === "OK" ? { ok: `Sync finished: ${r.message}` } : { error: `${r.status === "SKIPPED" ? "Skipped" : "Sync failed"}: ${r.message}` };
}

export async function disconnectStore(clientId: number, storeId: number) {
  await requireUser();
  await getStoreOr404(clientId, storeId);
  await db.update(stores).set({ credentialsEnc: null, lastSyncStatus: null, lastSyncMessage: null }).where(eq(stores.id, storeId));
  revalidatePath(`/clients/${clientId}`, "layout");
}
