import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { allInvoices, plansDue } from "@/lib/invoices/queries";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { InvoiceStatusBadge } from "@/components/invoice-status";
import { Card } from "@/components/page-header";

const FILTERS = [
  { value: "open", label: "Unpaid & partly paid" },
  { value: "all", label: "All invoices" },
  { value: "paid", label: "Paid" },
];

export default async function InvoicesPage(props: PageProps<"/company/invoices">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const filter = FILTERS.some((f) => f.value === sp.show) ? (sp.show as string) : "open";
  const [rows, due] = await Promise.all([allInvoices(), plansDue()]);
  const shown = rows.filter((r) =>
    filter === "all" ? true : filter === "paid" ? r.status === "PAID" || r.status === "SETTLED" : r.outstanding > 0,
  );
  const outstanding = new Map<string, number>();
  for (const r of rows) if (r.outstanding) outstanding.set(r.invoice.currency, (outstanding.get(r.invoice.currency) ?? 0) + r.outstanding);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          {[...outstanding.entries()].map(([cur, n]) => (
            <div key={cur} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-sm text-gray-500">Outstanding ({cur})</p>
              <p className="text-xl font-semibold tabular-nums">{formatMoney(n, cur)}</p>
            </div>
          ))}
          {outstanding.size === 0 && <p className="text-sm text-gray-500">Nothing outstanding.</p>}
        </div>
        <Link href="/company/invoices/new" className="btn-primary">
          New invoice
        </Link>
      </div>

      {due.length > 0 && (
        <Card title="Service billing due (next 30 days)">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Service</th>
                <th>Due</th>
                <th className="text-right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {due.map(({ plan, clientName }) => (
                <tr key={plan.id}>
                  <td>{clientName}</td>
                  <td>
                    {plan.description} <span className="text-gray-500">({plan.interval === "YEARLY" ? "yearly" : "monthly"})</span>
                  </td>
                  <td>{plan.nextDueDate}</td>
                  <td className="text-right tabular-nums">{formatMoney(plan.amount, plan.currency)}</td>
                  <td className="text-right">
                    <Link href={`/company/invoices/new?plan=${plan.id}`} className="link">
                      Create invoice
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card
        title="Invoices"
        actions={
          <AutoSubmitForm>
            <select name="show" defaultValue={filter} className="input w-52 py-1">
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </AutoSubmitForm>
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Client</th>
              <th>Issued</th>
              <th>Due</th>
              <th className="text-right">Amount</th>
              <th className="text-right">PKR equivalent</th>
              <th className="text-right">Received</th>
              <th className="text-right">Outstanding</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.invoice.id}>
                <td>
                  <Link href={`/company/invoices/${r.invoice.id}`} className="link font-medium">
                    {r.invoice.invoiceNumber}
                  </Link>
                </td>
                <td>{r.clientName}</td>
                <td>{r.invoice.issueDate}</td>
                <td>{r.invoice.dueDate}</td>
                <td className="text-right tabular-nums">{formatMoney(r.invoice.amount, r.invoice.currency)}</td>
                <td className="text-right text-gray-600 tabular-nums">{r.pkrEquivalent != null ? formatMoney(r.pkrEquivalent, "PKR") : "—"}</td>
                <td className="text-right tabular-nums">{formatMoney(r.paid, r.invoice.currency)}</td>
                <td className="text-right font-medium tabular-nums">{formatMoney(r.outstanding, r.invoice.currency)}</td>
                <td>
                  <InvoiceStatusBadge status={r.status} overdue={r.overdue} />
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-gray-500">
                  No invoices here. Invoices are created automatically when a client&apos;s month is closed, or with &quot;New invoice&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
