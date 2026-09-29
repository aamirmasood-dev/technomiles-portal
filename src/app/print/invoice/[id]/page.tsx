import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, businessSettings, contractTerms, invoiceLines, statements } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { periodLabel } from "@/lib/period";
import { parseId } from "@/lib/queries";
import { invoiceDetail } from "@/lib/invoices/queries";
import type { StatementResult } from "@/lib/statement/engine";
import { MonthlySummary } from "@/components/statement/monthly-summary";
import { PrintButton } from "../../print-button";

export default async function PrintInvoicePage(props: PageProps<"/print/invoice/[id]">) {
  await requireAdmin();
  const d = await invoiceDetail(parseId((await props.params).id));
  if (!d) notFound();
  const { invoice: inv, client } = d;
  const [lines, [biz], [statement]] = await Promise.all([
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id)).orderBy(asc(invoiceLines.sortOrder)),
    db.select().from(businessSettings).where(eq(businessSettings.id, 1)),
    inv.statementId ? db.select().from(statements).where(eq(statements.id, inv.statementId)) : Promise.resolve([]),
  ]);
  const [term] = statement ? await db.select().from(contractTerms).where(eq(contractTerms.id, statement.termId)) : [];
  const m = (n: number) => formatMoney(n, inv.currency);
  const pkr = (n: number) => formatMoney(n, "PKR");
  const rate = inv.pkrRate ? Number(inv.pkrRate) : null;
  const totalDue = inv.amount + d.previousBalance;
  const fmtDate = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-[210mm] bg-white text-gray-900 print:max-w-none">
      <style>{`@page { size: A4; margin: 14mm; } @media print { .page-break { break-before: page; } }`}</style>
      <div className="flex items-center justify-between border-b border-gray-200 p-4 print:hidden">
        <p className="text-sm text-gray-600">Invoice {inv.invoiceNumber}. Use your browser&apos;s print dialog and choose &quot;Save as PDF&quot;.</p>
        <PrintButton />
      </div>

      <section className="p-10 print:p-0">
        {inv.voidedAt && <p className="mb-4 rounded bg-gray-200 px-3 py-2 text-center text-sm font-semibold">VOID</p>}
        <div className="flex items-start justify-between">
          <div>
            {biz?.logoDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={biz.logoDataUrl} alt="" className="mb-3 h-14 w-auto" />
            )}
            <p className="text-lg font-semibold">{biz?.name ?? "Technomiles"}</p>
            <p className="text-sm whitespace-pre-line text-gray-600">{biz?.address}</p>
            <p className="text-sm text-gray-600">{[biz?.email, biz?.phone, biz?.website].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-light tracking-wide">INVOICE</p>
            <table className="mt-3 ml-auto text-sm">
              <tbody>
                <tr>
                  <td className="pr-4 text-gray-500">Invoice no.</td>
                  <td className="font-medium">{inv.invoiceNumber}</td>
                </tr>
                <tr>
                  <td className="pr-4 text-gray-500">Date</td>
                  <td>{fmtDate(inv.issueDate)}</td>
                </tr>
                <tr>
                  <td className="pr-4 text-gray-500">Due</td>
                  <td>{fmtDate(inv.dueDate)}</td>
                </tr>
                {inv.period && (
                  <tr>
                    <td className="pr-4 text-gray-500">Period</td>
                    <td>{periodLabel(inv.period)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-10">
          <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Bill to</p>
          <p className="mt-1 font-medium">{client.name}</p>
          {client.contactName && <p className="text-sm">{client.contactName}</p>}
          <p className="text-sm whitespace-pre-line text-gray-600">{client.billingAddress}</p>
        </div>

        <table className="mt-10 w-full text-sm">
          <thead>
            <tr className="border-b border-gray-300 text-left text-xs tracking-wide text-gray-500 uppercase">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Amount ({inv.currency})</th>
              {rate != null && inv.currency !== "PKR" && <th className="py-2 text-right">PKR</th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-gray-100">
                <td className="py-3">{l.description}</td>
                <td className="py-3 text-right tabular-nums">{m(l.amount)}</td>
                {rate != null && inv.currency !== "PKR" && <td className="py-3 text-right text-gray-600 tabular-nums">{pkr(Math.round(l.amount * rate))}</td>}
              </tr>
            ))}
            <tr>
              <td className="py-2 text-right">This invoice</td>
              <td className="py-2 text-right font-medium tabular-nums">{m(inv.amount)}</td>
              {rate != null && inv.currency !== "PKR" && <td className="py-2 text-right text-gray-600 tabular-nums">{pkr(Math.round(inv.amount * rate))}</td>}
            </tr>
            {d.previousBalance > 0 && (
              <tr>
                <td className="py-2 text-right">Previous balance outstanding</td>
                <td className="py-2 text-right tabular-nums">{m(d.previousBalance)}</td>
                {rate != null && inv.currency !== "PKR" && (
                  <td className="py-2 text-right text-gray-600 tabular-nums">{pkr(Math.round(d.previousBalance * rate))}</td>
                )}
              </tr>
            )}
            <tr className="border-t border-gray-300">
              <td className="py-3 text-right font-semibold">Total due</td>
              <td className="py-3 text-right text-lg font-semibold tabular-nums">{m(totalDue)}</td>
              {rate != null && inv.currency !== "PKR" && <td className="py-3 text-right font-medium tabular-nums">{pkr(Math.round(totalDue * rate))}</td>}
            </tr>
          </tbody>
        </table>
        {rate != null && inv.currency !== "PKR" && (
          <p className="mt-2 text-right text-xs text-gray-500">
            PKR at 1 {inv.currency} = {rate.toFixed(2)} PKR (interbank rate on the invoice date), for reference.
          </p>
        )}
        {inv.notes && <p className="mt-6 text-sm whitespace-pre-line">{inv.notes}</p>}

        {biz?.bankDetails && (
          <div className="mt-10 rounded border border-gray-200 p-4">
            <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Payment details</p>
            <p className="mt-1 text-sm whitespace-pre-line">{biz.bankDetails}</p>
          </div>
        )}
        {biz?.invoiceFooter && <p className="mt-8 text-center text-xs whitespace-pre-line text-gray-500">{biz.invoiceFooter}</p>}
      </section>

      {statement && term && (
        <MonthlySummary r={statement.snapshot as StatementResult} clientName={client.name} invoiceNumber={inv.invoiceNumber} baseLabel={term.baseLabel} />
      )}
    </div>
  );
}
