import Link from "next/link";
import { Suspense } from "react";
import { and, asc, gte, lt } from "drizzle-orm";
import { db, invoices, payments } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { COMPANY_TZ, companyLookups, companyPeriod, monthBounds } from "@/lib/company";
import { formatMoney } from "@/lib/money";
import { currentPeriod, periodLabel } from "@/lib/period";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { MonthPicker } from "@/components/month-picker";
import { Card } from "@/components/page-header";
import { ReceiptFields } from "@/components/receipt-fields";
import { deletePayment, saveReceipt } from "../invoice-actions";

export default async function PaymentsPage(props: PageProps<"/company/payments">) {
  await requireAdmin();
  const period = companyPeriod(await props.searchParams);
  const { from, toExclusive } = monthBounds(period);
  const [rows, lookups, invRows] = await Promise.all([
    db.select().from(payments).where(and(gte(payments.receivedDate, from), lt(payments.receivedDate, toExclusive))).orderBy(asc(payments.receivedDate), asc(payments.id)),
    companyLookups(),
    db.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber }).from(invoices),
  ]);
  const clientName = new Map(lookups.clients.map((c) => [c.id, c.name]));
  const invNumber = new Map(invRows.map((i) => [i.id, i.invoiceNumber]));
  const accountName = new Map(lookups.accounts.map((a) => [a.id, a.name]));
  const totalPkr = rows.reduce((a, p) => a + p.pkrReceived, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-sm text-gray-500">Received in {periodLabel(period)}</p>
          <p className="text-xl font-semibold tabular-nums">{formatMoney(totalPkr, "PKR")}</p>
          <p className="text-xs text-gray-500">counts toward this month&apos;s company profit</p>
        </div>
        <Suspense>
          <MonthPicker period={period} around={currentPeriod(COMPANY_TZ)} />
        </Suspense>
      </div>

      <Card title={`Payments received in ${periodLabel(period)}`}>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>From</th>
              <th>For</th>
              <th className="text-right">Amount</th>
              <th className="text-right">PKR credited</th>
              <th>Account</th>
              <th>Reference</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.receivedDate}</td>
                <td>{p.clientId ? clientName.get(p.clientId) : <span className="text-gray-500">Other income</span>}</td>
                <td>
                  {p.invoiceId ? (
                    <Link href={`/company/invoices/${p.invoiceId}`} className="link">
                      {invNumber.get(p.invoiceId)}
                    </Link>
                  ) : (
                    <span className="text-gray-600">{p.description ?? "Not for an invoice"}</span>
                  )}
                </td>
                <td className="text-right tabular-nums">{formatMoney(p.amount, p.currency)}</td>
                <td className="text-right font-medium tabular-nums">{formatMoney(p.pkrReceived, "PKR")}</td>
                <td>{p.accountId ? accountName.get(p.accountId) : "—"}</td>
                <td className="text-gray-600">{p.reference}</td>
                <td className="text-right">
                  <form action={deletePayment.bind(null, p.id)}>
                    <ConfirmButton message="Delete this payment record?" className="text-red-600 hover:text-red-800">
                      Delete
                    </ConfirmButton>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-gray-500">
                  Nothing received this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="Record money received">
        <p className="mb-4 text-sm text-gray-600">
          For a client invoice, pick the client and &quot;Oldest unpaid invoices first&quot; (or record it from the invoice itself). For a one-off
          project paid without an invoice, pick the client (or none) and &quot;Not for an invoice&quot;.
        </p>
        <ActionForm action={saveReceipt} submitLabel="Record payment">
          <ReceiptFields
            clients={lookups.clients}
            invoiceOptions={[
              { value: "AUTO", label: "Oldest unpaid invoices first" },
              { value: "", label: "Not for an invoice (other income)" },
            ]}
            defaultInvoice="AUTO"
            currency="GBP"
            accounts={lookups.accounts}
            today={new Date().toISOString().slice(0, 10)}
          />
        </ActionForm>
      </Card>
    </div>
  );
}
