import { ActionForm, Field } from "@/components/action-form";
import { CURRENCIES, TIMEZONES } from "@/lib/labels";
import type { clients } from "@/db/schema";
import { saveClient } from "./actions";

type Client = typeof clients.$inferSelect;

export function ClientForm({ client }: { client?: Client }) {
  return (
    <ActionForm action={saveClient.bind(null, client?.id ?? null)} submitLabel={client ? "Save changes" : "Add client"}>
      <div className="grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Client name" name="name">
          <input id="name" name="name" className="input" defaultValue={client?.name} required />
        </Field>
        <Field label="Contact person" name="contactName">
          <input id="contactName" name="contactName" className="input" defaultValue={client?.contactName ?? ""} />
        </Field>
        <Field label="Currency" name="currency" hint="Statements and invoices are in this currency.">
          <select id="currency" name="currency" className="input" defaultValue={client?.currency ?? "GBP"}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Timezone" name="timezone" hint="Decides where each month starts and ends.">
          <select id="timezone" name="timezone" className="input" defaultValue={client?.timezone ?? "Europe/London"}>
            {TIMEZONES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Email" name="email">
          <input id="email" name="email" type="email" className="input" defaultValue={client?.email ?? ""} />
        </Field>
        <div />
        <Field label="Billing address (shown on invoice)" name="billingAddress">
          <textarea id="billingAddress" name="billingAddress" rows={3} className="input" defaultValue={client?.billingAddress ?? ""} />
        </Field>
        <Field label="Notes" name="notes">
          <textarea id="notes" name="notes" rows={3} className="input" defaultValue={client?.notes ?? ""} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={client?.active ?? true} /> Active
        </label>
      </div>
    </ActionForm>
  );
}
