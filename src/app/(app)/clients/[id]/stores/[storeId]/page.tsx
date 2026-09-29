import { requireUser } from "@/lib/auth";
import { getClientOr404, getStoreOr404, parseId } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { saveStore } from "../../../actions";
import { StoreFields } from "../store-fields";

export default async function EditStorePage(props: PageProps<"/clients/[id]/stores/[storeId]">) {
  await requireUser();
  const params = await props.params;
  const client = await getClientOr404(parseId(params.id));
  const store = await getStoreOr404(client.id, parseId(params.storeId));
  return (
    <div>
      <PageHeader title={`Edit ${store.name}`} back={{ href: `/clients/${client.id}/stores`, label: "Stores" }} />
      <ActionForm action={saveStore.bind(null, client.id, store.id)} submitLabel="Save store">
        <StoreFields isEdit defaults={store} />
      </ActionForm>
    </div>
  );
}
