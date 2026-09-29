import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, stores } from "@/db";
import { requireUser } from "@/lib/auth";
import { getClientOr404, parseId } from "@/lib/queries";
import { PLATFORM_LABELS } from "@/lib/labels";
import { Badge, Card, SyncBadge } from "@/components/page-header";

export default async function StoresPage(props: PageProps<"/clients/[id]/stores">) {
  await requireUser();
  const client = await getClientOr404(parseId((await props.params).id));
  const storeRows = await db.select().from(stores).where(eq(stores.clientId, client.id)).orderBy(asc(stores.platform), asc(stores.name));

  return (
    <Card
      title="Stores"
      actions={
        <Link href={`/clients/${client.id}/stores/new`} className="link text-sm">
          Add store
        </Link>
      }
    >
      {storeRows.length === 0 ? (
        <p className="text-sm text-gray-500">No stores yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Store</th>
              <th>Platform</th>
              <th>Account</th>
              <th>Currency</th>
              <th>Sync from</th>
              <th>Last sync</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {storeRows.map((s) => (
              <tr key={s.id}>
                <td className="font-medium">
                  {s.name} {!s.active && <Badge>Inactive</Badge>}
                </td>
                <td>
                  {PLATFORM_LABELS[s.platform]}
                  {s.region && <span className="text-gray-500"> · {s.region}</span>}
                </td>
                <td className="text-gray-600">{s.accountRef ?? "—"}</td>
                <td>{s.currency}</td>
                <td>{s.syncStartDate}</td>
                <td>
                  <SyncBadge status={s.lastSyncStatus} at={s.lastSyncAt} />
                </td>
                <td className="text-right">
                  <Link href={`/clients/${client.id}/stores/${s.id}`} className="link">
                    {s.credentialsEnc ? "Open" : "Connect"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
