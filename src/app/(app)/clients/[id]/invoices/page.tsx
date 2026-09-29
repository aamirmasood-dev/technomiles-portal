import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, billingPlans } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { companyLookups } from "@/lib/company";
import { clientInvoiceLedger } from "@/lib/invoices/service";
import { CURRENCIES } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { getClientOr404, parseId } from "@/lib/queries";
import { ActionForm, Field } from "@/components/action-form";
import { InvoiceStatusBadge } from "@/components/invoice-status";
import { Card } from "@/components/page-header";
import { ReceiptFields } from "@/components/receipt-fields";
import { addBillingPlan, saveReceipt, toggleBillingPlan } from "@/app/(app)/company/invoice-actions";

export default async function ClientInvoicesPage(props: PageProps<"/clients/[id]/invoices">) {
  await requireAdmin();
  const client = await getClientOr404(parseId((await props.params).id));
  const [ledger, lookups, plans] = await Promise.all([
    clientInvoiceLedger(client.id),
    companyLookups(),
    db.select().from(billingPlans).where(eq(billingPlans.clientId, client.id)).orderBy(asc(billingPlans.nextDueDate)),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const rows = [...ledger.rows].reverse();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          {[...ledger.outstandingByCurrency.entries()].map(([cur, n]) => (
            <div key={cur} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-sm text-gray-500">Outstanding ({cur})</p>
              <p className="text-xl font-semibold tabular-nums">{formatMoney(n, cur)}</p>
            </div>
          ))}
          {ledger.outstandingByCurrency.size === 0 && <p className="text-sm text-gray-500">Nothing outstanding.</p>}
        </div>
        <Link href={`/company/invoices/new?client=${client.id}`} className="btn-primary">
          New invoice
        </Link>
      </div>

      <Card title="Invoices">
        <table className="table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Issued</th>
              <th>For</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Previous balance</th>
              <th className="text-right">Received</th>
              <th className="text-right">PKR received</th>
              <th className="text-right">Outstanding</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.invoice.id}>
                <td>
                  <Link href={`/company/invoices/${r.invoice.id}`} className="link font-medium">
                    {r.invoice.invoiceNumber}
                  </Link>
                </td>
                <td>{r.invoice.issueDate}</td>
                <td className="text-gray-600">{r.invoice.period ?? "—"}</td>
                <td className="text-right tabular-nums">{formatMoney(r.invoice.amount, r.invoice.currency)}</td>
                <td className="text-right text-gray-600 tabular-nums">{r.previousBalance ? formatMoney(r.previousBalance, r.invoice.currency) : "—"}</td>
                <td className="text-right tabular-nums">{formatMoney(r.paid, r.invoice.currency)}</td>
                <td className="text-right tabular-nums">{formatMoney(r.pkrReceived, "PKR")}</td>
                <td className="text-right font-medium tabular-nums">{formatMoney(r.outstanding, r.invoice.currency)}</td>
                <td>
                  <InvoiceStatusBadge status={r.status} overdue={r.outstanding > 0 && r.invoice.dueDate < today} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-gray-500">
                  No invoices yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {ledger.rows.some((r) => r.outstanding > 0) && (
        <Card title="Record a payment from this client">
          <ActionForm action={saveReceipt} submitLabel="Record payment">
            <ReceiptFields
              clientId={client.id}
              invoiceOptions={[
                { value: "AUTO", label: "Oldest unpaid invoices first" },
                ...ledger.rows.filter((r) => r.outstanding > 0).map((r) => ({ value: String(r.invoice.id), label: `${r.invoice.invoiceNumber} only` })),
              ]}
              defaultInvoice="AUTO"
              currency={client.currency}
              accounts={lookups.accounts}
              today={today}
            />
          </ActionForm>
        </Card>
      )}

      <Card title="Recurring billing (hosting, website management…)">
        <p className="mb-3 text-sm text-gray-600">
          When a plan is due, it appears under Company → Invoices with a &quot;Create invoice&quot; button; creating the invoice moves the next due date on by
          a month or a year.
        </p>
        <table className="table mb-4">
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className={p.active ? "" : "text-gray-400"}>
                <td>{p.description}</td>
                <td>{p.interval === "YEARLY" ? "Yearly" : "Monthly"}</td>
                <td className="text-right tabular-nums">{formatMoney(p.amount, p.currency)}</td>
                <td>next due {p.nextDueDate}</td>
                <td className="text-right">
                  <form action={toggleBillingPlan.bind(null, client.id, p.id, !p.active)}>
                    <button className="link">{p.active ? "Stop" : "Restart"}</button>
                  </form>
                </td>
              </tr>
            ))}
            {plans.length === 0 && (
              <tr>
                <td className="py-3 text-gray-500">No recurring billing.</td>
              </tr>
            )}
          </tbody>
        </table>
        <ActionForm action={addBillingPlan.bind(null, client.id)} submitLabel="Add billing plan">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <Field label="Service" name="description">
                <input id="description" name="description" className="input" placeholder="Website hosting & management" required />
              </Field>
            </div>
            <Field label="Amount" name="amount">
              <div className="flex gap-2">
                <input id="amount" name="amount" inputMode="decimal" className="input" required />
                <select name="currency" defaultValue={client.currency} className="input w-24" aria-label="Currency">
                  {[...new Set([...CURRENCIES, "PKR"])].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </Field>
            <Field label="Billed" name="interval">
              <select id="interval" name="interval" defaultValue="YEARLY" className="input">
                <option value="YEARLY">Yearly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </Field>
            <Field label="Next invoice due" name="nextDueDate">
              <input id="nextDueDate" name="nextDueDate" type="date" defaultValue={today} className="input" required />
            </Field>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
