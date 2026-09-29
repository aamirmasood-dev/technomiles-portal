import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, manualExpenses, shippingProviders, stores } from "@/db";
import { requireUser } from "@/lib/auth";
import { resolvePeriod } from "@/lib/filters";
import { getClientOr404, parseId } from "@/lib/queries";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { saveExpense } from "../actions";
import { ExpenseFields } from "../expense-fields";

export default async function EditExpensePage(props: PageProps<"/clients/[id]/expenses/[expenseId]">) {
  await requireUser();
  const params = await props.params;
  const client = await getClientOr404(parseId(params.id));
  const [expense] = await db
    .select()
    .from(manualExpenses)
    .where(and(eq(manualExpenses.id, parseId(params.expenseId)), eq(manualExpenses.clientId, client.id)));
  if (!expense) notFound();
  const period = resolvePeriod(await props.searchParams, client.timezone);
  const returnTo = `/clients/${client.id}/expenses?month=${period}`;
  const [storeRows, providers] = await Promise.all([
    db.select().from(stores).where(eq(stores.clientId, client.id)).orderBy(asc(stores.name)),
    db.select().from(shippingProviders).where(eq(shippingProviders.clientId, client.id)),
  ]);

  return (
    <div>
      <PageHeader title="Edit expense" back={{ href: returnTo, label: "Expenses" }} />
      <div className="max-w-2xl">
        <ActionForm action={saveExpense.bind(null, client.id, expense.id, returnTo)} submitLabel="Save expense">
          <ExpenseFields stores={storeRows} providers={providers} defaults={expense} />
        </ActionForm>
      </div>
    </div>
  );
}
