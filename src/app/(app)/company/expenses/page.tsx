import Link from "next/link";
import { Suspense } from "react";
import { and, asc, gte, lt } from "drizzle-orm";
import { db, companyExpenses, companyRecurringExpenses, COMPANY_EXPENSE_CATEGORIES } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { COMPANY_TZ, companyLookups, companyPeriod, monthBounds } from "@/lib/company";
import { COMPANY_EXPENSE_LABELS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { currentPeriod, periodLabel } from "@/lib/period";
import { ActionForm, Field } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { MonthPicker } from "@/components/month-picker";
import { Card } from "@/components/page-header";
import { addFixedExpensesForMonth, addRecurringCompanyExpense, deleteCompanyExpense, saveCompanyExpense, toggleRecurringCompanyExpense } from "../expense-actions";
import { CompanyExpenseFields } from "./expense-fields";

export default async function CompanyExpensesPage(props: PageProps<"/company/expenses">) {
  await requireAdmin();
  const period = companyPeriod(await props.searchParams);
  const { from, toExclusive } = monthBounds(period);
  const [rows, templates, lookups] = await Promise.all([
    db.select().from(companyExpenses).where(and(gte(companyExpenses.expenseDate, from), lt(companyExpenses.expenseDate, toExclusive))).orderBy(asc(companyExpenses.expenseDate), asc(companyExpenses.id)),
    db.select().from(companyRecurringExpenses).orderBy(asc(companyRecurringExpenses.category)),
    companyLookups(),
  ]);
  const partnerName = new Map(lookups.partners.map((p) => [p.id, p.name]));
  const accountName = new Map(lookups.accounts.map((a) => [a.id, a.name]));
  const total = rows.reduce((a, e) => a + e.pkrAmount, 0);
  const byPayer = new Map<string, number>();
  for (const e of rows) {
    const who = e.paidByPartnerId ? `${partnerName.get(e.paidByPartnerId)} (personally)` : `Technomiles: ${accountName.get(e.accountId ?? 0) ?? "account"}`;
    byPayer.set(who, (byPayer.get(who) ?? 0) + e.pkrAmount);
  }
  const added = new Set(rows.map((r) => r.recurringId));
  const pendingFixed = templates.filter((t) => t.active && !added.has(t.id));
  const defaultAccount = lookups.accounts[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-sm text-gray-500">Expenses in {periodLabel(period)}</p>
            <p className="text-xl font-semibold tabular-nums">{formatMoney(total, "PKR")}</p>
          </div>
          {[...byPayer.entries()].map(([who, n]) => (
            <div key={who} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-sm text-gray-500">Paid by {who}</p>
              <p className="text-xl font-semibold tabular-nums">{formatMoney(n, "PKR")}</p>
            </div>
          ))}
        </div>
        <Suspense>
          <MonthPicker period={period} around={currentPeriod(COMPANY_TZ)} />
        </Suspense>
      </div>

      {pendingFixed.length > 0 && defaultAccount && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm">
          <span>
            {pendingFixed.length} fixed monthly expense(s) not yet added for {periodLabel(period)}: {pendingFixed.map((t) => t.description).join(", ")}.
          </span>
          <form action={addFixedExpensesForMonth.bind(null, period, defaultAccount.id)}>
            <button className="btn-primary">Add them (paid from {defaultAccount.name})</button>
          </form>
        </div>
      )}

      <Card title={`Company expenses in ${periodLabel(period)}`}>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Details</th>
              <th>Paid by</th>
              <th className="text-right">Amount</th>
              <th className="text-right">PKR</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>{e.expenseDate}</td>
                <td>{COMPANY_EXPENSE_LABELS[e.category]}</td>
                <td>
                  {e.description}
                  {e.notes && <span className="block text-xs text-gray-500">{e.notes}</span>}
                </td>
                <td>{e.paidByPartnerId ? <span className="text-amber-800">{partnerName.get(e.paidByPartnerId)} (personally)</span> : accountName.get(e.accountId ?? 0)}</td>
                <td className="text-right tabular-nums">{formatMoney(e.amount, e.currency)}</td>
                <td className="text-right font-medium tabular-nums">{formatMoney(e.pkrAmount, "PKR")}</td>
                <td className="text-right whitespace-nowrap">
                  <Link href={`/company/expenses/${e.id}`} className="link mr-3">
                    Edit
                  </Link>
                  <form action={deleteCompanyExpense.bind(null, e.id)} className="inline">
                    <ConfirmButton message="Delete this expense?" className="text-red-600 hover:text-red-800">
                      Delete
                    </ConfirmButton>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-gray-500">
                  No company expenses this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="Add expense">
        <ActionForm action={saveCompanyExpense.bind(null, null)} submitLabel="Add expense">
          <CompanyExpenseFields
            accounts={lookups.accounts}
            partners={lookups.partners}
            defaults={{
              expenseDate: period === currentPeriod(COMPANY_TZ) ? new Date().toISOString().slice(0, 10) : from,
              category: "OTHER",
              description: "",
              currency: "PKR",
              amount: null,
              pkrAmount: null,
              paidBy: defaultAccount ? `account:${defaultAccount.id}` : "",
              notes: null,
            }}
          />
        </ActionForm>
      </Card>

      <Card title="Fixed monthly expenses">
        <p className="mb-3 text-sm text-gray-600">
          Rent, internet and other regular costs. Each month, one click adds them (you can then edit the amount, e.g. for a utility bill).
        </p>
        <table className="table mb-4">
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className={t.active ? "" : "text-gray-400"}>
                <td>{t.description}</td>
                <td>{COMPANY_EXPENSE_LABELS[t.category]}</td>
                <td className="text-right tabular-nums">{formatMoney(t.amount, "PKR")} / month</td>
                <td className="text-right">
                  <form action={toggleRecurringCompanyExpense.bind(null, t.id, !t.active)}>
                    <button className="link">{t.active ? "Stop" : "Restart"}</button>
                  </form>
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td className="py-3 text-gray-500">None yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        <ActionForm action={addRecurringCompanyExpense} submitLabel="Add fixed expense">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Details" name="description">
              <input id="fixedDescription" name="description" className="input" placeholder="Office rent" required />
            </Field>
            <Field label="Category" name="category">
              <select name="category" defaultValue="RENT" className="input">
                {COMPANY_EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {COMPANY_EXPENSE_LABELS[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Usual amount (PKR)" name="amount">
              <input name="amount" inputMode="decimal" className="input" required />
            </Field>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
