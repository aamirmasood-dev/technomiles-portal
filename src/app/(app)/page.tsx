import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, clients, stores, PLATFORMS, type Platform } from "@/db";
import { redirect } from "next/navigation";
import { isAdmin, requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { currentPeriod, isPeriod, localDate, periodLabel, shiftPeriod } from "@/lib/period";
import { salesAnalysis } from "@/lib/sales";
import { SalesChart } from "@/components/sales-chart";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { PLATFORM_LABELS } from "@/lib/labels";
import { getStatementView, termsForPeriod } from "@/lib/statement/load";
import { Badge, Card, PageHeader } from "@/components/page-header";

const RANGES = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "last-12-months", label: "Last 12 months" },
  { value: "ytd", label: "Year to date" },
  { value: "custom", label: "Custom dates" },
] as const;

function lastDay(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function resolveRange(sp: Record<string, string | string[] | undefined>) {
  const today = localDate(new Date(), "Europe/London");
  const thisMonth = today.slice(0, 7);
  const range = RANGES.some((r) => r.value === sp.range) ? (sp.range as string) : "last-3-months";
  const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  switch (range) {
    case "this-month":
      return { range, from: `${thisMonth}-01`, to: today };
    case "last-month": {
      const p = shiftPeriod(thisMonth, -1);
      return { range, from: `${p}-01`, to: lastDay(p) };
    }
    case "last-12-months":
      return { range, from: `${shiftPeriod(thisMonth, -11)}-01`, to: today };
    case "ytd":
      return { range, from: `${today.slice(0, 4)}-01-01`, to: today };
    case "custom": {
      const from = isDate(sp.from) ? sp.from : `${shiftPeriod(thisMonth, -1)}-01`;
      const to = isDate(sp.to) && sp.to >= from ? sp.to : today;
      return { range, from, to };
    }
    default:
      return { range, from: `${shiftPeriod(thisMonth, -2)}-01`, to: today };
  }
}

export default async function DashboardPage(props: PageProps<"/">) {
  // The dashboard shows sales and statements, so staff start on the client list instead.
  if (!isAdmin(await requireUser())) redirect("/clients");
  const sp = await props.searchParams;
  const period = typeof sp.month === "string" && isPeriod(sp.month) ? sp.month : shiftPeriod(currentPeriod("Europe/London"), -1);
  const { range, from, to } = resolveRange(sp);
  const clientFilter = Number(sp.client) || null;
  const platformFilter = PLATFORMS.includes(sp.platform as Platform) ? (sp.platform as Platform) : null;

  const clientRows = await db.select().from(clients).where(eq(clients.active, true)).orderBy(asc(clients.name));
  const summaries = (
    await Promise.all(
      clientRows.map(async (c) => {
        const terms = await termsForPeriod(c.id, period);
        return Promise.all(terms.map((t) => getStatementView(c, t, period)));
      }),
    )
  ).flat();
  const storeRows = await db
    .select({ store: stores, clientName: clients.name })
    .from(stores)
    .innerJoin(clients, eq(clients.id, stores.clientId))
    .where(eq(stores.active, true))
    .orderBy(asc(clients.name), asc(stores.name));

  const months = Array.from({ length: 12 }, (_, i) => shiftPeriod(currentPeriod("Europe/London"), 1 - i));
  // Store choices follow the client / marketplace picked; a store outside them is dropped.
  const storeChoices = storeRows
    .map((r) => r.store)
    .filter((st) => (!clientFilter || st.clientId === clientFilter) && (!platformFilter || st.platform === platformFilter));
  const storeFilter = storeChoices.find((st) => st.id === Number(sp.store))?.id ?? null;
  const sales = await salesAnalysis({ clientId: clientFilter, platform: platformFilter, storeId: storeFilter, from, to });
  const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const selection = [
    clientFilter ? clientRows.find((c) => c.id === clientFilter)?.name : "All clients",
    storeFilter ? storeChoices.find((st) => st.id === storeFilter)?.name : platformFilter ? PLATFORM_LABELS[platformFilter] : "all marketplaces",
  ].join(" · ");

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />

      <section className="space-y-4">
        <AutoSubmitForm className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-gray-600">Client</span>
            <select name="client" defaultValue={clientFilter ?? ""} className="input mt-1 w-48">
              <option value="">All clients</option>
              {clientRows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-600">Marketplace</span>
            <select name="platform" defaultValue={platformFilter ?? ""} className="input mt-1 w-40">
              <option value="">All marketplaces</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-600">Store</span>
            <select name="store" defaultValue={storeFilter ?? ""} className="input mt-1 w-60">
              <option value="">All stores</option>
              {clientRows
                .filter((c) => storeChoices.some((st) => st.clientId === c.id))
                .map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    {storeChoices
                      .filter((st) => st.clientId === c.id)
                      .map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name} · {PLATFORM_LABELS[st.platform]}
                        </option>
                      ))}
                  </optgroup>
                ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-600">Period</span>
            <select name="range" defaultValue={range} className="input mt-1 w-44">
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {range === "custom" && (
            <>
              <label className="text-sm">
                <span className="block text-gray-600">From</span>
                <input type="date" name="from" defaultValue={from} className="input mt-1" />
              </label>
              <label className="text-sm">
                <span className="block text-gray-600">To</span>
                <input type="date" name="to" defaultValue={to} className="input mt-1" />
              </label>
            </>
          )}
          <input type="hidden" name="month" value={period} />
        </AutoSubmitForm>
        <p className="text-sm text-gray-500">
          {selection} · {fmtDate(from)} to {fmtDate(to)}
        </p>

        {sales.length === 0 && (
          <Card>
            <p className="text-sm text-gray-500">No sales for this selection.</p>
          </Card>
        )}
        {sales.map((c) => {
          const m = (n: number) => formatMoney(n, c.currency);
          return (
            <div key={c.currency} className="space-y-4">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[
                  { label: `Total sales (${c.currency})`, value: m(c.gross), sub: "incl. shipping charged" },
                  { label: "Refunds", value: m(c.refunds), sub: "refunded in this period" },
                  { label: "Net sales", value: m(c.net), sub: "sales minus refunds" },
                  { label: "Orders", value: String(c.orderCount), sub: "" },
                ].map((t) => (
                  <div key={t.label} className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm text-gray-500">{t.label}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{t.value}</p>
                    {t.sub && <p className="text-xs text-gray-500">{t.sub}</p>}
                  </div>
                ))}
              </div>
              <Card title={`Sales by marketplace, ${c.granularity === "day" ? "per day" : "per month"} (${c.currency})`}>
                <SalesChart currency={c.currency} buckets={c.buckets} platforms={c.platforms} granularity={c.granularity} />
              </Card>
              <Card title={`Sales by store (${c.currency})`}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Store</th>
                      <th>Marketplace</th>
                      <th className="text-right">Orders</th>
                      <th className="text-right">Sales</th>
                      <th className="text-right">Refunds</th>
                      <th className="text-right">Net sales</th>
                      <th className="text-right">Share of sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.rows.map((r) => (
                      <tr key={r.storeId}>
                        <td>
                          <Link href={`/clients/${r.clientId}`} className="link">
                            {r.clientName}
                          </Link>
                        </td>
                        <td>{r.storeName}</td>
                        <td>{PLATFORM_LABELS[r.platform]}</td>
                        <td className="text-right tabular-nums">{r.orders}</td>
                        <td className="text-right tabular-nums">{m(r.gross)}</td>
                        <td className="text-right tabular-nums">{m(-r.refunds)}</td>
                        <td className="text-right font-medium tabular-nums">{m(r.net)}</td>
                        <td className="text-right text-gray-600 tabular-nums">{c.gross ? `${((r.gross / c.gross) * 100).toFixed(1)}%` : "—"}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td colSpan={3}>Total</td>
                      <td className="text-right tabular-nums">{c.orderCount}</td>
                      <td className="text-right tabular-nums">{m(c.gross)}</td>
                      <td className="text-right tabular-nums">{m(-c.refunds)}</td>
                      <td className="text-right tabular-nums">{m(c.net)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </Card>
            </div>
          );
        })}
      </section>

      <Card
        title={`Statements: ${periodLabel(period)}`}
        actions={
          <form method="get" className="flex items-center gap-2">
            {clientFilter && <input type="hidden" name="client" value={clientFilter} />}
            {platformFilter && <input type="hidden" name="platform" value={platformFilter} />}
            {storeFilter && <input type="hidden" name="store" value={storeFilter} />}
            <input type="hidden" name="range" value={range} />
            {range === "custom" && (
              <>
                <input type="hidden" name="from" value={from} />
                <input type="hidden" name="to" value={to} />
              </>
            )}
            <select name="month" defaultValue={period} className="input w-40 py-1">
              {months.map((mo) => (
                <option key={mo} value={mo}>
                  {periodLabel(mo)}
                </option>
              ))}
            </select>
            <button className="btn-secondary px-3 py-1">Show</button>
          </form>
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Term</th>
              <th className="text-right">Gross sales</th>
              <th className="text-right">Base</th>
              <th className="text-right">Amount due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map(({ client, term, result: r, closed }) => (
              <tr key={`${client.id}-${term.id}`}>
                <td>
                  <Link href={`/clients/${client.id}?month=${period}`} className="link font-medium">
                    {client.name}
                  </Link>
                </td>
                <td className="text-gray-600">
                  {term.name} ({term.rateBps / 100}%)
                </td>
                <td className="text-right tabular-nums">{formatMoney(r.gross.total, r.currency)}</td>
                <td className="text-right tabular-nums">
                  {formatMoney(r.base, r.currency)}
                  {r.lossCarriedOut > 0 && <span className="block text-xs text-red-600">loss {formatMoney(r.lossCarriedOut, r.currency)} carried</span>}
                </td>
                <td className="text-right font-medium tabular-nums">{formatMoney(r.amountDue, r.currency)}</td>
                <td>
                  {closed ? (
                    <Badge tone="green">Closed · {closed.invoiceNumber}</Badge>
                  ) : r.problems.length > 0 ? (
                    <Badge tone="amber">Draft · needs attention</Badge>
                  ) : (
                    <Badge>Draft</Badge>
                  )}
                </td>
              </tr>
            ))}
            {summaries.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-500">
                  No contract terms cover {periodLabel(period)}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="Store sync status">
        <table className="table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Store</th>
              <th>Platform</th>
              <th>Last sync</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {storeRows.map(({ store: s, clientName }) => (
              <tr key={s.id}>
                <td>{clientName}</td>
                <td>
                  <Link href={`/clients/${s.clientId}/stores/${s.id}`} className="link">
                    {s.name}
                  </Link>
                </td>
                <td>{PLATFORM_LABELS[s.platform]}</td>
                <td>{s.lastSyncAt ? s.lastSyncAt.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "Never"}</td>
                <td>
                  {!s.credentialsEnc ? (
                    <Badge tone="amber">Not connected</Badge>
                  ) : s.lastSyncStatus === "ERROR" ? (
                    <span title={s.lastSyncMessage ?? ""}>
                      <Badge tone="red">Error</Badge>
                    </span>
                  ) : s.lastSyncStatus === "OK" ? (
                    <Badge tone="green">OK</Badge>
                  ) : s.lastSyncStatus === "RUNNING" ? (
                    <Badge>Running</Badge>
                  ) : (
                    <Badge>Connected · never synced</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
