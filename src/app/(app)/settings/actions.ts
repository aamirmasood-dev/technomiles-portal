"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, businessSettings } from "@/db";
import { requireUser } from "@/lib/auth";
import { fieldErrors, formObject, optStr, str, type FormState } from "@/lib/form";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_LOGO_BYTES = 500 * 1024;

const schema = z.object({
  name: str().min(1, "Required"),
  address: optStr(2000),
  email: optStr().refine((v) => v == null || z.email().safeParse(v).success, "Not a valid email"),
  phone: optStr(64),
  website: optStr(),
  bankDetails: optStr(4000),
  invoicePrefix: str(32),
  nextInvoiceNumber: z.coerce.number().int().min(1, "Must be 1 or more"),
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
  invoiceFooter: optStr(4000),
});

export async function saveBusinessSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const { removeLogo, ...fields } = formObject(formData);
  const parsed = schema.safeParse(fields);
  if (!parsed.success) return fieldErrors(parsed.error);

  const values: Partial<typeof businessSettings.$inferInsert> = { ...parsed.data };
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (!LOGO_TYPES.includes(logo.type)) {
      return { error: "Please fix the highlighted fields.", fieldErrors: { logo: "Use a PNG, JPG, WEBP or SVG image" } };
    }
    if (logo.size > MAX_LOGO_BYTES) {
      return { error: "Please fix the highlighted fields.", fieldErrors: { logo: "Logo must be under 500 KB" } };
    }
    const b64 = Buffer.from(await logo.arrayBuffer()).toString("base64");
    values.logoDataUrl = `data:${logo.type};base64,${b64}`;
  } else if (removeLogo === "on") {
    values.logoDataUrl = null;
  }

  await db
    .insert(businessSettings)
    .values({ id: 1, ...parsed.data, ...values })
    .onDuplicateKeyUpdate({ set: values });
  revalidatePath("/settings");
  return { ok: "Settings saved." };
}
