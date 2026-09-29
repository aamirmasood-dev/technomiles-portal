import Link from "next/link";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db, manualExpenses, stores } from "@/db";
import { requireUser } from "@/lib/auth";
import { resolvePeriod } from "@/lib/filters";
import { getClientOr404, parseId } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { periodLabel, shiftPeriod } from "@/lib/period";
import { PLATFORM_LABELS } from "@/lib/labels";
import { getStatementView, termsForPeriod } from "@/lib/statement/load";
import { Badge, Card, SyncBadge } from "@/components/page-header";
import { StoreTable } from "@/components/statement/breakdown";

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: "red" }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone === "red" ? "text-red-600" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

export default async function ClientOverviewPage(props: PageProps<"/clients/[id]">) {
  await requireUser();
  const client = await getClientOr404(parseId((await props.params).id));
  const period = resolvePeriod(await props.searchParams, client.timezone);
  const q = `?month=${period}`;

  const [terms, storeRows, expenseRows] = await Promise.all([
    termsForPeriod(client.id, period),
    db.select().from(stores).where(eq(stores.clientId, client.id)).orderBy(asc(stores.platform), asc(stores.name)),
    db
      .select({ amount: manualExpenses.amount, currency: manualExpenses.currency })
      .from(manualExpenses)
      .where(
        and(
          eq(manualExpenses.clientId, client.id),
          gte(manualExpenses.expenseDate, `${period}-01`),
          lt(manualExpenses.expenseDate, `${shiftPeriod(period, 1)}-01`),
        ),
      ),
  ]);
  const views = await Promise.all(terms.map((t) => getStatementView(client, t, period)));
  const main = views[0];

  return (
    <div className="space-y-6">
      {!main ? (
        <Card>
          <p className="text-sm text-gray-600">
            No contract term covers {periodLabel(period)}.{" "}
            <Link href={`/clients/${client.id}/setup`} className="link">
              Add or check the contract terms
            </Link>
            .
          </p>
        </Card>
      ) : (
        views.map(({ term, result: r, closed }) => {
          const m = (n: number) => formatMoney(n, r.currency);
          return (
            <div key={term.id} className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{periodLabel(period)}</h2>
                {closed ? <Badge tone="green">Closed · {closed.invoiceNumber}</Badge> : <Badge tone="amber">Draft</Badge>}
                <span className="text-sm text-gray-500">
                  {term.name}: {term.rateBps / 100}% of {term.baseLabel.toLowerCase()}
                </span>
                <Link href={`/clients/${client.id}/statement${q}`} className="link ml-auto text-sm">
                  Open profit sheet →
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat label="Gross sales" value={m(r.gross.total)} sub={`${r.stores.length} store(s)`} />
                <Stat label="Deductions" value={m(r.totalDeductions)} sub="fees, refunds, shipping, costs" />
                <Stat
                  label={term.baseLabel}
                  value={m(r.baseBeforeCarry)}
                  tone={r.baseBeforeCarry < 0 ? "red" : undefined}
                  sub={r.lossBroughtForward ? `after loss b/f: ${m(r.base)}` : undefined}
                />
                <Stat
                  label="Technomiles share"
                  value={m(r.amountDue)}
                  sub={r.lossCarriedOut ? <span className="text-red-600">loss {m(r.lossCarriedOut)} carried forward</span> : undefined}
                />
              </div>
              {r.problems.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  {r.problems.map((p) => (
                    <p key={p.message}>
                      {p.message}{" "}
                      {p.kind === "MISSING_COST" && (
                        <Link href={`/clients/${client.id}/orders${q}&missing=1`} className="underline">
                          Enter costs
                        </Link>
                      )}
                    </p>
                  ))}
                </div>
              )}
              <Card title="Sales by store">
                <StoreTable r={r} />
              </Card>
            </div>
          );
        })
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Orders" actions={<Link href={`/clients/${client.id}/orders${q}`} className="link text-sm">View</Link>}>
          {main ? (
            <p className="text-sm">
              {main.result.cogs.orderCount} orders in {periodLabel(period)}
              {main.term.groups.includes("COGS") && (
                <>
                  {" · "}
                  {main.result.cogs.missing.length > 0 ? (
                    <span className="text-amber-700">{main.result.cogs.missing.length} without a cost</span>
                  ) : (
                    <span className="text-green-700">all costed</span>
                  )}
                </>
              )}
            </p>
          ) : (
            <p className="text-sm text-gray-500">—</p>
          )}
        </Card>
        <Card title="Expenses" actions={<Link href={`/clients/${client.id}/expenses${q}`} className="link text-sm">View</Link>}>
          <p className="text-sm">
            {expenseRows.length} manual expense(s)
            {main && main.result.expenses.some((e) => e.recurring) && <> + {main.result.expenses.filter((e) => e.recurring).length} recurring</>}
            {main && <> · total {formatMoney(main.result.expenses.reduce((a, e) => a + e.converted, 0), client.currency)}</>}
          </p>
        </Card>
        <Card title="Stores" actions={<Link href={`/clients/${client.id}/stores`} className="link text-sm">Manage</Link>}>
          <ul className="space-y-1.5 text-sm">
            {storeRows
              .filter((s) => s.active)
              .map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span>
                    {s.name} <span className="text-gray-500">· {PLATFORM_LABELS[s.platform]}</span>
                  </span>
                  <SyncBadge status={s.lastSyncStatus} at={s.lastSyncAt} connected={s.credentialsEnc != null} />
                </li>
              ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
