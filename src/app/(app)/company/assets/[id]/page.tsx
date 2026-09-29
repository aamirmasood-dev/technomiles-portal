import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, assets } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { parseId } from "@/lib/queries";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { saveAsset } from "../../asset-actions";
import { AssetFields } from "../asset-fields";

export default async function EditAssetPage(props: PageProps<"/company/assets/[id]">) {
  await requireAdmin();
  const [a] = await db.select().from(assets).where(eq(assets.id, parseId((await props.params).id)));
  if (!a) notFound();
  return (
    <div>
      <PageHeader title={`Edit ${a.name}`} back={{ href: "/company/assets", label: "Assets" }} />
      <div className="max-w-4xl">
        <ActionForm action={saveAsset.bind(null, a.id)} submitLabel="Save">
          <AssetFields defaults={a} />
        </ActionForm>
      </div>
    </div>
  );
}
