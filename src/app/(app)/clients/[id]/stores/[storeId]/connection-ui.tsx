"use client";

import { startTransition, useActionState, useState } from "react";
import type { FormState } from "@/lib/form";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
type NoFormAction = (prev: FormState) => Promise<FormState>;

function Message({ state }: { state: FormState }) {
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-green-700">{state.ok}</p>;
  return null;
}

export function ShopifyConnectionForm({ action, defaultDomain, connected }: { action: Action; defaultDomain: string; connected: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [method, setMethod] = useState<"client" | "token">("client");
  const err = (k: string) => state.fieldErrors?.[k] && <p className="mt-1 text-xs text-red-600">{state.fieldErrors[k]}</p>;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="max-w-xl space-y-4"
    >
      <div>
        <label className="block text-sm font-medium text-gray-700" htmlFor="shopDomain">
          Shop address
        </label>
        <input id="shopDomain" name="shopDomain" defaultValue={defaultDomain} placeholder="your-store.myshopify.com" className="input mt-1" required />
        <p className="mt-1 text-xs text-gray-500">The .myshopify.com address, not the public website domain.</p>
        {err("shopDomain")}
      </div>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="method" value="client" checked={method === "client"} onChange={() => setMethod("client")} /> Client ID + Secret (Dev Dashboard app)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="method" value="token" checked={method === "token"} onChange={() => setMethod("token")} /> Admin API token (older app)
        </label>
      </div>
      {method === "client" ? (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="clientId">
              Client ID
            </label>
            <input id="clientId" name="clientId" autoComplete="off" className="input mt-1 font-mono" required />
            {err("clientId")}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="clientSecret">
              Client Secret
            </label>
            <input id="clientSecret" name="clientSecret" type="password" autoComplete="off" className="input mt-1 font-mono" required />
            {err("clientSecret")}
          </div>
        </>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700" htmlFor="accessToken">
            Admin API access token
          </label>
          <input id="accessToken" name="accessToken" type="password" autoComplete="off" placeholder="shpat_…" className="input mt-1 font-mono" required />
          {err("accessToken")}
        </div>
      )}
      <Message state={state} />
      <button disabled={pending} className="btn-primary">
        {pending ? "Testing…" : connected ? "Replace credentials & test" : "Save & test connection"}
      </button>
    </form>
  );
}

export function ActionButton({ action, label, busyLabel, className = "btn-secondary" }: { action: NoFormAction; label: string; busyLabel: string; className?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-2">
      <button disabled={pending} className={className}>
        {pending ? busyLabel : label}
      </button>
      <Message state={state} />
    </form>
  );
}
