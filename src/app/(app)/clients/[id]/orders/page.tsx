import Link from "next/link";
import { and, asc, eq, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { db, orderCosts, orderItems, orders, stores } from "@/db";
import { requireUser } from "@/lib/auth";
import { resolvePeriod } from "@/lib/filters";
import { getClientOr404, parseId } from "@/lib/queries";
import { formatMoney, fromMinor } from "@/lib/money";
import { localDate, monthRangeUtc, periodLabel } from "@/lib/period";
import { PLATFORM_LABELS } from "@/lib/labels";
import { Badge } from "@/components/page-header";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { CostRowForm } from "./cost-row-form";
import { saveOrderCost } from "./actions";

export default async function OrdersPage(props: PageProps<"/clients/[id]/orders">) {
  await requireUser();
  const client = await getClientOr404(parseId((await props.params).id));
  const sp = await props.searchParams;
  const period = resolvePeriod(sp, client.timezone);
  const onlyMissing = sp.missing === "1";
  const here = `/clients/${client.id}/orders?month=${period}`;

  const { start, end } = monthRangeUtc(period, client.timezone);
  const storeRows = await db.select().from(stores).where(eq(stores.clientId, client.id));
  const storeById = new Map(storeRows.map((s) => [s.id, s]));
  const storeFilter = storeById.get(Number(sp.store))?.id ?? null;
  const rows =
    storeRows.length === 0
      ? []
      : await db
          .select({ order: orders, cost: orderCosts })
          .from(orders)
          .leftJoin(orderCosts, eq(orderCosts.orderId, orders.id))
          .where(
            and(
              inArray(
                orders.storeId,
                storeRows.map((s) => s.id),
              ),
              gte(orders.orderDate, start),
              lt(orders.orderDate, end),
              or(isNull(orders.status), ne(orders.status, "CANCELLED")),
            ),
          )
          .orderBy(asc(orders.orderDate));
  const items =
    rows.length === 0
      ? []
      : await db
          .select()
          .from(orderItems)
          .where(
            inArray(
              orderItems.orderId,
              rows.map((r) => r.order.id),
            ),
          );
  const itemsByOrder = new Map<number, typeof items>();
  for (const i of items) itemsByOrder.set(i.orderId, [...(itemsByOrder.get(i.orderId) ?? []), i]);
  const inStore = storeFilter ? rows.filter((r) => r.order.storeId === storeFilter) : rows;
  const missingCount = inStore.filter((r) => !r.cost).length;
  const shown = onlyMissing ? inStore.filter((r) => !r.cost) : inStore;
  const costTotal = inStore.reduce((a, r) => a + (r.cost ? r.cost.itemCost + r.cost.handling : 0), 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Orders sold in {periodLabel(period)} with their supplier cost and handling. Enter 0 for items already paid for through a bulk purchase.
      </p>
      <AutoSubmitForm className="flex flex-wrap items-center gap-4 text-sm">
        <input type="hidden" name="month" value={period} />
        <label className="flex items-center gap-2">
          Store
          <select name="store" defaultValue={storeFilter ?? ""} className="input w-64">
            <option value="">All stores ({rows.length} orders)</option>
            {storeRows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {PLATFORM_LABELS[s.platform]} ({rows.filter((r) => r.order.storeId === s.id).length})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="missing" value="1" defaultChecked={onlyMissing} /> Only orders without a cost
        </label>
      </AutoSubmitForm>

      <div className="flex gap-4 text-sm">
        <Badge tone={missingCount > 0 ? "amber" : "green"}>
          {inStore.length - missingCount} of {inStore.length} orders costed
        </Badge>
        <span className="text-gray-600">Total cost entered: {formatMoney(costTotal, client.currency)}</span>

      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Store</th>
              <th>Order</th>
              <th>Items</th>
              <th className="text-right">Order total</th>
              <th>Cost (supplier · item cost · handling · notes)</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ order, cost }) => {
              const store = storeById.get(order.storeId)!;
              return (
                <tr key={order.id} className="align-top">
                  <td className="whitespace-nowrap">{localDate(order.orderDate, client.timezone)}</td>
                  <td className="whitespace-nowrap">
                    {store.name}
                    <span className="block text-xs text-gray-500">{PLATFORM_LABELS[store.platform]}</span>
                  </td>
                  <td className="whitespace-nowrap">{order.orderNumber ?? order.externalId}</td>
                  <td className="max-w-xs text-xs text-gray-600">
                    {(itemsByOrder.get(order.id) ?? []).map((i) => (
                      <div key={i.id}>
                        {i.quantity} × {i.title ?? i.sku}
                        {i.sku && <span className="text-gray-400"> ({i.sku})</span>}
                      </div>
                    ))}
                  </td>
                  <td className="text-right tabular-nums">{order.total != null ? formatMoney(order.total, order.currency) : "—"}</td>
                  <td>
                    <CostRowForm
                      action={saveOrderCost.bind(null, order.id)}
                      defaults={{
                        supplier: cost?.supplier ?? "",
                        itemCost: cost ? fromMinor(cost.itemCost) : "",
                        handling: cost ? fromMinor(cost.handling) : "",
                        notes: cost?.notes ?? "",
                      }}
                    />
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-500">
                  {inStore.length === 0 ? (
                    <>No orders synced for this month yet. Orders appear here once the store connectors are running.</>
                  ) : (
                    <>
                      All orders have a cost.{" "}
                      <Link className="link" href={here}>
                        Show all
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
