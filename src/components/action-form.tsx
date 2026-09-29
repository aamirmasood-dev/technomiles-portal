"use client";

import { createContext, startTransition, useActionState, useContext } from "react";
import type { FormState } from "@/lib/form";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const FieldErrors = createContext<Record<string, string> | undefined>(undefined);

export function ActionForm({
  action,
  submitLabel = "Save",
  className = "space-y-5",
  children,
}: {
  action: Action;
  submitLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      action={formAction}
      // Submit manually so React does not reset the inputs when validation fails.
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className={className}
    >
      <FieldErrors.Provider value={state.fieldErrors}>{children}</FieldErrors.Provider>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-700">{state.ok}</p>}
      <div>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function Field({
  label,
  name,
  hint,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const error = useContext(FieldErrors)?.[name];
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
