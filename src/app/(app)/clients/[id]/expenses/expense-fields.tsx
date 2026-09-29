import { Field } from "@/components/action-form";
import { DEDUCTION_GROUPS } from "@/db/schema";
import { CURRENCIES, DEDUCTION_GROUP_LABELS, PLATFORM_LABELS } from "@/lib/labels";
import { fromMinor } from "@/lib/money";
import type { Platform } from "@/db/schema";

// Groups that platform APIs fill in; manual entries usually use the others.
const MANUAL_GROUPS = DEDUCTION_GROUPS.filter((g) => g !== "COGS");

export function ExpenseFields({
  defaults,
  stores,
  providers,
}: {
  defaults: {
    expenseDate: string;
    group: string;
    storeId: number | null;
    shippingProviderId: number | null;
    amount: number | null;
    currency: string;
    description: string | null;
  };
  stores: { id: number; name: string; platform: Platform }[];
  providers: { id: number; name: string; active: boolean }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Date" name="expenseDate">
        <input id="expenseDate" name="expenseDate" type="date" className="input" defaultValue={defaults.expenseDate} required />
      </Field>
      <Field label="Courier" name="shippingProviderId" hint="Pick a courier for shipping costs; leave empty otherwise.">
        <select id="shippingProviderId" name="shippingProviderId" className="input" defaultValue={defaults.shippingProviderId ?? ""}>
          <option value="">Not a courier cost</option>
          {providers
            .filter((p) => p.active || p.id === defaults.shippingProviderId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Type" name="group" hint="Courier costs are always counted as shipping.">
        <select id="group" name="group" className="input" defaultValue={defaults.group}>
          {MANUAL_GROUPS.map((g) => (
            <option key={g} value={g}>
              {DEDUCTION_GROUP_LABELS[g]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Store" name="storeId" hint="Optional. Leave empty for a client-wide cost.">
        <select id="storeId" name="storeId" className="input" defaultValue={defaults.storeId ?? ""}>
          <option value="">All stores</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({PLATFORM_LABELS[s.platform]})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Amount" name="amount" hint="A cost. Use a minus sign for a credit or refund of a cost.">
        <input id="amount" name="amount" inputMode="decimal" className="input" defaultValue={defaults.amount != null ? fromMinor(defaults.amount) : ""} required />
      </Field>
      <Field label="Currency" name="currency">
        <select id="currency" name="currency" className="input" defaultValue={defaults.currency}>
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Description" name="description">
          <input id="description" name="description" className="input" defaultValue={defaults.description ?? ""} placeholder="e.g. Parcelforce invoice Oct 2026" />
        </Field>
      </div>
    </div>
  );
}
