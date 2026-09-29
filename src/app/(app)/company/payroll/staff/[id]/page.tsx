import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, clients, staffMembers, stores } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { fromMinor } from "@/lib/money";
import { parseId } from "@/lib/queries";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { saveStaff } from "../../../payroll-actions";
import { StaffFields } from "../staff-fields";

export default async function StaffPage(props: PageProps<"/company/payroll/staff/[id]">) {
  await requireAdmin();
  const raw = (await props.params).id;
  const isNew = raw === "new";
  const [s] = isNew ? [] : await db.select().from(staffMembers).where(eq(staffMembers.id, parseId(raw)));
  if (!isNew && !s) notFound();
  const [clientRows, storeRows] = await Promise.all([
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
    db.select({ id: stores.id, clientId: stores.clientId, name: stores.name, platform: stores.platform }).from(stores).orderBy(asc(stores.name)),
  ]);
  return (
    <div>
      <PageHeader title={s ? `Edit ${s.name}` : "Add staff member"} back={{ href: "/company/payroll", label: "Payroll" }} />
      <ActionForm action={saveStaff.bind(null, s?.id ?? null)} submitLabel="Save">
        <StaffFields
          clients={clientRows}
          stores={storeRows}
          defaults={{
            name: s?.name ?? "",
            jobTitle: s?.jobTitle ?? null,
            payType: s?.payType ?? "SALARY",
            monthlySalary: s?.monthlySalary != null ? fromMinor(s.monthlySalary) : "",
            commissionRate: s?.commissionBps != null ? String(s.commissionBps / 100) : "",
            commissionClientId: s?.commissionClientId ?? null,
            commissionStoreIds: s?.commissionStoreIds ?? [],
            startDate: s?.startDate ?? null,
            active: s?.active ?? true,
            notes: s?.notes ?? null,
          }}
        />
      </ActionForm>
    </div>
  );
}
