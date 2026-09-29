import { Field } from "@/components/action-form";
import { COMPANY_EXPENSE_CATEGORIES } from "@/db/schema";
import { COMPANY_EXPENSE_LABELS, CURRENCIES } from "@/lib/labels";
import { fromMinor } from "@/lib/money";

export function CompanyExpenseFields({
  defaults,
  accounts,
  partners,
}: {
  defaults: {
    expenseDate: string;
    category: string;
    description: string;
    currency: string;
    amount: number | null;
    pkrAmount: number | null;
    paidBy: string;
    notes: string | null;
  };
  accounts: { id: number; name: string }[];
  partners: { id: number; name: string }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Field label="Date" name="expenseDate">
        <input id="expenseDate" name="expenseDate" type="date" defaultValue={defaults.expenseDate} className="input" required />
      </Field>
      <Field label="Category" name="category">
        <select id="category" name="category" defaultValue={defaults.category} className="input">
          {COMPANY_EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {COMPANY_EXPENSE_LABELS[c]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Paid by" name="paidBy" hint="If a partner paid personally, the company owes it back to them.">
        <select id="paidBy" name="paidBy" defaultValue={defaults.paidBy} className="input">
          {accounts.map((a) => (
            <option key={`a${a.id}`} value={`account:${a.id}`}>
              Technomiles: {a.name}
            </option>
          ))}
          {partners.map((p) => (
            <option key={`p${p.id}`} value={`partner:${p.id}`}>
              {p.name} (personally)
            </option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-3">
        <Field label="Details" name="description">
          <input id="description" name="description" defaultValue={defaults.description} className="input" placeholder="e.g. PTCL internet, October" required />
        </Field>
      </div>
      <Field label="Amount" name="amount">
        <div className="flex gap-2">
          <input id="amount" name="amount" inputMode="decimal" defaultValue={defaults.amount != null ? fromMinor(defaults.amount) : ""} className="input" required />
          <select name="currency" defaultValue={defaults.currency} className="input w-24" aria-label="Currency">
            {["PKR", ...CURRENCIES].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </Field>
      <Field label="Cost in PKR" name="pkrAmount" hint="Only needed when paid in another currency (e.g. a USD subscription).">
        <input id="pkrAmount" name="pkrAmount" inputMode="decimal" defaultValue={defaults.pkrAmount != null && defaults.currency !== "PKR" ? fromMinor(defaults.pkrAmount) : ""} className="input" />
      </Field>
      <Field label="Notes" name="notes">
        <input id="notes" name="notes" defaultValue={defaults.notes ?? ""} className="input" />
      </Field>
    </div>
  );
}
