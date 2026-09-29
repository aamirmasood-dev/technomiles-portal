import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ClientForm } from "../client-form";

export default async function NewClientPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Add client" back={{ href: "/clients", label: "Clients" }} />
      <ClientForm />
    </div>
  );
}
