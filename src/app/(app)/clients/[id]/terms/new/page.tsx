import { eq } from "drizzle-orm";
import { db, stores } from "@/db";
import { requireUser } from "@/lib/auth";
import { getClientOr404, parseId } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { TermForm } from "../term-form";

export default async function NewTermPage(props: PageProps<"/clients/[id]/terms/new">) {
  await requireUser();
  const client = await getClientOr404(parseId((await props.params).id));
  const clientStores = await db.select().from(stores).where(eq(stores.clientId, client.id));
  return (
    <div>
      <PageHeader title="Add contract term" back={{ href: `/clients/${client.id}/setup`, label: "Contract & setup" }} />
      <TermForm clientId={client.id} clientStores={clientStores} />
    </div>
  );
}
