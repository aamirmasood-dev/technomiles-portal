"use client";

import { startTransition, useActionState } from "react";
import type { FormState } from "@/lib/form";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

function useForm(action: Action) {
  const [state, formAction, pending] = useActionState(action, {});
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  };
  return { state, onSubmit, pending };
}

function Msg({ state }: { state: FormState }) {
  if (state.error) return <span className="text-xs text-red-600">{state.error}</span>;
  if (state.ok) return <span className="text-xs text-green-700">{state.ok}</span>;
  return null;
}

export function AccessForm({ action, role, active }: { action: Action; role: string; active: boolean }) {
  const { state, onSubmit, pending } = useForm(action);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <select name="role" defaultValue={role} className="input w-36 py-1">
        <option value="ADMIN">Administrator</option>
        <option value="STAFF">Staff</option>
      </select>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" name="active" defaultChecked={active} /> Active
      </label>
      <button disabled={pending} className="btn-secondary px-3 py-1">
        Save
      </button>
      <Msg state={state} />
    </form>
  );
}

export function PasswordForm({ action }: { action: Action }) {
  const { state, onSubmit, pending } = useForm(action);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input name="password" type="password" placeholder="New password" autoComplete="new-password" className="input w-40 py-1" />
      <button disabled={pending} className="btn-secondary px-3 py-1">
        Set
      </button>
      <Msg state={state} />
    </form>
  );
}
