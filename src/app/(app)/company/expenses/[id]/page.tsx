import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, companyExpenses } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { companyLookups } from "@/lib/company";
import { parseId } from "@/lib/queries";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { saveCompanyExpense } from "../../expense-actions";
import { CompanyExpenseFields } from "../expense-fields";

export default async function EditCompanyExpensePage(props: PageProps<"/company/expenses/[id]">) {
  await requireAdmin();
  const [e] = await db.select().from(companyExpenses).where(eq(companyExpenses.id, parseId((await props.params).id)));
  if (!e) notFound();
  const lookups = await companyLookups();
  return (
    <div>
      <PageHeader title="Edit company expense" back={{ href: `/company/expenses?month=${e.expenseDate.slice(0, 7)}`, label: "Expenses" }} />
      <div className="max-w-4xl">
        <ActionForm action={saveCompanyExpense.bind(null, e.id)} submitLabel="Save expense">
          <CompanyExpenseFields
            accounts={lookups.accounts}
            partners={lookups.partners}
            defaults={{ ...e, paidBy: e.paidByPartnerId ? `partner:${e.paidByPartnerId}` : `account:${e.accountId}` }}
          />
        </ActionForm>
      </div>
    </div>
  );
}
