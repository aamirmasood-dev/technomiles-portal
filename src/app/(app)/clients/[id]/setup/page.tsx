import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, contractTerms, recurringExpenses, shippingProviders, stores, DEDUCTION_GROUPS } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getClientOr404, parseId } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { CURRENCIES, DEDUCTION_GROUP_LABELS } from "@/lib/labels";
import { currentPeriod, shiftPeriod } from "@/lib/period";
import { ConfirmButton } from "@/components/confirm-button";
import { Field } from "@/components/action-form";
import { addRecurringExpense, deleteRecurringExpense, endRecurringExpense } from "../expenses/actions";
import { Badge, Card } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { addShippingProvider, toggleShippingProvider } from "../../actions";

export default async function SetupPage(props: PageProps<"/clients/[id]/setup">) {
  await requireAdmin();
  const client = await getClientOr404(parseId((await props.params).id));
  const [terms, storeRows, providers, recurring] = await Promise.all([
    db.select().from(contractTerms).where(eq(contractTerms.clientId, client.id)).orderBy(asc(contractTerms.effectiveFrom)),
    db.select().from(stores).where(eq(stores.clientId, client.id)).orderBy(asc(stores.platform), asc(stores.name)),
    db.select().from(shippingProviders).where(eq(shippingProviders.clientId, client.id)).orderBy(asc(shippingProviders.name)),
    db.select().from(recurringExpenses).where(eq(recurringExpenses.clientId, client.id)).orderBy(asc(recurringExpenses.startMonth)),
  ]);
  const thisMonth = currentPeriod(client.timezone);
  const storeName = new Map(storeRows.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-6">
      <Card title="Client details" actions={<Link href={`/clients/${client.id}/edit`} className="link text-sm">Edit</Link>}>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-gray-500">Contact</dt><dd>{client.contactName ?? "—"}</dd></div>
          <div><dt className="text-gray-500">Email</dt><dd>{client.email ?? "—"}</dd></div>
          <div><dt className="text-gray-500">Billing address</dt><dd className="whitespace-pre-line">{client.billingAddress ?? "—"}</dd></div>
          <div><dt className="text-gray-500">Notes</dt><dd className="whitespace-pre-line">{client.notes ?? "—"}</dd></div>
        </dl>
      </Card>

      <Card
        title="Contract terms"
        actions={
          <Link href={`/clients/${client.id}/terms/new`} className="link text-sm">
            Add term
          </Link>
        }
      >
        {terms.length === 0 ? (
          <p className="text-sm text-gray-500">No contract terms yet. Add one to calculate statements.</p>
        ) : (
          <div className="space-y-4">
            {terms.map((t) => (
              <div key={t.id} className="rounded-md border border-gray-200 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-sm text-gray-600">
                      {t.rateBps / 100}% of {t.baseLabel.toLowerCase()}
                      {t.fixedFee !== 0 && <> + {formatMoney(t.fixedFee, client.currency)} / month</>}
                      {" · "}from {t.effectiveFrom}
                      {t.effectiveTo ? ` to ${t.effectiveTo}` : ""}
                    </p>
                  </div>
                  <Link href={`/clients/${client.id}/terms/${t.id}`} className="link text-sm">
                    Edit
                  </Link>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {t.groups.map((g) => (
                    <Badge key={g}>− {DEDUCTION_GROUP_LABELS[g]}</Badge>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Stores: {t.storeIds ? t.storeIds.map((id) => storeName.get(id) ?? `#${id}`).join(", ") : "all"}
                  {" · "}Shipping charged {t.includeShipping ? "included" : "excluded"}
                  {" · "}Tax {t.includeTax ? "included" : "excluded"}
                  {" · "}Losses {t.carryForwardLoss ? "carried forward" : "not carried"}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <section id="recurring">
        <Card title="Recurring monthly expenses">
          <p className="mb-3 text-sm text-gray-500">
            Charged automatically in every month from start to end, e.g. Shopify plan and app subscriptions.
          </p>
          <table className="table mb-4">
            <thead>
              <tr>
                <th>Description</th>
                <th>Type</th>
                <th>Store</th>
                <th>Months</th>
                <th className="text-right">Amount / month</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {recurring.map((r) => {
                const ended = r.endMonth != null && r.endMonth < thisMonth;
                return (
                  <tr key={r.id} className={ended ? "text-gray-400" : ""}>
                    <td>{r.description}</td>
                    <td>{DEDUCTION_GROUP_LABELS[r.group]}</td>
                    <td>{r.storeId ? storeName.get(r.storeId) : "All stores"}</td>
                    <td>
                      {r.startMonth} → {r.endMonth ?? "ongoing"}
                    </td>
                    <td className="text-right tabular-nums">{formatMoney(r.amount, r.currency)}</td>
                    <td className="text-right whitespace-nowrap">
                      {r.endMonth == null && (
                        <form action={endRecurringExpense.bind(null, client.id, r.id, shiftPeriod(thisMonth, -1))} className="mr-3 inline">
                          <ConfirmButton message={`Stop after ${shiftPeriod(thisMonth, -1)}? It will not be charged from ${thisMonth} onward.`} className="link">
                            Stop
                          </ConfirmButton>
                        </form>
                      )}
                      <form action={deleteRecurringExpense.bind(null, client.id, r.id)} className="inline">
                        <ConfirmButton message="Delete this recurring expense from all months, including past ones?" className="text-red-600 hover:text-red-800">
                          Delete
                        </ConfirmButton>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {recurring.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-gray-500">
                    None yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <ActionForm action={addRecurringExpense.bind(null, client.id)} submitLabel="Add recurring expense">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Description" name="description">
                <input id="description" name="description" className="input" placeholder="Shopify plan" required />
              </Field>
              <Field label="Type" name="group">
                <select id="group" name="group" className="input" defaultValue="SUBSCRIPTIONS">
                  {DEDUCTION_GROUPS.filter((g) => g !== "COGS").map((g) => (
                    <option key={g} value={g}>
                      {DEDUCTION_GROUP_LABELS[g]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Store" name="storeId">
                <select id="storeId" name="storeId" className="input" defaultValue="">
                  <option value="">All stores</option>
                  {storeRows.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Amount per month" name="amount">
                <input id="amount" name="amount" inputMode="decimal" className="input" required />
              </Field>
              <Field label="Currency" name="currency">
                <select id="currency" name="currency" className="input" defaultValue={client.currency}>
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="From" name="startMonth">
                  <input id="startMonth" name="startMonth" type="month" className="input" defaultValue={thisMonth < "2026-10" ? "2026-10" : thisMonth} required />
                </Field>
                <Field label="To (optional)" name="endMonth">
                  <input id="endMonth" name="endMonth" type="month" className="input" />
                </Field>
              </div>
            </div>
          </ActionForm>
        </Card>
      </section>

      <Card title="External shipping providers">
        <p className="mb-3 text-sm text-gray-500">
          Couriers whose costs you enter by hand each month (e.g. Parcelforce, EVRI, ShipStation). Each one gets its own column on the
          expenses screen and statement.
        </p>
        <ul className="mb-4 divide-y divide-gray-100">
          {providers.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2 text-sm">
              <span className={p.active ? "" : "text-gray-400 line-through"}>{p.name}</span>
              <form action={toggleShippingProvider.bind(null, client.id, p.id, !p.active)}>
                <button className="link text-sm">{p.active ? "Deactivate" : "Reactivate"}</button>
              </form>
            </li>
          ))}
          {providers.length === 0 && <li className="py-2 text-sm text-gray-500">None yet.</li>}
        </ul>
        <ActionForm action={addShippingProvider.bind(null, client.id)} submitLabel="Add provider" className="flex items-end gap-3">
          <input name="name" placeholder="Courier name" className="input max-w-xs" required />
        </ActionForm>
      </Card>
    </div>
  );
}
