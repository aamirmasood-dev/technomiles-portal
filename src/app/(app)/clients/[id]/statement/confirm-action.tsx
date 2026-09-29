"use client";

import { useActionState } from "react";
import type { CloseState } from "./actions";

export function ConfirmAction({
  action,
  label,
  confirm,
  className = "btn-primary",
  disabled,
}: {
  action: (prev: CloseState) => Promise<CloseState>;
  label: string;
  confirm: string;
  className?: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="inline-flex flex-col items-end">
      <button
        type="submit"
        disabled={disabled || pending}
        className={className}
        onClick={(e) => {
          if (!window.confirm(confirm)) e.preventDefault();
        }}
      >
        {pending ? "Working…" : label}
      </button>
      {state.error && <span className="mt-1 text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
