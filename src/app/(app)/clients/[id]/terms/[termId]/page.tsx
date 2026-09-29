import { eq } from "drizzle-orm";
import { db, stores } from "@/db";
import { requireUser } from "@/lib/auth";
import { getClientOr404, getTermOr404, parseId } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { TermForm } from "../term-form";

export default async function EditTermPage(props: PageProps<"/clients/[id]/terms/[termId]">) {
  await requireUser();
  const params = await props.params;
  const client = await getClientOr404(parseId(params.id));
  const term = await getTermOr404(client.id, parseId(params.termId));
  const clientStores = await db.select().from(stores).where(eq(stores.clientId, client.id));
  return (
    <div>
      <PageHeader title={`Edit term: ${term.name}`} back={{ href: `/clients/${client.id}/setup`, label: "Contract & setup" }} />
      {(await props.searchParams).cannotDelete && (
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          This term has closed statements, so it cannot be deleted. Set an &quot;Effective to&quot; month to end it instead.
        </p>
      )}
      <TermForm clientId={client.id} term={term} clientStores={clientStores} />
    </div>
  );
}
