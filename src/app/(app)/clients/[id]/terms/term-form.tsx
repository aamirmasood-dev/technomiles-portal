import { ActionForm, Field } from "@/components/action-form";
import { DEDUCTION_GROUPS, type contractTerms, type stores } from "@/db/schema";
import { DEDUCTION_GROUP_LABELS, PLATFORM_LABELS } from "@/lib/labels";
import { fromMinor } from "@/lib/money";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteTerm, saveTerm } from "../../actions";

type Term = typeof contractTerms.$inferSelect;
type Store = typeof stores.$inferSelect;

export function TermForm({ clientId, term, clientStores }: { clientId: number; term?: Term; clientStores: Store[] }) {
  const groups = new Set(term?.groups ?? DEDUCTION_GROUPS.filter((g) => !["COGS", "PURCHASES", "OTHER_MANUAL"].includes(g)));
  const selectedStores = new Set(term?.storeIds ?? []);

  return (
    <div className="max-w-3xl space-y-6">
      <ActionForm action={saveTerm.bind(null, clientId, term?.id ?? null)} submitLabel={term ? "Save term" : "Add term"}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Term name" name="name">
            <input id="name" name="name" className="input" defaultValue={term?.name ?? "Commission"} required />
          </Field>
          <Field label="Base label" name="baseLabel" hint='Shown on the statement, e.g. "Net sale" or "Net profit".'>
            <input id="baseLabel" name="baseLabel" className="input" defaultValue={term?.baseLabel ?? "Net sale"} required />
          </Field>
          <Field label="Rate (%)" name="rate">
            <input id="rate" name="rate" inputMode="decimal" className="input" defaultValue={term ? String(term.rateBps / 100) : "10"} required />
          </Field>
          <Field label="Fixed monthly fee" name="fixedFee" hint="Optional. Added on top of the percentage.">
            <input id="fixedFee" name="fixedFee" inputMode="decimal" className="input" defaultValue={term ? fromMinor(term.fixedFee) : "0.00"} />
          </Field>
          <Field label="Effective from (month)" name="effectiveFrom">
            <input id="effectiveFrom" name="effectiveFrom" type="month" className="input" defaultValue={term?.effectiveFrom ?? "2026-10"} required />
          </Field>
          <Field label="Effective to (month)" name="effectiveTo" hint="Leave empty if ongoing.">
            <input id="effectiveTo" name="effectiveTo" type="month" className="input" defaultValue={term?.effectiveTo ?? ""} />
          </Field>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-gray-700">Deduct from gross sales</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DEDUCTION_GROUPS.map((g) => (
              <label key={g} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="groups" value={g} defaultChecked={groups.has(g)} />
                {DEDUCTION_GROUP_LABELS[g]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-gray-700">Options</legend>
          <div className="mt-2 space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="includeShipping" defaultChecked={term?.includeShipping ?? true} />
              Include shipping charged to customers in gross sales
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="includeTax" defaultChecked={term?.includeTax ?? false} />
              Include tax (VAT / sales tax) in gross sales
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="carryForwardLoss" defaultChecked={term?.carryForwardLoss ?? true} />
              Carry a negative month forward and deduct it from the next month
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-gray-700">Stores covered</legend>
          <p className="text-xs text-gray-500">Leave all unticked to cover every store of this client, including stores added later.</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {clientStores.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="storeIds" value={s.id} defaultChecked={selectedStores.has(s.id)} />
                {s.name} <span className="text-gray-500">({PLATFORM_LABELS[s.platform]})</span>
              </label>
            ))}
            {clientStores.length === 0 && <p className="text-sm text-gray-500">No stores yet.</p>}
          </div>
        </fieldset>
      </ActionForm>

      {term && (
        <form action={deleteTerm.bind(null, clientId, term.id)} className="border-t border-gray-200 pt-4">
          <ConfirmButton message="Delete this contract term? This cannot be undone." className="text-sm text-red-600 hover:text-red-800">
            Delete this term
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}
