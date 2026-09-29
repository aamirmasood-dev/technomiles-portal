import { requireAdmin } from "@/lib/auth";
import { BOOKS_START, COMPANY_TZ, companyLookups } from "@/lib/company";
import { formatMoney } from "@/lib/money";
import { closedMonths, monthFigures, partnerSummary } from "@/lib/partners/service";
import { currentPeriod, periodLabel, shiftPeriod } from "@/lib/period";
import { ConfirmButton } from "@/components/confirm-button";
import { Badge, Card } from "@/components/page-header";
import { ConfirmAction } from "@/app/(app)/clients/[id]/statement/confirm-action";
import { closeCompanyMonthAction, deletePartnerEntry, reopenCompanyMonthAction, savePartnerEntry } from "../partner-actions";
import { PartnerEntryForm } from "./entry-form";

const pkr = (n: number) => formatMoney(n, "PKR");
const KIND_LABELS: Record<string, string> = {
  OPENING: "Opening balance",
  PROFIT_SHARE: "Profit share",
  WITHDRAWAL: "Paid to partner",
  PERSONAL_EXPENSE: "Personal expense",
  TRANSFER: "Between partners",
  ADJUSTMENT: "Adjustment",
  EXPENSE_PAID: "Company expense paid",
  SALARY_PAID: "Salary paid",
};

export default async function PartnersPage() {
  await requireAdmin();
  const [summary, closed, lookups] = await Promise.all([partnerSummary(), closedMonths(), companyLookups()]);
  const name = new Map(summary.partners.map((p) => [p.partner.id, p.partner.name]));
  const now = currentPeriod(COMPANY_TZ);
  const lastClosed = closed[0]?.period ?? null;
  const nextToClose = lastClosed ? shiftPeriod(lastClosed, 1) : BOOKS_START;
  const nextFigures = nextToClose < now ? await monthFigures(nextToClose) : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {summary.partners.map(({ partner, balance }) => (
          <div key={partner.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">
              {partner.name} · {partner.shareBps / 100}% share
            </p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${balance < 0 ? "text-red-700" : ""}`}>{pkr(balance)}</p>
            <p className="text-xs text-gray-500">
              {balance > 0 ? "the company owes this partner" : balance < 0 ? "this partner owes the company" : "settled"}
            </p>
          </div>
        ))}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Between partners</p>
          {summary.settlements.length === 0 ? (
            <p className="mt-1 text-lg font-semibold">Even: nobody owes the other</p>
          ) : (
            summary.settlements.map((s) => (
              <p key={`${s.from}-${s.to}`} className="mt-1 text-lg font-semibold">
                {name.get(s.from)} owes {name.get(s.to)} <span className="tabular-nums">{pkr(s.amount)}</span>
              </p>
            ))
          )}
          <p className="text-xs text-gray-500">carried forward until settled</p>
        </div>
      </div>

      <Card title="Monthly profit sharing">
        <p className="mb-3 text-sm text-gray-600">
          Profit = money received − company expenses − salaries paid in the month, split by share into each partner&apos;s balance. Close each month once
          all its payments, expenses and salaries are entered.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Month</th>
              <th className="text-right">Received</th>
              <th className="text-right">Expenses</th>
              <th className="text-right">Salaries</th>
              <th className="text-right">Profit</th>
              <th className="text-right">Each partner (50%)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {nextFigures && (
              <tr className="bg-amber-50/50">
                <td>
                  {periodLabel(nextToClose)} <Badge tone="amber">Open</Badge>
                </td>
                <td className="text-right tabular-nums">{pkr(nextFigures.income)}</td>
                <td className="text-right tabular-nums">{pkr(nextFigures.expenses)}</td>
                <td className="text-right tabular-nums">{pkr(nextFigures.payroll)}</td>
                <td className="text-right font-medium tabular-nums">{pkr(nextFigures.profit)}</td>
                <td className="text-right tabular-nums">{pkr(Math.trunc(nextFigures.profit / 2))}</td>
                <td className="text-right">
                  <ConfirmAction
                    action={closeCompanyMonthAction.bind(null, nextToClose)}
                    label="Close & share profit"
                    confirm={`Close ${periodLabel(nextToClose)} and add ${pkr(nextFigures.profit)} ${nextFigures.profit >= 0 ? "profit" : "loss"} to the partners' balances by share?`}
                  />
                </td>
              </tr>
            )}
            {!nextFigures && (
              <tr>
                <td colSpan={7} className="py-3 text-sm text-gray-500">
                  {periodLabel(nextToClose)} can be closed once it has ended.
                </td>
              </tr>
            )}
            {closed.map((m, i) => (
              <tr key={m.id}>
                <td>
                  {periodLabel(m.period)} <Badge tone="green">Closed</Badge>
                </td>
                <td className="text-right tabular-nums">{pkr(m.income)}</td>
                <td className="text-right tabular-nums">{pkr(m.expenses)}</td>
                <td className="text-right tabular-nums">{pkr(m.payroll)}</td>
                <td className="text-right font-medium tabular-nums">{pkr(m.profit)}</td>
                <td className="text-right tabular-nums">{pkr(Math.trunc(m.profit / 2))}</td>
                <td className="text-right">
                  {i === 0 && (
                    <ConfirmAction
                      action={reopenCompanyMonthAction.bind(null, m.period)}
                      label="Reopen"
                      className="btn-secondary"
                      confirm={`Reopen ${periodLabel(m.period)}? The profit shares for that month are removed from the partners' balances until it is closed again.`}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Record a partner transaction">
        <PartnerEntryForm
          action={savePartnerEntry}
          partners={summary.partners.map((p) => ({ id: p.partner.id, name: p.partner.name }))}
          accounts={lookups.accounts}
          today={today}
        />
        <p className="mt-3 text-xs text-gray-500">
          Company expenses and salaries a partner paid personally are added automatically from the Expenses and Payroll pages.
        </p>
      </Card>

      {summary.partners.map(({ partner, ledger, balance }) => (
        <Card key={partner.id} title={`${partner.name}: statement`} actions={<span className="text-sm font-medium tabular-nums">Balance {pkr(balance)}</span>}>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Details</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Balance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ledger.map((r, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap">{r.date}</td>
                  <td className="whitespace-nowrap">{KIND_LABELS[r.kind] ?? r.kind}</td>
                  <td className="text-gray-600">{r.description}</td>
                  <td className={`text-right tabular-nums ${r.amount < 0 ? "text-red-700" : ""}`}>{pkr(r.amount)}</td>
                  <td className="text-right font-medium tabular-nums">{pkr(r.balance ?? 0)}</td>
                  <td className="text-right">
                    {r.entryId && r.kind !== "PROFIT_SHARE" && (
                      <form action={deletePartnerEntry.bind(null, r.entryId)}>
                        <ConfirmButton message="Delete this entry?" className="text-red-600 hover:text-red-800">
                          Delete
                        </ConfirmButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {ledger.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-gray-500">
                    No entries yet. Start with the opening balance.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}
