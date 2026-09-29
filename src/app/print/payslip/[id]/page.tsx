import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, businessSettings, payrollItems, staffMembers } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { periodLabel } from "@/lib/period";
import { parseId } from "@/lib/queries";
import { PrintButton } from "../../print-button";

export default async function PayslipPage(props: PageProps<"/print/payslip/[id]">) {
  await requireAdmin();
  const [item] = await db.select().from(payrollItems).where(eq(payrollItems.id, parseId((await props.params).id)));
  if (!item) notFound();
  const [[s], [biz]] = await Promise.all([
    db.select().from(staffMembers).where(eq(staffMembers.id, item.staffId)),
    db.select().from(businessSettings).where(eq(businessSettings.id, 1)),
  ]);
  const pkr = (n: number) => formatMoney(n, "PKR");
  const cur = item.commissionCurrency ?? "PKR";
  const rows: [string, string][] =
    item.commissionAmount != null
      ? [
          ["Net sales after all expenses", formatMoney(item.commissionBase ?? 0, cur)],
          [`Commission at ${(s.commissionBps ?? 0) / 100}%`, formatMoney(item.commissionAmount, cur)],
          [`Converted at ${item.fxRate ? Number(item.fxRate).toFixed(2) : "—"} PKR`, pkr(item.basePay)],
        ]
      : [["Monthly salary", pkr(item.basePay)]];
  if (item.bonus) rows.push(["Bonus", pkr(item.bonus)]);
  if (item.deductions) rows.push(["Deductions", pkr(-item.deductions)]);
  if (item.advance) rows.push(["Advance recovered", pkr(-item.advance)]);

  return (
    <div className="mx-auto max-w-[210mm] bg-white text-gray-900 print:max-w-none">
      <style>{`@page { size: A4; margin: 14mm; }`}</style>
      <div className="flex items-center justify-between border-b border-gray-200 p-4 print:hidden">
        <p className="text-sm text-gray-600">Payslip. Use your browser&apos;s print dialog and choose &quot;Save as PDF&quot;.</p>
        <PrintButton />
      </div>
      <section className="p-10 print:p-0">
        <div className="flex items-start justify-between">
          <div>
            {biz?.logoDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={biz.logoDataUrl} alt="" className="mb-3 h-14 w-auto" />
            )}
            <p className="text-lg font-semibold">{biz?.name ?? "Technomiles"}</p>
            <p className="text-sm whitespace-pre-line text-gray-600">{biz?.address}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-light tracking-wide">PAYSLIP</p>
            <p className="mt-2 text-sm">{periodLabel(item.period)}</p>
          </div>
        </div>
        <div className="mt-10">
          <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Employee</p>
          <p className="mt-1 font-medium">{s.name}</p>
          {s.jobTitle && <p className="text-sm text-gray-600">{s.jobTitle}</p>}
        </div>
        <table className="mt-8 w-full text-sm">
          <tbody>
            {rows.map(([l, v]) => (
              <tr key={l} className="border-b border-gray-100">
                <td className="py-2">{l}</td>
                <td className="py-2 text-right tabular-nums">{v}</td>
              </tr>
            ))}
            <tr>
              <td className="py-3 font-semibold">Net pay</td>
              <td className="py-3 text-right text-lg font-semibold tabular-nums">{pkr(item.netPay)}</td>
            </tr>
          </tbody>
        </table>
        {item.notes && <p className="mt-4 text-sm text-gray-600">{item.notes}</p>}
        <p className="mt-8 text-sm">{item.paidDate ? `Paid on ${item.paidDate}.` : "Not paid yet."}</p>
        <div className="mt-16 grid grid-cols-2 gap-16 text-sm">
          <div className="border-t border-gray-400 pt-2">For {biz?.name ?? "Technomiles"}</div>
          <div className="border-t border-gray-400 pt-2">Received by {s.name}</div>
        </div>
      </section>
    </div>
  );
}
