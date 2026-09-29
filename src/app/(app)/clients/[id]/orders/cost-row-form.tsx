"use client";

import { startTransition, useActionState } from "react";
import type { FormState } from "@/lib/form";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function CostRowForm({
  action,
  defaults,
}: {
  action: Action;
  defaults: { supplier: string; itemCost: string; handling: string; notes: string };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input name="supplier" defaultValue={defaults.supplier} placeholder="Supplier" className="input w-36" />
      <input name="itemCost" defaultValue={defaults.itemCost} placeholder="Item cost" inputMode="decimal" className="input w-24" />
      <input name="handling" defaultValue={defaults.handling} placeholder="Handling" inputMode="decimal" className="input w-24" />
      <input name="notes" defaultValue={defaults.notes} placeholder="Notes" className="input w-40" />
      <button disabled={pending} className="btn-secondary px-3 py-1.5">
        {pending ? "…" : "Save"}
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
      {state.ok && !pending && <span className="text-xs text-green-700">{state.ok}</span>}
    </form>
  );
}
