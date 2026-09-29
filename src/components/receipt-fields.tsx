import { Field } from "./action-form";
import { CURRENCIES } from "@/lib/labels";

// Fields for recording money received. Used on the invoice page, the client Invoices tab and Payments received.
export function ReceiptFields({
  clients,
  clientId,
  invoiceOptions,
  defaultInvoice,
  currency,
  accounts,
  today,
}: {
  clients?: { id: number; name: string }[];
  clientId?: number;
  invoiceOptions: { value: string; label: string }[];
  defaultInvoice: string;
  currency: string;
  accounts: { id: number; name: string }[];
  today: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {clients ? (
        <Field label="Client" name="clientId" hint="Leave empty for income not from a listed client.">
          <select id="clientId" name="clientId" defaultValue="" className="input">
            <option value="">No client / other income</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <input type="hidden" name="clientId" value={clientId} />
      )}
      <Field label="Apply to" name="invoiceId">
        <select id="invoiceId" name="invoiceId" defaultValue={defaultInvoice} className="input">
          {invoiceOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Date received" name="receivedDate">
        <input id="receivedDate" name="receivedDate" type="date" defaultValue={today} className="input" required />
      </Field>
      <Field label="Amount received" name="amount" hint="In the invoice currency (what the client paid).">
        <div className="flex gap-2">
          <input id="amount" name="amount" inputMode="decimal" className="input" required />
          <select name="currency" defaultValue={currency} className="input w-24" aria-label="Currency">
            {[...new Set([...CURRENCIES, "PKR"])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </Field>
      <Field label="PKR credited by the bank" name="pkrReceived" hint="The exact rupees that reached the account.">
        <input id="pkrReceived" name="pkrReceived" inputMode="decimal" className="input" required />
      </Field>
      <Field label="Into account" name="accountId">
        <select id="accountId" name="accountId" className="input">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Reference" name="reference" hint="Bank reference or transfer ID (optional).">
        <input id="reference" name="reference" className="input" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Description" name="description">
          <input id="description" name="description" className="input" placeholder="e.g. Second installment for August" />
        </Field>
      </div>
    </div>
  );
}
