import Link from "next/link";
import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { db, payrollItems, staffMembers, stores } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { COMPANY_TZ, companyLookups } from "@/lib/company";
import { formatMoney, fromMinor } from "@/lib/money";
import { currentPeriod, isPeriod, periodLabel, shiftPeriod } from "@/lib/period";
import { ConfirmButton } from "@/components/confirm-button";
import { MonthPicker } from "@/components/month-picker";
import { Badge, Card } from "@/components/page-header";
import { deletePayrollItem, markPayrollPaid, preparePayrollAction, recalcPayrollAction, unpayPayrollItem, updatePayrollItem } from "../payroll-actions";
import { RowForm } from "./row-forms";

export default async function PayrollPage(props: PageProps<"/company/payroll">) {
  await requireAdmin();
  const sp = await props.searchParams;
  // Default to last month: salaries for a month are paid between the 10th and 15th of the next.
  const period = typeof sp.month === "string" && isPeriod(sp.month) ? sp.month : shiftPeriod(currentPeriod(COMPANY_TZ), -1);
  const [items, staff, lookups, storeRows] = await Promise.all([
    db.select().from(payrollItems).where(eq(payrollItems.period, period)),
    db.select().from(staffMembers).orderBy(asc(staffMembers.name)),
    companyLookups(),
    db.select({ id: stores.id, name: stores.name }).from(stores),
  ]);
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const storeName = new Map(storeRows.map((s) => [s.id, s.name]));
  const clientName = new Map(lookups.clients.map((c) => [c.id, c.name]));
  const partnerName = new Map(lookups.partners.map((p) => [p.id, p.name]));
  const accountName = new Map(lookups.accounts.map((a) => [a.id, a.name]));
  const missing = staff.filter((s) => s.active && !items.some((i) => i.staffId === s.id));
  const total = items.reduce((a, i) => a + i.netPay, 0);
  const paid = items.filter((i) => i.paidDate).reduce((a, i) => a + i.netPay, 0);
  const today = new Date().toISOString().slice(0, 10);
  const pkr = (n: number) => formatMoney(n, "PKR");
  const payers = [
    ...lookups.accounts.map((a) => ({ value: `account:${a.id}`, label: `Technomiles: ${a.name}` })),
    ...lookups.partners.map((p) => ({ value: `partner:${p.id}`, label: `${p.name} (personally)` })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          {[
            [`Payroll for ${periodLabel(period)}`, pkr(total)],
            ["Paid", pkr(paid)],
            ["Still to pay", pkr(total - paid)],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-sm text-gray-500">{l}</p>
              <p className="text-xl font-semibold tabular-nums">{v}</p>
            </div>
          ))}
        </div>
        <Suspense>
          <MonthPicker period={period} around={currentPeriod(COMPANY_TZ)} />
        </Suspense>
      </div>
      <p className="text-sm text-gray-600">
        The month here is the month <strong>worked</strong>. Salaries count as a company cost in the month they are <strong>paid</strong> (usually the 10th–15th
        of the next month), so they reduce that month&apos;s profit.
      </p>

      {missing.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm">
          <span>
            No payroll line yet for {missing.map((s) => s.name).join(", ")} in {periodLabel(period)}.
          </span>
          <form action={preparePayrollAction.bind(null, period)}>
            <button className="btn-primary">Prepare payroll for {periodLabel(period)}</button>
          </form>
        </div>
      )}

      {items.map((i) => {
        const s = staffById.get(i.staffId)!;
        const cur = i.commissionCurrency ?? "PKR";
        return (
          <Card
            key={i.id}
            title={`${s.name}${s.jobTitle ? ` · ${s.jobTitle}` : ""}`}
            actions={
              i.paidDate ? (
                <Badge tone="green">
                  Paid {i.paidDate} by {i.paidByPartnerId ? partnerName.get(i.paidByPartnerId) : accountName.get(i.accountId ?? 0)}
                </Badge>
              ) : (
                <Badge tone="amber">Unpaid</Badge>
              )
            }
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <table className="w-full text-sm">
                <tbody>
                  {i.commissionAmount != null ? (
                    <>
                      <tr>
                        <td className="py-1 text-gray-600">
                          Net sales after all expenses ({s.commissionStoreIds?.map((id) => storeName.get(id)).join(", ")})
                        </td>
                        <td className="py-1 text-right tabular-nums">{formatMoney(i.commissionBase ?? 0, cur)}</td>
                      </tr>
                      <tr>
                        <td className="py-1 text-gray-600">
                          Commission at {(s.commissionBps ?? 0) / 100}%{(i.commissionBase ?? 0) <= 0 && " (none: net sales not positive)"}
                        </td>
                        <td className="py-1 text-right tabular-nums">{formatMoney(i.commissionAmount, cur)}</td>
                      </tr>
                      <tr>
                        <td className="py-1 text-gray-600">
                          Rate {i.fxRate ? Number(i.fxRate).toFixed(2) : "—"} PKR <span className="text-xs">({i.fxSource})</span>
                        </td>
                        <td className="py-1 text-right tabular-nums">{pkr(i.basePay)}</td>
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td className="py-1 text-gray-600">Monthly salary</td>
                      <td className="py-1 text-right tabular-nums">{pkr(i.basePay)}</td>
                    </tr>
                  )}
                  {i.bonus !== 0 && (
                    <tr>
                      <td className="py-1 text-gray-600">Bonus</td>
                      <td className="py-1 text-right tabular-nums">{pkr(i.bonus)}</td>
                    </tr>
                  )}
                  {i.deductions !== 0 && (
                    <tr>
                      <td className="py-1 text-gray-600">Deductions</td>
                      <td className="py-1 text-right tabular-nums">{pkr(-i.deductions)}</td>
                    </tr>
                  )}
                  {i.advance !== 0 && (
                    <tr>
                      <td className="py-1 text-gray-600">Advance recovered</td>
                      <td className="py-1 text-right tabular-nums">{pkr(-i.advance)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-gray-200 font-semibold">
                    <td className="py-1.5">Net pay</td>
                    <td className="py-1.5 text-right tabular-nums">{pkr(i.netPay)}</td>
                  </tr>
                  {i.notes && (
                    <tr>
                      <td colSpan={2} className="pt-1 text-xs text-gray-500">
                        {i.notes}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="space-y-3 text-sm">
                {!i.paidDate && (
                  <>
                    <RowForm action={updatePayrollItem.bind(null, i.id)} button="Save">
                      <label>
                        <span className="block text-xs text-gray-500">Bonus</span>
                        <input name="bonus" defaultValue={fromMinor(i.bonus)} inputMode="decimal" className="input w-24 py-1.5" />
                      </label>
                      <label>
                        <span className="block text-xs text-gray-500">Deductions</span>
                        <input name="deductions" defaultValue={fromMinor(i.deductions)} inputMode="decimal" className="input w-24 py-1.5" />
                      </label>
                      <label>
                        <span className="block text-xs text-gray-500">Advance</span>
                        <input name="advance" defaultValue={fromMinor(i.advance)} inputMode="decimal" className="input w-24 py-1.5" />
                      </label>
                      {i.commissionAmount != null && (
                        <label>
                          <span className="block text-xs text-gray-500">PKR rate</span>
                          <input name="fxRate" defaultValue={i.fxRate ? Number(i.fxRate).toFixed(4) : ""} inputMode="decimal" className="input w-24 py-1.5" />
                        </label>
                      )}
                      <label>
                        <span className="block text-xs text-gray-500">Note</span>
                        <input name="notes" defaultValue={i.notes ?? ""} className="input w-40 py-1.5" />
                      </label>
                    </RowForm>
                    <RowForm action={markPayrollPaid.bind(null, i.id)} button="Mark as paid">
                      <label>
                        <span className="block text-xs text-gray-500">Paid on</span>
                        <input name="paidDate" type="date" defaultValue={today} className="input py-1.5" />
                      </label>
                      <label>
                        <span className="block text-xs text-gray-500">Paid by</span>
                        <select name="paidBy" className="input py-1.5">
                          {payers.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </RowForm>
                  </>
                )}
                <div className="flex flex-wrap gap-4">
                  <a href={`/print/payslip/${i.id}`} target="_blank" className="link">
                    Payslip PDF
                  </a>
                  {!i.paidDate && i.commissionAmount != null && (
                    <form action={recalcPayrollAction.bind(null, i.id)}>
                      <button className="link">Recalculate commission</button>
                    </form>
                  )}
                  {i.paidDate ? (
                    <form action={unpayPayrollItem.bind(null, i.id)}>
                      <ConfirmButton message="Undo this payment? It will no longer count as paid." className="link">
                        Undo payment
                      </ConfirmButton>
                    </form>
                  ) : (
                    <form action={deletePayrollItem.bind(null, i.id)}>
                      <ConfirmButton message="Remove this payroll line for the month?" className="text-red-600">
                        Remove
                      </ConfirmButton>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </Card>
        );
      })}

      <Card
        title="Staff"
        actions={
          <Link href="/company/payroll/staff/new" className="link text-sm">
            Add staff member
          </Link>
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Pay</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className={s.active ? "" : "text-gray-400"}>
                <td>
                  {s.name}
                  {s.jobTitle && <span className="block text-xs text-gray-500">{s.jobTitle}</span>}
                </td>
                <td>
                  {s.payType === "SALARY"
                    ? `${pkr(s.monthlySalary ?? 0)} / month`
                    : `${(s.commissionBps ?? 0) / 100}% of net sales: ${clientName.get(s.commissionClientId ?? 0)} (${s.commissionStoreIds?.map((id) => storeName.get(id)).join(", ")})`}
                </td>
                <td>{s.active ? "Active" : "Inactive"}</td>
                <td className="text-right">
                  <Link href={`/company/payroll/staff/${s.id}`} className="link">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
