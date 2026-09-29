import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, companyAccounts, invoiceLines } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { parseId } from "@/lib/queries";
import { invoiceDetail } from "@/lib/invoices/queries";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { InvoiceStatusBadge } from "@/components/invoice-status";
import { Card, PageHeader } from "@/components/page-header";
import { ReceiptFields } from "@/components/receipt-fields";
import { deletePayment, saveReceipt, settleInvoice, unsettleInvoice, updateInvoiceRate, voidInvoice } from "../../invoice-actions";
import { InlineForm } from "./rate-form";

export default async function InvoicePage(props: PageProps<"/company/invoices/[id]">) {
  await requireAdmin();
  const d = await invoiceDetail(parseId((await props.params).id));
  if (!d) notFound();
  const sp = await props.searchParams;
  const { invoice: inv, client, summary: s } = d;
  const [lines, accounts] = await Promise.all([
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id)).orderBy(asc(invoiceLines.sortOrder)),
    db.select({ id: companyAccounts.id, name: companyAccounts.name }).from(companyAccounts).where(eq(companyAccounts.active, true)),
  ]);
  const m = (n: number) => formatMoney(n, inv.currency);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Invoice ${inv.invoiceNumber}`}
        subtitle={
          <>
            <Link href={`/clients/${client.id}/invoices`} className="link">
              {client.name}
            </Link>{" "}
            · issued {inv.issueDate} · due {inv.dueDate}
            {inv.period && <> · for {inv.period}</>}
          </>
        }
        back={{ href: "/company/invoices", label: "Invoices" }}
        actions={
          <a href={`/print/invoice/${inv.id}`} target="_blank" className="btn-secondary">
            Invoice PDF
          </a>
        }
      />
      {sp.cannotVoid && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          This invoice cannot be voided: it has payments, or it came from a closed month (reopen the month on the client&apos;s profit sheet instead).
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          ["Invoice amount", m(inv.amount)],
          ["PKR equivalent", s.pkrEquivalent != null ? formatMoney(s.pkrEquivalent, "PKR") : "—"],
          ["Received", m(s.paid)],
          ["PKR actually received", formatMoney(s.pkrReceived, "PKR")],
          ["Outstanding", m(s.outstanding)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <InvoiceStatusBadge status={s.status} overdue={s.outstanding > 0 && inv.dueDate < today} />
        {s.exchangeDifference != null && s.paid > 0 && (
          <span className={s.exchangeDifference < 0 ? "text-red-700" : "text-green-700"}>
            Exchange difference on amounts received: {formatMoney(s.exchangeDifference, "PKR")} (bank PKR vs invoice rate)
          </span>
        )}
        {s.writtenOff > 0 && <span className="text-gray-600">Written off when marked received: {m(s.writtenOff)}</span>}
        {d.previousBalance > 0 && <span className="text-gray-600">Previous balance shown on this invoice: {m(d.previousBalance)}</span>}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Lines">
          <table className="table">
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.description}</td>
                  <td className="text-right tabular-nums">{m(l.amount)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td>Total</td>
                <td className="text-right tabular-nums">{m(inv.amount)}</td>
              </tr>
            </tbody>
          </table>
          {inv.notes && <p className="mt-3 text-sm whitespace-pre-line text-gray-600">{inv.notes}</p>}
        </Card>
        <Card title="Settings">
          <div className="space-y-4 text-sm">
            {inv.currency !== "PKR" && (
              <div>
                <p className="mb-1 text-gray-600">PKR rate shown on the invoice (1 {inv.currency} = ? PKR)</p>
                <InlineForm action={updateInvoiceRate.bind(null, inv.id)} button="Save rate">
                  <input name="pkrRate" defaultValue={inv.pkrRate ?? ""} inputMode="decimal" className="input w-40 py-1.5" />
                </InlineForm>
              </div>
            )}
            {s.status === "SETTLED" ? (
              <div className="flex items-center gap-3">
                <span>Marked as fully received: {inv.settledNote}</span>
                <form action={unsettleInvoice.bind(null, inv.id)}>
                  <button className="link">Undo</button>
                </form>
              </div>
            ) : (
              s.outstanding > 0 && (
                <div>
                  <p className="mb-1 text-gray-600">
                    Mark as fully received: the remaining {m(s.outstanding)} is written off (e.g. a bank or exchange-rate shortfall).
                  </p>
                  <InlineForm action={settleInvoice.bind(null, inv.id)} button="Mark as fully received">
                    <input name="note" placeholder="Reason (optional)" className="input w-64 py-1.5" />
                  </InlineForm>
                </div>
              )
            )}
            {s.status !== "VOID" && s.paid === 0 && !inv.statementId && (
              <form action={voidInvoice.bind(null, inv.id)}>
                <ConfirmButton message={`Void invoice ${inv.invoiceNumber}? It stays in the list as void and is no longer owed.`} className="text-red-600">
                  Void this invoice
                </ConfirmButton>
              </form>
            )}
          </div>
        </Card>
      </div>

      <Card title="Payments received">
        <table className="table mb-6">
          <thead>
            <tr>
              <th>Date</th>
              <th className="text-right">Amount</th>
              <th className="text-right">PKR credited</th>
              <th className="text-right">Effective rate</th>
              <th>Reference</th>
              <th>Description</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {d.payments.map((p) => (
              <tr key={p.id}>
                <td>{p.receivedDate}</td>
                <td className="text-right tabular-nums">{formatMoney(p.amount, p.currency)}</td>
                <td className="text-right tabular-nums">{formatMoney(p.pkrReceived, "PKR")}</td>
                <td className="text-right text-gray-600 tabular-nums">{p.amount ? (p.pkrReceived / p.amount).toFixed(2) : "—"}</td>
                <td>{p.reference}</td>
                <td className="text-gray-600">{p.description}</td>
                <td className="text-right">
                  <form action={deletePayment.bind(null, p.id)}>
                    <ConfirmButton message="Delete this payment record?" className="text-red-600 hover:text-red-800">
                      Delete
                    </ConfirmButton>
                  </form>
                </td>
              </tr>
            ))}
            {d.payments.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-gray-500">
                  Nothing received yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {s.outstanding > 0 && (
          <>
            <h3 className="mb-3 text-sm font-semibold">Record a payment</h3>
            <ActionForm action={saveReceipt} submitLabel="Record payment">
              <ReceiptFields
                clientId={client.id}
                invoiceOptions={[
                  { value: String(inv.id), label: `This invoice (${inv.invoiceNumber})` },
                  { value: "AUTO", label: "Oldest unpaid invoices first" },
                ]}
                defaultInvoice={String(inv.id)}
                currency={inv.currency}
                accounts={accounts}
                today={today}
              />
            </ActionForm>
          </>
        )}
      </Card>
    </div>
  );
}
