import { requireAdmin } from "@/lib/auth";
import { getClientOr404, parseId } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { ClientForm } from "../../client-form";

export default async function EditClientPage(props: PageProps<"/clients/[id]/edit">) {
  await requireAdmin();
  const client = await getClientOr404(parseId((await props.params).id));
  return (
    <div>
      <PageHeader title="Edit client details" back={{ href: `/clients/${client.id}/setup`, label: "Contract & setup" }} />
      <ClientForm client={client} />
    </div>
  );
}
