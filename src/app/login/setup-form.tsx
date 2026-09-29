"use client";

import { useActionState } from "react";
import { setupFirstAdmin, type LoginState } from "./actions";

export function SetupForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(setupFirstAdmin, {});
  return (
    <form action={action} className="space-y-4">
      {[
        { name: "name", label: "Your name", type: "text", auto: "name" },
        { name: "email", label: "Email", type: "email", auto: "email" },
        { name: "password", label: "Password (at least 10 characters)", type: "password", auto: "new-password" },
      ].map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className="block text-sm font-medium text-gray-700">
            {f.label}
          </label>
          <input id={f.name} name={f.name} type={f.type} autoComplete={f.auto} required className="input mt-1" />
        </div>
      ))}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Creating…" : "Create administrator"}
      </button>
    </form>
  );
}
