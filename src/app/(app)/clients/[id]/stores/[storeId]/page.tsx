import { requireUser } from "@/lib/auth";
import { getClientOr404, getStoreOr404, parseId } from "@/lib/queries";
import { recentSyncLogs, storeCreds } from "@/lib/sync";
import { PLATFORM_LABELS } from "@/lib/labels";
import { SHOPIFY_SCOPES } from "@/lib/connectors/shopify";
import type { ShopifyCreds } from "@/lib/connectors/shopify/client";
import { Badge, Card, PageHeader, SyncBadge } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { saveStore } from "../../../actions";
import { StoreFields } from "../store-fields";
import { disconnectStore, saveShopifyConnection, syncStoreNow, testStoreConnection } from "./actions";
import { ActionButton, ShopifyConnectionForm } from "./connection-ui";

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "—");

export default async function StorePage(props: PageProps<"/clients/[id]/stores/[storeId]">) {
  await requireUser();
  const params = await props.params;
  const client = await getClientOr404(parseId(params.id));
  const store = await getStoreOr404(client.id, parseId(params.storeId));
  const logs = await recentSyncLogs(store.id);
  const creds = storeCreds<ShopifyCreds>(store);
  const connected = creds != null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={store.name}
        subtitle={`${PLATFORM_LABELS[store.platform]}${store.accountRef ? ` · ${store.accountRef}` : ""}`}
        back={{ href: `/clients/${client.id}/stores`, label: "Stores" }}
      />

      <Card title="Connection" actions={connected ? <Badge tone="green">Connected</Badge> : <Badge tone="amber">Not connected</Badge>}>
        {store.platform === "SHOPIFY" ? (
          <div className="space-y-6">
            {connected && creds && (
              <div className="space-y-3">
                <p className="text-sm text-gray-700">
                  Connected to <span className="font-medium">{creds.shopDomain}</span> using{" "}
                  {"clientId" in creds ? `Client ID …${creds.clientId.slice(-4)}` : "an Admin API token"}. Last sync:{" "}
                  <SyncBadge status={store.lastSyncStatus} at={store.lastSyncAt} />
                </p>
                {store.lastSyncStatus === "ERROR" && <p className="text-sm text-red-600">{store.lastSyncMessage}</p>}
                <div className="flex flex-wrap items-start gap-3">
                  <ActionButton action={syncStoreNow.bind(null, client.id, store.id)} label="Sync now" busyLabel="Syncing… (can take a minute)" className="btn-primary" />
                  <ActionButton action={testStoreConnection.bind(null, client.id, store.id)} label="Test connection" busyLabel="Testing…" />
                  <form action={disconnectStore.bind(null, client.id, store.id)}>
                    <ConfirmButton message="Remove the saved credentials? Synced data is kept." className="btn-secondary text-red-600">
                      Disconnect
                    </ConfirmButton>
                  </form>
                </div>
              </div>
            )}
            <details open={!connected} className="rounded-md border border-gray-200 p-4">
              <summary className="cursor-pointer text-sm font-medium">{connected ? "Replace credentials" : "Connect this Shopify store"}</summary>
              <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-2">
                <ShopifyConnectionForm
                  action={saveShopifyConnection.bind(null, client.id, store.id)}
                  defaultDomain={creds?.shopDomain ?? (store.accountRef?.endsWith(".myshopify.com") ? store.accountRef : "")}
                  connected={connected}
                />
                <div className="text-sm text-gray-600">
                  <p className="font-medium text-gray-800">The app needs these Admin API scopes:</p>
                  <ul className="mt-1 list-inside list-disc font-mono text-xs">
                    {SHOPIFY_SCOPES.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                  <p className="mt-3">
                    Saving tests the connection first; credentials are stored encrypted and never shown again. The first sync fetches everything from the
                    store&apos;s &quot;sync from&quot; date ({store.syncStartDate}).
                  </p>
                </div>
              </div>
            </details>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            The {PLATFORM_LABELS[store.platform]} connector is not built yet. It will appear here in a later step.
          </p>
        )}
      </Card>

      <Card title="Sync log">
        {logs.length === 0 ? (
          <p className="text-sm text-gray-500">No syncs yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Started (UTC)</th>
                <th>Status</th>
                <th>Range</th>
                <th className="text-right">Orders</th>
                <th className="text-right">Transactions</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="whitespace-nowrap">{fmt(l.startedAt)}</td>
                  <td>{l.status === "OK" ? <Badge tone="green">OK</Badge> : l.status === "ERROR" ? <Badge tone="red">Error</Badge> : <Badge>Running</Badge>}</td>
                  <td className="text-xs whitespace-nowrap text-gray-600">
                    {fmt(l.rangeFrom)} →<br />
                    {fmt(l.rangeTo)}
                  </td>
                  <td className="text-right tabular-nums">{l.ordersUpserted}</td>
                  <td className="text-right tabular-nums">{l.linesUpserted}</td>
                  <td className="max-w-md text-xs text-gray-600">{l.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Store details">
        <ActionForm action={saveStore.bind(null, client.id, store.id)} submitLabel="Save store">
          <StoreFields isEdit defaults={store} />
        </ActionForm>
      </Card>
    </div>
  );
}
