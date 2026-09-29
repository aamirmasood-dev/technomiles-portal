import Link from "next/link";
import { count, eq, asc } from "drizzle-orm";
import { db, clients, stores } from "@/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { Badge, PageHeader } from "@/components/page-header";
import { CLIENT_TYPE_LABELS } from "@/lib/labels";

export default async function ClientsPage() {
  const user = await requireUser();
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      currency: clients.currency,
      clientType: clients.clientType,
      timezone: clients.timezone,
      active: clients.active,
      storeCount: count(stores.id),
    })
    .from(clients)
    .leftJoin(stores, eq(stores.clientId, clients.id))
    .groupBy(clients.id)
    .orderBy(asc(clients.name));

  return (
    <div>
      <PageHeader
        title="Clients"
        actions={
          isAdmin(user) && (
            <Link href="/clients/new" className="btn-primary">
              Add client
            </Link>
          )
        }
      />
      <div className="rounded-lg border border-gray-200 bg-white">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Currency</th>
              <th>Timezone</th>
              <th>Stores</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/clients/${c.id}`} className="link font-medium">
                    {c.name}
                  </Link>
                </td>
                <td className="text-gray-600">{CLIENT_TYPE_LABELS[c.clientType].label}</td>
                <td>{c.currency}</td>
                <td>{c.timezone}</td>
                <td>{c.storeCount}</td>
                <td>{c.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-500">
                  No clients yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
