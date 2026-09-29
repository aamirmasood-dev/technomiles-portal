import { Suspense } from "react";
import { isAdmin, requireUser } from "@/lib/auth";
import { getClientOr404, parseId } from "@/lib/queries";
import { currentPeriod, shiftPeriod } from "@/lib/period";
import { ClientTabs } from "@/components/client-tabs";
import { Badge } from "@/components/page-header";

export default async function ClientLayout(props: LayoutProps<"/clients/[id]">) {
  const user = await requireUser();
  const client = await getClientOr404(parseId((await props.params).id));
  const defaultPeriod = shiftPeriod(currentPeriod(client.timezone), -1);

  return (
    <div>
      <div className="mb-4 print:hidden">
        <h1 className="text-2xl font-semibold">
          {client.name} {!client.active && <Badge>Inactive</Badge>}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {client.currency} · {client.timezone}
          {client.contactName && <> · {client.contactName}</>}
        </p>
      </div>
      <Suspense>
        <ClientTabs clientId={client.id} defaultPeriod={defaultPeriod} admin={isAdmin(user)} marketplace={client.clientType === "MARKETPLACE"} />
      </Suspense>
      {props.children}
    </div>
  );
}
