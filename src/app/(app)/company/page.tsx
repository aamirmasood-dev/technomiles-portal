import Link from "next/link";
import { Suspense } from "react";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, companyExpenses, payments } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { COMPANY_TZ, companyLookups, companyPeriod, monthBounds } from "@/lib/company";
import { allInvoices } from "@/lib/invoices/queries";
import { COMPANY_EXPENSE_LABELS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { currentPeriod, periodLabel } from "@/lib/period";
import { MonthPicker } from "@/components/month-picker";
import { Card } from "@/components/page-header";

const pkr = (n: number) => formatMoney(n, "PKR");

export default async function CompanyOverviewPage(props: PageProps<"/company">) {
  await requireAdmin();
  const period = companyPeriod(await props.searchParams);
  const { from, toExclusive } = monthBounds(period);
  const [monthPayments, monthExpenses, lookups, invoiceRows] = await Promise.all([
    db.select().from(payments).where(and(gte(payments.receivedDate, from), lt(payments.receivedDate, toExclusive))),
    db.select().from(companyExpenses).where(and(gte(companyExpenses.expenseDate, from), lt(companyExpenses.expenseDate, toExclusive))),
    companyLookups(),
    allInvoices(),
  ]);
  const clientName = new Map(lookups.clients.map((c) => [c.id, c.name]));

  const income = monthPayments.reduce((a, p) => a + p.pkrReceived, 0);
  const expenses = monthExpenses.reduce((a, e) => a + e.pkrAmount, 0);
  const incomeBy = new Map<string, number>();
  for (const p of monthPayments) {
    const k = p.clientId ? (clientName.get(p.clientId) ?? "Client") : (p.description ?? "Other income");
    incomeBy.set(k, (incomeBy.get(k) ?? 0) + p.pkrReceived);
  }
  const expenseBy = new Map<string, number>();
  for (const e of monthExpenses) expenseBy.set(COMPANY_EXPENSE_LABELS[e.category], (expenseBy.get(COMPANY_EXPENSE_LABELS[e.category]) ?? 0) + e.pkrAmount);

  // Bank balance: opening + money received into it - expenses paid from it (payroll and partner payouts follow).
  const balances = await Promise.all(
    lookups.accounts.map(async (a) => {
      const [[inflow], [outflow]] = await Promise.all([
        db.select({ n: sql<string>`coalesce(sum(${payments.pkrReceived}), 0)` }).from(payments).where(and(eq(payments.accountId, a.id), gte(payments.receivedDate, a.openingDate))),
        db
          .select({ n: sql<string>`coalesce(sum(${companyExpenses.pkrAmount}), 0)` })
          .from(companyExpenses)
          .where(and(eq(companyExpenses.accountId, a.id), gte(companyExpenses.expenseDate, a.openingDate))),
      ]);
      return { account: a, balance: a.openingBalance + Number(inflow.n) - Number(outflow.n) };
    }),
  );
  const outstanding = new Map<string, number>();
  for (const r of invoiceRows) if (r.outstanding) outstanding.set(r.invoice.currency, (outstanding.get(r.invoice.currency) ?? 0) + r.outstanding);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Suspense>
          <MonthPicker period={period} around={currentPeriod(COMPANY_TZ)} />
        </Suspense>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Money received", pkr(income), "payments that arrived this month"],
          ["Company expenses", pkr(expenses), "rent, bills, subscriptions…"],
          ["Profit before salaries", pkr(income - expenses), "salaries and partner shares come next"],
          ...balances.map((b) => [`${b.account.name} balance`, pkr(b.balance), `since opening on ${b.account.openingDate}`]),
        ].map(([label, value, sub]) => (
          <div key={label} className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
            <p className="text-xs text-gray-500">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title={`Income, ${periodLabel(period)}`} actions={<Link href={`/company/payments?month=${period}`} className="link text-sm">Details</Link>}>
          <table className="w-full text-sm">
            <tbody>
              {[...incomeBy.entries()].map(([k, v]) => (
                <tr key={k}>
                  <td className="py-1">{k}</td>
                  <td className="py-1 text-right tabular-nums">{pkr(v)}</td>
                </tr>
              ))}
              {incomeBy.size === 0 && (
                <tr>
                  <td className="py-1 text-gray-500">Nothing received.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <Card title={`Expenses, ${periodLabel(period)}`} actions={<Link href={`/company/expenses?month=${period}`} className="link text-sm">Details</Link>}>
          <table className="w-full text-sm">
            <tbody>
              {[...expenseBy.entries()].map(([k, v]) => (
                <tr key={k}>
                  <td className="py-1">{k}</td>
                  <td className="py-1 text-right tabular-nums">{pkr(v)}</td>
                </tr>
              ))}
              {expenseBy.size === 0 && (
                <tr>
                  <td className="py-1 text-gray-500">No expenses.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <Card title="Owed by clients" actions={<Link href="/company/invoices" className="link text-sm">Invoices</Link>}>
          <table className="w-full text-sm">
            <tbody>
              {[...outstanding.entries()].map(([cur, n]) => (
                <tr key={cur}>
                  <td className="py-1">Outstanding in {cur}</td>
                  <td className="py-1 text-right tabular-nums">{formatMoney(n, cur)}</td>
                </tr>
              ))}
              {outstanding.size === 0 && (
                <tr>
                  <td className="py-1 text-gray-500">Nothing outstanding.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
