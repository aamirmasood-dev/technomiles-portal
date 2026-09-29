import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db, ledgerLines, orders, stores, CATEGORIES, type Category } from "@/db";
import { requireUser } from "@/lib/auth";
import { resolvePeriod } from "@/lib/filters";
import { getClientOr404, parseId } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { localDate, monthRangeUtc, periodLabel } from "@/lib/period";
import { CATEGORY_LABELS, PLATFORM_LABELS } from "@/lib/labels";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { Card } from "@/components/page-header";

const LIMIT = 1000;

export default async function TransactionsPage(props: PageProps<"/clients/[id]/transactions">) {
  await requireUser();
  const client = await getClientOr404(parseId((await props.params).id));
  const sp = await props.searchParams;
  const period = resolvePeriod(sp, client.timezone);
  const storeRows = await db.select().from(stores).where(eq(stores.clientId, client.id)).orderBy(asc(stores.name));
  const storeById = new Map(storeRows.map((s) => [s.id, s]));
  const storeFilter = storeById.get(Number(sp.store))?.id ?? null;
  const categoryFilter = CATEGORIES.includes(sp.category as Category) ? (sp.category as Category) : null;
  const { start, end } = monthRangeUtc(period, client.timezone);

  const ids = storeFilter ? [storeFilter] : storeRows.map((s) => s.id);
  const rows =
    ids.length === 0
      ? []
      : await db
          .select({ line: ledgerLines, orderNumber: orders.orderNumber })
          .from(ledgerLines)
          .leftJoin(orders, eq(orders.id, ledgerLines.orderId))
          .where(
            and(
              inArray(ledgerLines.storeId, ids),
              gte(ledgerLines.postedAt, start),
              lt(ledgerLines.postedAt, end),
              categoryFilter ? eq(ledgerLines.category, categoryFilter) : undefined,
            ),
          )
          .orderBy(asc(ledgerLines.postedAt), asc(ledgerLines.id))
          .limit(LIMIT + 1);
  const shown = rows.slice(0, LIMIT);

  // Totals per category and currency for everything matching the filter.
  const totals = new Map<string, number>();
  for (const { line } of shown) totals.set(`${line.category}|${line.currency}`, (totals.get(`${line.category}|${line.currency}`) ?? 0) + line.amount);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Every money movement synced from the platforms for {periodLabel(period)}, for checking against the platforms&apos; own reports. Amounts are from the
        seller&apos;s side: money in is positive, costs are negative.
      </p>
      <AutoSubmitForm className="flex flex-wrap items-center gap-4 text-sm">
        <input type="hidden" name="month" value={period} />
        <label className="flex items-center gap-2">
          Store
          <select name="store" defaultValue={storeFilter ?? ""} className="input w-64">
            <option value="">All stores</option>
            {storeRows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {PLATFORM_LABELS[s.platform]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Category
          <select name="category" defaultValue={categoryFilter ?? ""} className="input w-52">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </AutoSubmitForm>

      {totals.size > 0 && (
        <Card title="Totals">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-4">
            {CATEGORIES.flatMap((c) =>
              [...totals.entries()]
                .filter(([k]) => k.startsWith(`${c}|`))
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-gray-600">{CATEGORY_LABELS[c]}</span>
                    <span className="tabular-nums">{formatMoney(v, k.split("|")[1])}</span>
                  </div>
                )),
            )}
          </div>
        </Card>
      )}

      <div className="rounded-lg border border-gray-200 bg-white">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Store</th>
              <th>Category</th>
              <th>Order</th>
              <th>Description</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ line, orderNumber }) => (
              <tr key={line.id}>
                <td className="whitespace-nowrap">{localDate(line.postedAt, client.timezone)}</td>
                <td className="whitespace-nowrap">{storeById.get(line.storeId)?.name}</td>
                <td className="whitespace-nowrap">{CATEGORY_LABELS[line.category]}</td>
                <td className="whitespace-nowrap">{orderNumber ?? line.orderExternalId ?? "—"}</td>
                <td className="text-gray-600">{line.description}</td>
                <td className={`text-right tabular-nums ${line.amount < 0 ? "text-red-700" : ""}`}>{formatMoney(line.amount, line.currency)}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-500">
                  No transactions for this selection.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {rows.length > LIMIT && <p className="p-3 text-sm text-gray-500">Showing the first {LIMIT}. Filter by store or category to see the rest.</p>}
      </div>
    </div>
  );
}
