import { Field } from "@/components/action-form";
import { ASSET_CATEGORIES, ASSET_CONDITIONS } from "@/db/schema";
import { ASSET_CATEGORY_LABELS, ASSET_CONDITION_LABELS } from "@/lib/labels";
import { fromMinor } from "@/lib/money";

export function AssetFields({
  defaults,
  payers,
}: {
  defaults: {
    name: string;
    category: string;
    quantity: number;
    purchaseDate: string | null;
    unitPrice: number;
    condition: string;
    location: string | null;
    serialNumber: string | null;
    notes: string | null;
  };
  payers?: { value: string; label: string }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Field label="Item" name="name">
        <input id="name" name="name" defaultValue={defaults.name} className="input" placeholder="e.g. Office chair" required />
      </Field>
      <Field label="Category" name="category">
        <select id="category" name="category" defaultValue={defaults.category} className="input">
          {ASSET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {ASSET_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Quantity" name="quantity">
        <input id="quantity" name="quantity" type="number" min={1} defaultValue={defaults.quantity} className="input" />
      </Field>
      <Field label="Price each (PKR)" name="unitPrice">
        <input id="unitPrice" name="unitPrice" inputMode="decimal" defaultValue={defaults.unitPrice ? fromMinor(defaults.unitPrice) : ""} className="input" />
      </Field>
      <Field label="Purchase date" name="purchaseDate">
        <input id="purchaseDate" name="purchaseDate" type="date" defaultValue={defaults.purchaseDate ?? ""} className="input" />
      </Field>
      <Field label="Condition" name="condition">
        <select id="condition" name="condition" defaultValue={defaults.condition} className="input">
          {ASSET_CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {ASSET_CONDITION_LABELS[c]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Location / used by" name="location">
        <input id="location" name="location" defaultValue={defaults.location ?? ""} className="input" placeholder="e.g. Office, Nouman" />
      </Field>
      <Field label="Serial / tag" name="serialNumber">
        <input id="serialNumber" name="serialNumber" defaultValue={defaults.serialNumber ?? ""} className="input" />
      </Field>
      <Field label="Notes" name="notes">
        <input id="notes" name="notes" defaultValue={defaults.notes ?? ""} className="input" />
      </Field>
      {payers && (
        <div className="flex flex-wrap items-center gap-3 text-sm sm:col-span-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="recordExpense" /> Also record the purchase as a Hardware expense, paid by
          </label>
          <select name="paidBy" className="input w-64 py-1.5">
            {payers.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
