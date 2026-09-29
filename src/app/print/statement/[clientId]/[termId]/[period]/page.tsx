import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db, businessSettings, invoices } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { isPeriod, periodLabel } from "@/lib/period";
import { getClientOr404, getTermOr404, parseId } from "@/lib/queries";
import { getStatementView } from "@/lib/statement/load";
import { MonthlySummary } from "@/components/statement/monthly-summary";
import { PrintButton } from "../../../../print-button";

export default async function PrintStatementPage(props: PageProps<"/print/statement/[clientId]/[termId]/[period]">) {
  await requireAdmin();
  const p = await props.params;
  if (!isPeriod(p.period)) notFound();
  const client = await getClientOr404(parseId(p.clientId));
  const term = await getTermOr404(client.id, parseId(p.termId));
  const [v, [biz]] = await Promise.all([
    getStatementView(client, term, p.period),
    db.select().from(businessSettings).where(eq(businessSettings.id, 1)),
  ]);
  // A closed month has a real invoice (with PKR and previous balance): show that instead.
  if (v.closed) {
    const [inv] = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.statementId, v.closed.id));
    if (inv) redirect(`/print/invoice/${inv.id}`);
  }
  const r = v.result;
  const m = (n: number) => formatMoney(n, r.currency);
  const invoiceDate = v.closed ? v.closed.closedAt : new Date();
  const due = new Date(invoiceDate.getTime() + (biz?.paymentTermsDays ?? 14) * 86400000);
  const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });


  return (
    <div className="mx-auto max-w-[210mm] bg-white text-gray-900 print:max-w-none">
      <style>{`@page { size: A4; margin: 14mm; } @media print { .page-break { break-before: page; } }`}</style>
      <div className="flex items-center justify-between border-b border-gray-200 p-4 print:hidden">
        <p className="text-sm text-gray-600">
          {v.closed ? `Invoice ${v.closed.invoiceNumber}` : "Draft: this month is not closed yet"}. Use your browser&apos;s print dialog and choose
          &quot;Save as PDF&quot;.
        </p>
        <PrintButton />
      </div>

      {/* Part 1: invoice */}
      <section className="p-10 print:p-0">
        {!v.closed && <p className="mb-4 rounded bg-amber-100 px-3 py-2 text-center text-sm font-semibold text-amber-900">DRAFT, not final</p>}
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
                  <td className="font-medium">{v.closed?.invoiceNumber ?? "Draft"}</td>
                </tr>
                <tr>
                  <td className="pr-4 text-gray-500">Date</td>
                  <td>{fmtDate(invoiceDate)}</td>
                </tr>
                <tr>
                  <td className="pr-4 text-gray-500">Due</td>
                  <td>{fmtDate(due)}</td>
                </tr>
                <tr>
                  <td className="pr-4 text-gray-500">Period</td>
                  <td>{periodLabel(r.period)}</td>
                </tr>
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
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="py-3">
                {term.name}: {r.rateBps / 100}% of {term.baseLabel.toLowerCase()} for {periodLabel(r.period)}
                <span className="block text-xs text-gray-500">
                  {term.baseLabel} {m(r.base)}
                  {r.lossCarriedOut > 0 && `; loss of ${m(r.lossCarriedOut)} carried forward`} (see monthly summary)
                </span>
              </td>
              <td className="py-3 text-right tabular-nums">{m(r.share)}</td>
            </tr>
            {r.fixedFee !== 0 && (
              <tr className="border-b border-gray-100">
                <td className="py-3">Fixed monthly fee</td>
                <td className="py-3 text-right tabular-nums">{m(r.fixedFee)}</td>
              </tr>
            )}
            <tr>
              <td className="py-3 text-right font-semibold">Total due</td>
              <td className="py-3 text-right text-lg font-semibold tabular-nums">{m(r.amountDue)}</td>
            </tr>
          </tbody>
        </table>

        {biz?.bankDetails && (
          <div className="mt-10 rounded border border-gray-200 p-4">
            <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Payment details</p>
            <p className="mt-1 text-sm whitespace-pre-line">{biz.bankDetails}</p>
          </div>
        )}
        {biz?.invoiceFooter && <p className="mt-8 text-center text-xs whitespace-pre-line text-gray-500">{biz.invoiceFooter}</p>}
      </section>

      <MonthlySummary r={r} clientName={client.name} invoiceNumber={v.closed?.invoiceNumber ?? null} baseLabel={term.baseLabel} />
    </div>
  );
}
