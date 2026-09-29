import Link from "next/link";
import type { StatementResult } from "@/lib/statement/engine";
import { formatMoney } from "@/lib/money";
import { CATEGORY_LABELS, DEDUCTION_GROUP_LABELS, PLATFORM_LABELS } from "@/lib/labels";
import { periodLabel } from "@/lib/period";
import { CATEGORIES, type Platform } from "@/db/schema";

// Per-store, per-category breakdown of a statement, shared by the app and the printable page.
export function storeRows(r: StatementResult) {
  return r.stores.map((s) => {
    const refunds = -(s.categories.REFUNDS ?? 0);
    return { ...s, refunds, fees: s.platformCosts - refunds };
  });
}

export function StatementSummary({ r, baseLabel }: { r: StatementResult; baseLabel: string }) {
  const m = (n: number) => formatMoney(n, r.currency);
  const rows: [string, string, boolean?][] = [
    ["Gross sales" + (r.gross.shippingCharged ? " (incl. shipping charged)" : ""), m(r.gross.total)],
    ["Less deductions", m(-r.totalDeductions)],
    [`${baseLabel} for ${periodLabel(r.period)}`, m(r.baseBeforeCarry), true],
  ];
  for (const a of r.adjustments) rows.push([`Adjustment for ${periodLabel(a.sourcePeriod)} (changed after closing)`, m(a.baseDelta)]);
  if (r.lossBroughtForward) rows.push(["Less loss brought forward", m(-r.lossBroughtForward)]);
  if (r.adjustments.length || r.lossBroughtForward) rows.push([`${baseLabel} after carry-forward`, m(r.base), true]);
  rows.push([`Share at ${r.rateBps / 100}%`, m(r.share)]);
  if (r.fixedFee) rows.push(["Fixed monthly fee", m(r.fixedFee)]);
  rows.push(["Amount due", m(r.amountDue), true]);
  if (r.lossCarriedOut) rows.push(["Loss carried forward to next month", m(r.lossCarriedOut)]);

  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([label, value, strong]) => (
          <tr key={label} className={strong ? "border-t border-gray-200 font-semibold" : ""}>
            <td className="py-1.5 pr-4">{label}</td>
            <td className="py-1.5 text-right tabular-nums">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StoreTable({ r }: { r: StatementResult }) {
  const m = (n: number) => formatMoney(n, r.currency);
  const rows = storeRows(r);
  const total = (f: (x: (typeof rows)[number]) => number) => rows.reduce((a, x) => a + f(x), 0);
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Store</th>
          <th className="text-right">Sales</th>
          <th className="text-right">Shipping charged</th>
          <th className="text-right">Refunds</th>
          <th className="text-right">Platform fees & charges</th>
          <th className="text-right">Net</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.storeId}>
            <td>
              {s.name}
              <span className="text-gray-500"> · {PLATFORM_LABELS[s.platform as Platform] ?? s.platform}</span>
            </td>
            <td className="text-right tabular-nums">{m(s.sales)}</td>
            <td className="text-right tabular-nums">{m(s.shippingCharged)}</td>
            <td className="text-right tabular-nums">{m(-s.refunds)}</td>
            <td className="text-right tabular-nums">{m(-s.fees)}</td>
            <td className="text-right font-medium tabular-nums">{m(s.net)}</td>
          </tr>
        ))}
        <tr className="font-semibold">
          <td>Total</td>
          <td className="text-right tabular-nums">{m(total((s) => s.sales))}</td>
          <td className="text-right tabular-nums">{m(total((s) => s.shippingCharged))}</td>
          <td className="text-right tabular-nums">{m(-total((s) => s.refunds))}</td>
          <td className="text-right tabular-nums">{m(-total((s) => s.fees))}</td>
          <td className="text-right tabular-nums">{m(total((s) => s.net))}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function DeductionTable({ r }: { r: StatementResult }) {
  const m = (n: number) => formatMoney(n, r.currency);
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Deduction</th>
          <th className="text-right">From platforms</th>
          <th className="text-right">Entered manually</th>
          <th className="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        {r.groups.map((g) => (
          <tr key={g.group} className={g.applied ? "" : "text-gray-400"}>
            <td>
              {DEDUCTION_GROUP_LABELS[g.group]}
              {!g.applied && <span className="text-xs"> (not deducted under this contract)</span>}
            </td>
            <td className="text-right tabular-nums">{m(g.platform)}</td>
            <td className="text-right tabular-nums">{m(g.manual)}</td>
            <td className="text-right tabular-nums">{m(g.total)}</td>
          </tr>
        ))}
        <tr className="font-semibold">
          <td>Total deducted</td>
          <td />
          <td />
          <td className="text-right tabular-nums">{m(r.totalDeductions)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function ExpenseList({ r }: { r: StatementResult }) {
  const m = (n: number, c = r.currency) => formatMoney(n, c);
  if (r.expenses.length === 0) return <p className="text-sm text-gray-500">No manual expenses.</p>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Description</th>
          <th className="text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        {r.expenses.map((e) => (
          <tr key={String(e.id)}>
            <td>{e.recurring ? "Monthly" : e.date}</td>
            <td>{DEDUCTION_GROUP_LABELS[e.group]}</td>
            <td>{e.description}</td>
            <td className="text-right tabular-nums">
              {m(e.converted)}
              {e.currency !== r.currency && <span className="block text-xs text-gray-500">{m(e.amount, e.currency)}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CategoryMatrix({ r }: { r: StatementResult }) {
  const used = CATEGORIES.filter((c) => r.stores.some((s) => s.categories[c]));
  if (used.length === 0) return <p className="text-sm text-gray-500">No platform transactions.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Category</th>
            {r.stores.map((s) => (
              <th key={s.storeId} className="text-right">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {used.map((c) => (
            <tr key={c}>
              <td>{CATEGORY_LABELS[c]}</td>
              {r.stores.map((s) => (
                <td key={s.storeId} className="text-right tabular-nums">
                  {s.categories[c] ? formatMoney(s.categories[c]!, r.currency) : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MissingCosts({ r, clientId }: { r: StatementResult; clientId: number }) {
  if (r.cogs.missing.length === 0) return null;
  return (
    <div className="text-sm">
      <p className="mb-2">
        {r.cogs.missing.length} order(s) have no cost.{" "}
        <Link href={`/clients/${clientId}/orders?month=${r.period}&missing=1`} className="link">
          Enter costs
        </Link>
      </p>
      <ul className="list-inside list-disc text-gray-600">
        {r.cogs.missing.slice(0, 10).map((o) => (
          <li key={o.orderId}>
            {o.date} · {o.storeName} · {o.orderNumber}
          </li>
        ))}
        {r.cogs.missing.length > 10 && <li>and {r.cogs.missing.length - 10} more</li>}
      </ul>
    </div>
  );
}
