import Link from "next/link";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db, manualExpenses, shippingProviders, stores } from "@/db";
import { requireUser } from "@/lib/auth";
import { resolvePeriod } from "@/lib/filters";
import { getClientOr404, parseId } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { periodLabel, shiftPeriod } from "@/lib/period";
import { DEDUCTION_GROUP_LABELS } from "@/lib/labels";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { Card } from "@/components/page-header";
import { deleteExpense, saveExpense } from "./actions";
import { ExpenseFields } from "./expense-fields";

export default async function ExpensesPage(props: PageProps<"/clients/[id]/expenses">) {
  await requireUser();
  const client = await getClientOr404(parseId((await props.params).id));
  const period = resolvePeriod(await props.searchParams, client.timezone);
  const returnTo = `/clients/${client.id}/expenses?month=${period}`;
  const [rows, storeRows, providers] = await Promise.all([
    db
      .select()
      .from(manualExpenses)
      .where(
        and(
          eq(manualExpenses.clientId, client.id),
          gte(manualExpenses.expenseDate, `${period}-01`),
          lt(manualExpenses.expenseDate, `${shiftPeriod(period, 1)}-01`),
        ),
      )
      .orderBy(asc(manualExpenses.expenseDate), asc(manualExpenses.id)),
    db.select().from(stores).where(eq(stores.clientId, client.id)).orderBy(asc(stores.name)),
    db.select().from(shippingProviders).where(eq(shippingProviders.clientId, client.id)).orderBy(asc(shippingProviders.name)),
  ]);
  const storeName = new Map(storeRows.map((s) => [s.id, s.name]));
  const providerName = new Map(providers.map((p) => [p.id, p.name]));

  // Totals per courier and currency, for the "courier columns".
  const courierTotals = providers
    .filter((p) => p.active || rows.some((r) => r.shippingProviderId === p.id))
    .map((p) => {
      const byCur = new Map<string, number>();
      for (const r of rows.filter((r) => r.shippingProviderId === p.id)) byCur.set(r.currency, (byCur.get(r.currency) ?? 0) + r.amount);
      return { name: p.name, totals: [...byCur.entries()] };
    });

  // Store × (courier or expense type) totals, per currency.
  const columnOf = (r: (typeof rows)[number]) => (r.shippingProviderId ? (providerName.get(r.shippingProviderId) ?? "Courier") : DEDUCTION_GROUP_LABELS[r.group]);
  const columns = [...new Set(rows.map(columnOf))];
  const addTo = (m: Map<string, number>, cur: string, n: number) => m.set(cur, (m.get(cur) ?? 0) + n);
  const storeKeys = [...new Set(rows.map((r) => r.storeId))].sort((a, b) => (a == null ? 1 : b == null ? -1 : (storeName.get(a) ?? "").localeCompare(storeName.get(b) ?? "")));
  const byStore = {
    columns,
    rows: storeKeys.map((sid) => {
      const mine = rows.filter((r) => r.storeId === sid);
      const cells: Record<string, [string, number][]> = {};
      for (const c of columns) {
        const m = new Map<string, number>();
        for (const r of mine.filter((r) => columnOf(r) === c)) addTo(m, r.currency, r.amount);
        if (m.size) cells[c] = [...m.entries()];
      }
      const t = new Map<string, number>();
      for (const r of mine) addTo(t, r.currency, r.amount);
      return { label: sid ? (storeName.get(sid) ?? "Store") : "All stores (shared)", cells, total: [...t.entries()] };
    }),
  };

  return (
    <div className="space-y-6">

      {courierTotals.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {courierTotals.map((c) => (
            <div key={c.name} className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500">{c.name}</p>
              <p className="mt-1 text-lg font-semibold">
                {c.totals.length === 0 ? formatMoney(0, client.currency) : c.totals.map(([cur, n]) => formatMoney(n, cur)).join(" + ")}
              </p>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <Card title="By store">
          <table className="table">
            <thead>
              <tr>
                <th>Store</th>
                {byStore.columns.map((c) => (
                  <th key={c} className="text-right">
                    {c}
                  </th>
                ))}
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {byStore.rows.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  {byStore.columns.map((c) => (
                    <td key={c} className="text-right tabular-nums">
                      {r.cells[c] ? r.cells[c].map(([cur, n]) => formatMoney(n, cur)).join(" + ") : "—"}
                    </td>
                  ))}
                  <td className="text-right font-medium tabular-nums">{r.total.map(([cur, n]) => formatMoney(n, cur)).join(" + ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title={`Expenses in ${periodLabel(period)}`}>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Courier</th>
              <th>Store</th>
              <th>Description</th>
              <th className="text-right">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.expenseDate}</td>
                <td>{DEDUCTION_GROUP_LABELS[r.group]}</td>
                <td>{r.shippingProviderId ? providerName.get(r.shippingProviderId) : "—"}</td>
                <td>{r.storeId ? storeName.get(r.storeId) : "All stores"}</td>
                <td className="text-gray-600">{r.description}</td>
                <td className="text-right tabular-nums">{formatMoney(r.amount, r.currency)}</td>
                <td className="text-right whitespace-nowrap">
                  <Link href={`/clients/${client.id}/expenses/${r.id}?month=${period}`} className="link mr-3">
                    Edit
                  </Link>
                  <form action={deleteExpense.bind(null, client.id, r.id, returnTo)} className="inline">
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
                  No expenses this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="Add expense">
        <ActionForm action={saveExpense.bind(null, client.id, null, returnTo)} submitLabel="Add expense">
          <ExpenseFields
            stores={storeRows}
            providers={providers}
            defaults={{
              expenseDate: `${period}-01`,
              group: "OTHER_MANUAL",
              storeId: null,
              shippingProviderId: null,
              amount: null,
              currency: client.currency,
              description: null,
            }}
          />
        </ActionForm>
        <p className="mt-4 text-xs text-gray-500">
          Monthly charges such as the Shopify plan and apps can be set up once as{" "}
          <Link href={`/clients/${client.id}/setup#recurring`} className="link">
            recurring expenses
          </Link>{" "}
          on the client page.
        </p>
      </Card>
    </div>
  );
}
