"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, orderCosts, orders, stores } from "@/db";
import { requireUser } from "@/lib/auth";
import { formObject, moneyInput, optStr, type FormState } from "@/lib/form";

const schema = z.object({
  supplier: optStr(),
  itemCost: moneyInput,
  handling: moneyInput,
  notes: optStr(1000),
});

export async function saveOrderCost(orderId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = schema.safeParse(formObject(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid amount" };
  if (formData.get("itemCost") === "") return { error: "Enter the item cost (0 if already paid via a bulk purchase)." };

  const [order] = await db
    .select({ id: orders.id, currency: stores.currency, clientId: stores.clientId })
    .from(orders)
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .where(eq(orders.id, orderId));
  if (!order) return { error: "Order not found." };

  const values = { ...parsed.data, currency: order.currency, updatedBy: user.id };
  await db
    .insert(orderCosts)
    .values({ orderId, ...values })
    .onDuplicateKeyUpdate({ set: values });
  revalidatePath(`/clients/${order.clientId}`, "layout");
  return { ok: "Saved" };
}
