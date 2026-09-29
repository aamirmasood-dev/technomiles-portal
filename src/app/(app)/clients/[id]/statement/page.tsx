import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { resolvePeriod } from "@/lib/filters";
import { getClientOr404, parseId } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { periodLabel } from "@/lib/period";
import { getStatementView, termsForPeriod, type StatementView } from "@/lib/statement/load";
import { Badge, Card } from "@/components/page-header";
import { CategoryMatrix, DeductionTable, ExpenseList, MissingCosts, StatementSummary, StoreTable } from "@/components/statement/breakdown";
import { closeMonth, reopenMonth } from "./actions";
import { ConfirmAction } from "./confirm-action";

export default async function StatementPage(props: PageProps<"/clients/[id]/statement">) {
  await requireUser();
  const client = await getClientOr404(parseId((await props.params).id));
  const period = resolvePeriod(await props.searchParams, client.timezone);
  const terms = await termsForPeriod(client.id, period);
  const views = await Promise.all(terms.map((t) => getStatementView(client, t, period)));

  return (
    <div className="space-y-8">
      {views.length === 0 && (
        <Card>
          <p className="text-sm text-gray-600">
            No contract term covers {periodLabel(period)}.{" "}
            <Link href={`/clients/${client.id}/setup`} className="link">
              Check the contract terms
            </Link>
            .
          </p>
        </Card>
      )}
      {views.map((v) => (
        <StatementPanel key={v.term.id} v={v} />
      ))}
    </div>
  );
}

function StatementPanel({ v }: { v: StatementView }) {
  const { client, term, period, result: r, closed } = v;
  const m = (n: number) => formatMoney(n, r.currency);
  const printHref = `/print/statement/${client.id}/${term.id}/${period}`;
  const csvHref = `/api/statements/${client.id}/${term.id}/${period}/csv`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{term.name}</h2>
            {closed ? <Badge tone="green">Closed · {closed.invoiceNumber}</Badge> : <Badge tone="amber">Draft</Badge>}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {term.rateBps / 100}% of {term.baseLabel.toLowerCase()}
            {closed && <> · closed {closed.closedAt.toISOString().slice(0, 10)}</>}
          </p>
          <p className="mt-3 text-3xl font-semibold tabular-nums">{m(r.amountDue)}</p>
          <p className="text-sm text-gray-500">amount due</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <a href={printHref} target="_blank" className="btn-secondary">
            Invoice PDF
          </a>
          <a href={csvHref} className="btn-secondary">
            Export CSV
          </a>
          {closed ? (
            v.isLastClosed && (
              <ConfirmAction
                action={reopenMonth.bind(null, client.id, term.id, period)}
                label="Reopen"
                className="btn-secondary"
                confirm={`Reopen ${periodLabel(period)}? Invoice ${closed.invoiceNumber} will be cancelled and the month becomes a draft again. Only do this if the invoice has not been sent.`}
              />
            )
          ) : (
            <ConfirmAction
              action={closeMonth.bind(null, client.id, term.id, period)}
              label="Close month"
              disabled={!v.canClose.ok}
              confirm={`Close ${periodLabel(period)} for ${client.name}? This saves the statement, assigns an invoice number and fixes the amount due at ${m(r.amountDue)}. Later changes will be carried into the next month.`}
            />
          )}
        </div>
      </div>

      {!closed && !v.canClose.ok && <p className="text-sm text-gray-600">Cannot close yet: {v.canClose.reason}</p>}

      {r.problems.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Needs attention</p>
          <ul className="mt-1 list-inside list-disc">
            {r.problems.map((p) => (
              <li key={p.message}>{p.message}</li>
            ))}
          </ul>
        </div>
      )}

      {v.drift.length > 0 && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 p-4 text-sm text-blue-900">
          The data for this month has changed since it was closed: {term.baseLabel.toLowerCase()} is now{" "}
          {v.drift.map((d) => m(d.baseDelta)).join(", ")} different. The invoice stays as it is; the difference will be carried into the next
          month when that month is closed.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Summary">
          <StatementSummary r={r} baseLabel={term.baseLabel} />
          {r.foreign.length > 0 && (
            <p className="mt-3 text-xs text-gray-500">
              Converted to {r.currency} at the ECB rate on each transaction date:{" "}
              {r.foreign.map((f) => `${f.lines} ${f.currency} item(s)`).join(", ")}.
            </p>
          )}
        </Card>
        <Card title="Deductions">
          <DeductionTable r={r} />
        </Card>
      </div>

      <Card title="Sales by store">
        <StoreTable r={r} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Manual & recurring expenses">
          <ExpenseList r={r} />
        </Card>
        <Card title="Cost of goods">
          <p className="text-sm">
            {r.cogs.costedCount} of {r.cogs.orderCount} orders costed · total {m(r.cogs.total)}
            {!term.groups.includes("COGS") && <span className="text-gray-500"> (not deducted under this contract)</span>}
          </p>
          {term.groups.includes("COGS") && (
            <div className="mt-3">
              <MissingCosts r={r} clientId={client.id} />
            </div>
          )}
        </Card>
      </div>

      <details className="rounded-lg border border-gray-200 bg-white">
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">Breakdown by category and store</summary>
        <div className="px-5 pb-5">
          <CategoryMatrix r={r} />
        </div>
      </details>
    </div>
  );
}
