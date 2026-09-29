import { z } from "zod";
import { toMinor } from "./money";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; ok?: string };

// Turns a ZodError into { field: first message } for display next to inputs.
export function fieldErrors(error: z.ZodError): FormState {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !out[key]) out[key] = issue.message;
  }
  return { error: "Please fix the highlighted fields.", fieldErrors: out };
}

export const str = (max = 191) => z.string().trim().max(max);
export const optStr = (max = 191) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.null(), z.undefined()])
  .transform((v) => v === "on" || v === "true");

export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");
export const optMonth = z
  .string()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .refine((v) => v == null || /^\d{4}-(0[1-9]|1[0-2])$/.test(v), "Use YYYY-MM")
  .transform((v) => v ?? null);

export const moneyInput = z.string().transform((v, ctx) => {
  if (v.trim() === "") return 0;
  try {
    return toMinor(v);
  } catch {
    ctx.addIssue({ code: "custom", message: "Enter an amount like 12.50" });
    return z.NEVER;
  }
});

// Reads a FormData into a plain object; repeated keys become arrays.
export function formObject(formData: FormData): Record<string, string | string[] | null> {
  const out: Record<string, string | string[] | null> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = formData.getAll(key).filter((v): v is string => typeof v === "string");
    out[key] = all.length > 1 ? all : (all[0] ?? null);
  }
  return out;
}
