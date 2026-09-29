"use client";

import { startTransition, useActionState, useState } from "react";
import type { FormState } from "@/lib/form";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
type Client = { id: number; name: string; currency: string };

export function InvoiceForm({
  action,
  clients,
  rates,
  currencies,
  defaults,
}: {
  action: Action;
  clients: Client[];
  rates: Record<string, string | null>;
  currencies: readonly string[];
  defaults: { clientId: number | null; currency: string; issueDate: string; dueDate: string; lines: { description: string; amount: string }[]; planId: number | null };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [currency, setCurrency] = useState(defaults.currency);
  const [rate, setRate] = useState(rates[defaults.currency] ?? "");
  const [lines, setLines] = useState(defaults.lines.length ? defaults.lines : [{ description: "", amount: "" }]);
  const err = (k: string) => state.fieldErrors?.[k] && <p className="mt-1 text-xs text-red-600">{state.fieldErrors[k]}</p>;
  const total = lines.reduce((a, l) => a + (Number(l.amount.replace(/,/g, "")) || 0), 0);
  const pkr = Number(rate) ? total * Number(rate) : null;
  const changeCurrency = (c: string) => {
    setCurrency(c);
    setRate(rates[c] ?? "");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="max-w-3xl space-y-5"
    >
      {defaults.planId && <input type="hidden" name="planId" value={defaults.planId} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium text-gray-700">Client</span>
          <select
            name="clientId"
            defaultValue={defaults.clientId ?? ""}
            className="input mt-1"
            onChange={(e) => {
              const c = clients.find((x) => x.id === Number(e.target.value));
              if (c) changeCurrency(c.currency);
            }}
            required
          >
            <option value="">Select…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {err("clientId")}
        </label>
        <label className="text-sm">
          <span className="font-medium text-gray-700">Currency</span>
          <select name="currency" value={currency} onChange={(e) => changeCurrency(e.target.value)} className="input mt-1">
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium text-gray-700">Issue date</span>
          <input type="date" name="issueDate" defaultValue={defaults.issueDate} className="input mt-1" required />
          {err("issueDate")}
        </label>
        <label className="text-sm">
          <span className="font-medium text-gray-700">Due date</span>
          <input type="date" name="dueDate" defaultValue={defaults.dueDate} className="input mt-1" required />
          {err("dueDate")}
        </label>
        {currency !== "PKR" && (
          <label className="text-sm">
            <span className="font-medium text-gray-700">PKR rate (1 {currency} = ? PKR)</span>
            <input name="pkrRate" value={rate ?? ""} onChange={(e) => setRate(e.target.value)} inputMode="decimal" className="input mt-1" />
            <span className="mt-1 block text-xs text-gray-500">Today&apos;s interbank rate, filled in automatically. You can change it.</span>
            {err("pkrRate")}
          </label>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700">Lines</p>
        <div className="mt-2 space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input
                name="lineDescription"
                value={l.description}
                onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                placeholder="e.g. Website hosting & management, Oct 2026 – Sep 2027"
                className="input flex-1"
              />
              <input
                name="lineAmount"
                value={l.amount}
                onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                placeholder="0.00"
                inputMode="decimal"
                className="input w-32 text-right"
              />
              {lines.length > 1 && (
                <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="btn-secondary px-3" aria-label="Remove line">
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setLines([...lines, { description: "", amount: "" }])} className="link mt-2 text-sm">
          + Add line
        </button>
        <p className="mt-3 text-sm">
          Total:{" "}
          <span className="font-semibold tabular-nums">
            {total.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
          </span>
          {currency !== "PKR" && pkr != null && (
            <span className="text-gray-600">
              {" "}
              ≈ PKR {pkr.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
            </span>
          )}
        </p>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-gray-700">Notes (shown on the invoice)</span>
        <textarea name="notes" rows={2} className="input mt-1" />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="btn-primary">
        {pending ? "Creating…" : "Create invoice"}
      </button>
    </form>
  );
}
