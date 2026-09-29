import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, assets, ASSET_CATEGORIES, ASSET_REMOVAL_REASONS } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { companyLookups } from "@/lib/company";
import { ASSET_CATEGORY_LABELS, ASSET_CONDITION_LABELS, ASSET_REMOVAL_LABELS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { ActionForm } from "@/components/action-form";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { Card } from "@/components/page-header";
import { RowForm } from "../payroll/row-forms";
import { removeAsset, restoreAsset, saveAsset } from "../asset-actions";
import { AssetFields } from "./asset-fields";

const pkr = (n: number) => formatMoney(n, "PKR");

export default async function AssetsPage(props: PageProps<"/company/assets">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const showRemoved = sp.show === "removed";
  const [rows, lookups] = await Promise.all([db.select().from(assets).orderBy(asc(assets.category), asc(assets.name)), companyLookups()]);
  const inUse = rows.filter((a) => !a.removedDate);
  const shown = showRemoved ? rows.filter((a) => a.removedDate) : inUse;
  const today = new Date().toISOString().slice(0, 10);
  const payers = [
    ...lookups.accounts.map((a) => ({ value: `account:${a.id}`, label: `Technomiles: ${a.name}` })),
    ...lookups.partners.map((p) => ({ value: `partner:${p.id}`, label: `${p.name} (personally)` })),
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Total value in use</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{pkr(inUse.reduce((a, x) => a + x.unitPrice * x.quantity, 0))}</p>
        </div>
        {ASSET_CATEGORIES.map((c) => {
          const items = inUse.filter((a) => a.category === c);
          return (
            <div key={c} className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500">{ASSET_CATEGORY_LABELS[c]}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{items.reduce((a, x) => a + x.quantity, 0)} items</p>
              <p className="text-xs text-gray-500 tabular-nums">{pkr(items.reduce((a, x) => a + x.unitPrice * x.quantity, 0))}</p>
            </div>
          );
        })}
      </div>

      <Card
        title={showRemoved ? "Removed assets" : "Assets in use"}
        actions={
          <AutoSubmitForm>
            <select name="show" defaultValue={showRemoved ? "removed" : ""} className="input w-40 py-1">
              <option value="">In use</option>
              <option value="removed">Removed</option>
            </select>
          </AutoSubmitForm>
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Price each</th>
              <th className="text-right">Value</th>
              <th>Bought</th>
              <th>Condition</th>
              <th>Location</th>
              <th>{showRemoved ? "Removed" : ""}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id} className="align-top">
                <td>
                  <Link href={`/company/assets/${a.id}`} className="link">
                    {a.name}
                  </Link>
                  {a.serialNumber && <span className="block text-xs text-gray-500">{a.serialNumber}</span>}
                </td>
                <td>{ASSET_CATEGORY_LABELS[a.category]}</td>
                <td className="text-right tabular-nums">{a.quantity}</td>
                <td className="text-right tabular-nums">{pkr(a.unitPrice)}</td>
                <td className="text-right tabular-nums">{pkr(a.unitPrice * a.quantity)}</td>
                <td>{a.purchaseDate ?? "—"}</td>
                <td>{ASSET_CONDITION_LABELS[a.condition]}</td>
                <td>{a.location ?? "—"}</td>
                <td>
                  {a.removedDate ? (
                    <div className="text-sm">
                      {a.removedDate} · {a.removalReason && ASSET_REMOVAL_LABELS[a.removalReason]}
                      {a.removalValue ? ` · ${pkr(a.removalValue)}` : ""}
                      <form action={restoreAsset.bind(null, a.id)}>
                        <button className="link text-xs">Put back in use</button>
                      </form>
                    </div>
                  ) : (
                    <RowForm action={removeAsset.bind(null, a.id)} button="Remove">
                      <input type="date" name="removedDate" defaultValue={today} className="input w-36 py-1" />
                      <select name="removalReason" className="input w-36 py-1">
                        {ASSET_REMOVAL_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {ASSET_REMOVAL_LABELS[r]}
                          </option>
                        ))}
                      </select>
                      <input name="removalValue" placeholder="Sold for" inputMode="decimal" className="input w-24 py-1" />
                    </RowForm>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-gray-500">
                  {showRemoved ? "Nothing removed." : "No assets yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="Add an asset">
        <ActionForm action={saveAsset.bind(null, null)} submitLabel="Add asset">
          <AssetFields
            payers={payers}
            defaults={{ name: "", category: "FURNITURE", quantity: 1, purchaseDate: null, unitPrice: 0, condition: "GOOD", location: null, serialNumber: null, notes: null }}
          />
        </ActionForm>
      </Card>
    </div>
  );
}
