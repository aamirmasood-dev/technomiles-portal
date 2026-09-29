"use client";

import { startTransition, useActionState, useState } from "react";
import type { FormState } from "@/lib/form";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const KINDS = [
  { value: "WITHDRAWAL", label: "Paid to partner (drawing)" },
  { value: "PERSONAL_EXPENSE", label: "Partner's personal expense paid by company" },
  { value: "TRANSFER", label: "Partner paid the other partner directly" },
  { value: "OPENING", label: "Opening balance (before the books started)" },
  { value: "ADJUSTMENT", label: "Other adjustment" },
] as const;

export function PartnerEntryForm({
  action,
  partners,
  accounts,
  today,
}: {
  action: Action;
  partners: { id: number; name: string }[];
  accounts: { id: number; name: string }[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [kind, setKind] = useState<string>("WITHDRAWAL");
  const signed = kind === "OPENING" || kind === "ADJUSTMENT";
  const fromAccount = kind === "WITHDRAWAL" || kind === "PERSONAL_EXPENSE";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="grid grid-cols-1 gap-4 sm:grid-cols-3"
    >
      <label className="text-sm sm:col-span-3">
        <span className="font-medium text-gray-700">What happened</span>
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="input mt-1">
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="font-medium text-gray-700">{kind === "TRANSFER" ? "Partner who paid" : "Partner"}</span>
        <select name="partnerId" className="input mt-1">
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {kind === "TRANSFER" && (
        <label className="text-sm">
          <span className="font-medium text-gray-700">Partner who received</span>
          <select name="toPartnerId" defaultValue={partners[1]?.id} className="input mt-1">
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {signed && (
        <label className="text-sm">
          <span className="font-medium text-gray-700">Direction</span>
          <select name="direction" className="input mt-1">
            <option value="owed_to_partner">Company owes the partner</option>
            <option value="owed_by_partner">Partner owes the company</option>
          </select>
        </label>
      )}
      <label className="text-sm">
        <span className="font-medium text-gray-700">Date</span>
        <input type="date" name="entryDate" defaultValue={today} className="input mt-1" required />
      </label>
      <label className="text-sm">
        <span className="font-medium text-gray-700">Amount (PKR)</span>
        <input name="amount" inputMode="decimal" className="input mt-1" required />
      </label>
      {fromAccount && (
        <label className="text-sm">
          <span className="font-medium text-gray-700">Paid from</span>
          <select name="accountId" className="input mt-1">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            <option value="">Cash / not from a company account</option>
          </select>
        </label>
      )}
      <label className="text-sm sm:col-span-2">
        <span className="font-medium text-gray-700">Details</span>
        <input name="description" className="input mt-1" placeholder={kind === "PERSONAL_EXPENSE" ? "e.g. Car repair" : "Optional note"} />
      </label>
      <div className="flex items-center gap-3 sm:col-span-3">
        <button disabled={pending} className="btn-primary">
          {pending ? "Saving…" : "Save"}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state.ok && !pending && <span className="text-sm text-green-700">{state.ok}</span>}
      </div>
    </form>
  );
}
