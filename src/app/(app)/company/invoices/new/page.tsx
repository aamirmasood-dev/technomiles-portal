import { asc, eq } from "drizzle-orm";
import { db, billingPlans, businessSettings, clients } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { CURRENCIES } from "@/lib/labels";
import { fromMinor } from "@/lib/money";
import { addDays, getPkrRate } from "@/lib/invoices/service";
import { PageHeader } from "@/components/page-header";
import { saveNewInvoice } from "../../invoice-actions";
import { InvoiceForm } from "./invoice-form";

export default async function NewInvoicePage(props: PageProps<"/company/invoices/new">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const [clientRows, [settings]] = await Promise.all([
    db.select({ id: clients.id, name: clients.name, currency: clients.currency }).from(clients).where(eq(clients.active, true)).orderBy(asc(clients.name)),
    db.select().from(businessSettings).where(eq(businessSettings.id, 1)),
  ]);
  const [plan] = sp.plan ? await db.select().from(billingPlans).where(eq(billingPlans.id, Number(sp.plan))) : [];
  const preClient = clientRows.find((c) => c.id === (plan?.clientId ?? Number(sp.client))) ?? null;
  const currencies = [...new Set([...CURRENCIES, "PKR"])];
  const rateEntries = await Promise.all(currencies.map(async (c) => [c, await getPkrRate(c, today)] as const));

  const periodText = (from: string, interval: "MONTHLY" | "YEARLY") => {
    const d = new Date(`${from}T00:00:00Z`);
    const end = new Date(d);
    if (interval === "YEARLY") end.setUTCFullYear(end.getUTCFullYear() + 1);
    else end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(end.getUTCDate() - 1);
    const f = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    return `${f(d)} – ${f(end)}`;
  };

  return (
    <div>
      <PageHeader title="New invoice" back={{ href: "/company/invoices", label: "Invoices" }} />
      <InvoiceForm
        action={saveNewInvoice}
        clients={clientRows}
        rates={Object.fromEntries(rateEntries)}
        currencies={currencies}
        defaults={{
          clientId: preClient?.id ?? null,
          currency: plan?.currency ?? preClient?.currency ?? "GBP",
          issueDate: today,
          dueDate: addDays(today, settings?.paymentTermsDays ?? 14),
          lines: plan ? [{ description: `${plan.description} (${periodText(plan.nextDueDate, plan.interval)})`, amount: fromMinor(plan.amount) }] : [],
          planId: plan?.id ?? null,
        }}
      />
    </div>
  );
}
