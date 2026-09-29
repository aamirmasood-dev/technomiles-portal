import { requireUser } from "@/lib/auth";
import { getClientOr404, parseId } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { saveStore } from "../../../actions";
import { StoreFields } from "../store-fields";

export default async function NewStorePage(props: PageProps<"/clients/[id]/stores/new">) {
  await requireUser();
  const client = await getClientOr404(parseId((await props.params).id));
  return (
    <div>
      <PageHeader
        title="Add store"
        subtitle="Store connection details (API keys, eBay sign-in) are added once the connectors are built."
        back={{ href: `/clients/${client.id}/stores`, label: "Stores" }}
      />
      <ActionForm action={saveStore.bind(null, client.id, null)} submitLabel="Add store">
        <StoreFields
          isEdit={false}
          defaults={{
            platform: "SHOPIFY",
            name: "",
            currency: client.currency,
            region: null,
            marketplaceId: null,
            accountRef: null,
            syncStartDate: "2026-10-01",
            active: true,
          }}
        />
      </ActionForm>
    </div>
  );
}
