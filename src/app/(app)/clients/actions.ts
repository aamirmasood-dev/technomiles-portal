"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  db,
  clients,
  contractTerms,
  shippingProviders,
  statements,
  stores,
  CLIENT_TYPES,
  DEDUCTION_GROUPS,
  PLATFORMS,
} from "@/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import {
  checkbox,
  fieldErrors,
  formObject,
  moneyInput,
  month,
  optMonth,
  optStr,
  str,
  type FormState,
} from "@/lib/form";

const currency = z.string().regex(/^[A-Z]{3}$/, "Pick a currency");

// ---------- Clients ----------

const clientSchema = z.object({
  name: str().min(1, "Required"),
  clientType: z.enum(CLIENT_TYPES),
  currency,
  timezone: str(64).min(1, "Required"),
  contactName: optStr(),
  email: optStr().refine((v) => v == null || z.email().safeParse(v).success, "Not a valid email"),
  billingAddress: optStr(2000),
  notes: optStr(5000),
  active: checkbox,
});

export async function saveClient(clientId: number | null, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = clientSchema.safeParse(formObject(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  let id = clientId;
  if (id) {
    await db.update(clients).set(parsed.data).where(eq(clients.id, id));
  } else {
    const [res] = await db.insert(clients).values(parsed.data).$returningId();
    id = res.id;
  }
  revalidatePath("/", "layout");
  redirect(clientId ? `/clients/${id}/setup` : `/clients/${id}`);
}

// ---------- Contract terms ----------

const termSchema = z.object({
  name: str().min(1, "Required"),
  baseLabel: str(64).min(1, "Required"),
  rate: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter a percentage like 10 or 12.5")
    .transform((v) => Math.round(Number(v) * 100))
    .refine((v) => v <= 10000, "Cannot exceed 100%"),
  fixedFee: moneyInput,
  groups: z
    .union([z.enum(DEDUCTION_GROUPS), z.array(z.enum(DEDUCTION_GROUPS)), z.null()])
    .transform((v) => (v == null ? [] : Array.isArray(v) ? v : [v])),
  storeIds: z
    .union([z.string(), z.array(z.string()), z.null(), z.undefined()])
    .transform((v) => (v == null ? [] : Array.isArray(v) ? v : [v]).map(Number))
    .transform((v) => (v.length === 0 ? null : v)),
  includeShipping: checkbox,
  includeTax: checkbox,
  carryForwardLoss: checkbox,
  effectiveFrom: month,
  effectiveTo: optMonth,
});

export async function saveTerm(
  clientId: number,
  termId: number | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const parsed = termSchema.safeParse(formObject(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const { rate, ...rest } = parsed.data;
  if (rest.effectiveTo && rest.effectiveTo < rest.effectiveFrom) {
    return { error: "Please fix the highlighted fields.", fieldErrors: { effectiveTo: "Must be after 'from'" } };
  }
  const values = { ...rest, rateBps: rate, clientId };

  if (termId) {
    await db
      .update(contractTerms)
      .set(values)
      .where(and(eq(contractTerms.id, termId), eq(contractTerms.clientId, clientId)));
  } else {
    await db.insert(contractTerms).values(values);
  }
  revalidatePath(`/clients/${clientId}`, "layout");
  redirect(`/clients/${clientId}/setup`);
}

export async function deleteTerm(clientId: number, termId: number) {
  await requireAdmin();
  const [used] = await db.select({ id: statements.id }).from(statements).where(eq(statements.termId, termId)).limit(1);
  if (used) {
    // Closed invoices refer to this term; end it with "Effective to" instead.
    redirect(`/clients/${clientId}/terms/${termId}?cannotDelete=1`);
  }
  await db.delete(contractTerms).where(and(eq(contractTerms.id, termId), eq(contractTerms.clientId, clientId)));
  revalidatePath(`/clients/${clientId}`, "layout");
  redirect(`/clients/${clientId}/setup`);
}

// ---------- Stores ----------

const storeSchema = z.object({
  platform: z.enum(PLATFORMS),
  name: str().min(1, "Required"),
  currency,
  region: optStr(32),
  marketplaceId: optStr(64),
  accountRef: optStr(),
  syncStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  active: checkbox,
});

export async function saveStore(
  clientId: number,
  storeId: number | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();
  const parsed = storeSchema.safeParse(formObject(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const d = parsed.data;
  if ((d.platform === "EBAY" || d.platform === "AMAZON") && !d.region) {
    return { error: "Please fix the highlighted fields.", fieldErrors: { region: "Required for this platform" } };
  }
  if (d.platform === "AMAZON" && !d.marketplaceId) {
    return { error: "Please fix the highlighted fields.", fieldErrors: { marketplaceId: "Required for Amazon" } };
  }
  if (d.platform === "SHOPIFY") d.region = null;
  if (d.platform !== "AMAZON") d.marketplaceId = null;

  if (storeId) {
    await db
      .update(stores)
      .set(d)
      .where(and(eq(stores.id, storeId), eq(stores.clientId, clientId)));
  } else {
    await db.insert(stores).values({ ...d, clientId });
  }
  revalidatePath(`/clients/${clientId}`, "layout");
  redirect(`/clients/${clientId}/stores`);
}

// ---------- Shipping providers ----------

export async function addShippingProvider(clientId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a courier name." };
  await db.insert(shippingProviders).values({ clientId, name });
  revalidatePath(`/clients/${clientId}`, "layout");
  return { ok: `Added ${name}.` };
}

export async function toggleShippingProvider(clientId: number, providerId: number, active: boolean) {
  await requireAdmin();
  await db
    .update(shippingProviders)
    .set({ active })
    .where(and(eq(shippingProviders.id, providerId), eq(shippingProviders.clientId, clientId)));
  revalidatePath(`/clients/${clientId}`, "layout");
}
