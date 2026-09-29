import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ClientForm } from "../client-form";

export default async function NewClientPage() {
  await requireUser();
  return (
    <div>
      <PageHeader title="Add client" back={{ href: "/clients", label: "Clients" }} />
      <ClientForm />
    </div>
  );
}
