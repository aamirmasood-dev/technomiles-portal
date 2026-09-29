import { asc, eq } from "drizzle-orm";
import { db, businessSettings, users } from "@/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, Field } from "@/components/action-form";
import { Card, PageHeader } from "@/components/page-header";
import { saveBusinessSettings } from "./actions";

export default async function SettingsPage() {
  await requireUser();
  const [[s], userRows] = await Promise.all([
    db.select().from(businessSettings).where(eq(businessSettings.id, 1)),
    db.select({ name: users.name, email: users.email, lastLoginAt: users.lastLoginAt }).from(users).orderBy(asc(users.name)),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Your business details appear on every invoice." />

      <Card title="Business details">
        <ActionForm action={saveBusinessSettings} submitLabel="Save settings">
          <div className="grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Business name" name="name">
              <input id="name" name="name" className="input" defaultValue={s?.name ?? "Technomiles"} required />
            </Field>
            <Field label="Email" name="email">
              <input id="email" name="email" type="email" className="input" defaultValue={s?.email ?? ""} />
            </Field>
            <Field label="Phone" name="phone">
              <input id="phone" name="phone" className="input" defaultValue={s?.phone ?? ""} />
            </Field>
            <Field label="Website" name="website">
              <input id="website" name="website" className="input" defaultValue={s?.website ?? ""} />
            </Field>
            <Field label="Address" name="address">
              <textarea id="address" name="address" rows={4} className="input" defaultValue={s?.address ?? ""} />
            </Field>
            <Field label="Bank details" name="bankDetails" hint="Account name, bank, account number / IBAN, sort code / SWIFT.">
              <textarea id="bankDetails" name="bankDetails" rows={4} className="input" defaultValue={s?.bankDetails ?? ""} />
            </Field>
            <Field label="Logo" name="logo" hint="PNG, JPG, WEBP or SVG, under 500 KB.">
              <div className="space-y-2">
                {s?.logoDataUrl && (
                  <div className="flex items-center gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.logoDataUrl} alt="Current logo" className="h-12 w-auto rounded border border-gray-200 bg-white p-1" />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="removeLogo" /> Remove
                    </label>
                  </div>
                )}
                <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="text-sm" />
              </div>
            </Field>
            <div />
            <Field label="Invoice number prefix" name="invoicePrefix" hint='e.g. "TM-" gives TM-0001.'>
              <input id="invoicePrefix" name="invoicePrefix" className="input" defaultValue={s?.invoicePrefix ?? "TM-"} />
            </Field>
            <Field label="Next invoice number" name="nextInvoiceNumber">
              <input id="nextInvoiceNumber" name="nextInvoiceNumber" type="number" min={1} className="input" defaultValue={s?.nextInvoiceNumber ?? 1} />
            </Field>
            <Field label="Payment terms (days)" name="paymentTermsDays" hint="Due date = invoice date + this many days.">
              <input id="paymentTermsDays" name="paymentTermsDays" type="number" min={0} className="input" defaultValue={s?.paymentTermsDays ?? 14} />
            </Field>
            <div />
            <Field label="Invoice footer" name="invoiceFooter" hint="Optional note printed at the bottom of each invoice.">
              <textarea id="invoiceFooter" name="invoiceFooter" rows={3} className="input" defaultValue={s?.invoiceFooter ?? ""} />
            </Field>
          </div>
        </ActionForm>
      </Card>

      <Card title="Users">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {userRows.map((u) => (
              <tr key={u.email}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-gray-500">
          Add a user or reset a password from the terminal: <code>npm run create-user -- email@example.com &quot;Name&quot;</code>
        </p>
      </Card>
    </div>
  );
}
