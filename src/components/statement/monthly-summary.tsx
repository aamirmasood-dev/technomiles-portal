import type { StatementResult } from "@/lib/statement/engine";
import { formatMoney } from "@/lib/money";
import { periodLabel } from "@/lib/period";
import { DEDUCTION_GROUP_LABELS } from "@/lib/labels";
import { StatementSummary, StoreTable } from "./breakdown";

// Page 2 of a statement invoice: sales per platform, shipping, income and expenses.
export function MonthlySummary({ r, clientName, invoiceNumber, baseLabel }: { r: StatementResult; clientName: string; invoiceNumber: string | null; baseLabel: string }) {
  const m = (n: number) => formatMoney(n, r.currency);
  const courierTotal = r.couriers.reduce((a, c) => a + c.amount, 0);
  const shippingGroup = r.groups.find((g) => g.group === "SHIPPING");
  return (
      <section className="page-break border-t border-dashed border-gray-300 p-10 print:border-0 print:p-0">
        <h2 className="text-xl font-semibold">Monthly summary: {periodLabel(r.period)}</h2>
        <p className="text-sm text-gray-500">
          {clientName} · {invoiceNumber ?? "Draft"} · amounts in {r.currency}
        </p>

        <h3 className="mt-6 mb-2 text-sm font-semibold">Sales by platform</h3>
        <StoreTable r={r} />

        <h3 className="mt-6 mb-2 text-sm font-semibold">Shipping</h3>
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="py-1">Shipping charged to customers</td>
              <td className="py-1 text-right tabular-nums">{m(r.gross.shippingCharged)}</td>
            </tr>
            <tr>
              <td className="py-1">Postage labels bought on platforms</td>
              <td className="py-1 text-right tabular-nums">{m(-(shippingGroup?.platform ?? 0))}</td>
            </tr>
            {r.couriers.map((c) => (
              <tr key={c.name}>
                <td className="py-1">{c.name}</td>
                <td className="py-1 text-right tabular-nums">{m(-c.amount)}</td>
              </tr>
            ))}
            <tr className="border-t border-gray-200 font-semibold">
              <td className="py-1">Total shipping costs</td>
              <td className="py-1 text-right tabular-nums">{m(-((shippingGroup?.platform ?? 0) + courierTotal))}</td>
            </tr>
          </tbody>
        </table>

        <h3 className="mt-6 mb-2 text-sm font-semibold">Income and expenses</h3>
        <table className="w-full text-sm">
          <tbody>
            <tr className="font-medium">
              <td className="py-1">Gross sales</td>
              <td className="py-1 text-right tabular-nums">{m(r.gross.total)}</td>
            </tr>
            {r.groups
              .filter((g) => g.applied)
              .map((g) => (
                <tr key={g.group}>
                  <td className="py-1 pl-4">{DEDUCTION_GROUP_LABELS[g.group]}</td>
                  <td className="py-1 text-right tabular-nums">{m(-g.total)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <div className="mt-4 border-t border-gray-300 pt-2">
          <StatementSummary r={r} baseLabel={baseLabel} />
        </div>
        {r.foreign.length > 0 && (
          <p className="mt-3 text-xs text-gray-500">Foreign-currency sales converted to {r.currency} at the ECB reference rate on each transaction date.</p>
        )}
      </section>
  );
}
