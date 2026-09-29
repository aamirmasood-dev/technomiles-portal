"use client";

import { startTransition, useActionState } from "react";
import type { FormState } from "@/lib/form";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function RowForm({ action, children, button, className = "" }: { action: Action; children: React.ReactNode; button: string; className?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className={`flex flex-wrap items-end gap-2 ${className}`}
    >
      {children}
      <button disabled={pending} className="btn-secondary px-3 py-1.5">
        {pending ? "…" : button}
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
      {state.ok && !pending && <span className="text-xs text-green-700">{state.ok}</span>}
    </form>
  );
}
