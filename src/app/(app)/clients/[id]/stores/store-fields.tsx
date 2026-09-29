"use client";

import { useState } from "react";
import { Field } from "@/components/action-form";
import { PLATFORMS, type Platform } from "@/db/schema";
import { AMAZON_MARKETPLACES, CURRENCIES, PLATFORM_LABELS, REGION_OPTIONS } from "@/lib/labels";

type Defaults = {
  platform: Platform;
  name: string;
  currency: string;
  region: string | null;
  marketplaceId: string | null;
  accountRef: string | null;
  syncStartDate: string;
  active: boolean;
};

const ACCOUNT_HINT: Record<Platform, string> = {
  SHOPIFY: "Shop domain, e.g. kensingtonsbedding.myshopify.com",
  EBAY: "eBay seller username",
  AMAZON: "Seller name or merchant ID (for reference)",
  WALMART: "Seller ID (for reference)",
};

export function StoreFields({ defaults, isEdit }: { defaults: Defaults; isEdit: boolean }) {
  const [platform, setPlatform] = useState<Platform>(defaults.platform);
  const regions = REGION_OPTIONS[platform];

  return (
    <div className="grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
      <Field label="Platform" name="platform" hint={isEdit ? "Cannot be changed after the store is created." : undefined}>
        {isEdit ? (
          <>
            <input type="hidden" name="platform" value={platform} />
            <input className="input bg-gray-50" value={PLATFORM_LABELS[platform]} disabled />
          </>
        ) : (
          <select
            id="platform"
            name="platform"
            className="input"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Store name" name="name">
        <input id="name" name="name" className="input" defaultValue={defaults.name} required />
      </Field>
      <Field label="Account" name="accountRef" hint={ACCOUNT_HINT[platform]}>
        <input id="accountRef" name="accountRef" className="input" defaultValue={defaults.accountRef ?? ""} />
      </Field>
      <Field label="Currency" name="currency" hint="The currency the platform pays out in.">
        <select id="currency" name="currency" className="input" defaultValue={defaults.currency}>
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      {regions.length > 0 && (
        <Field label={platform === "AMAZON" ? "Region" : "Marketplace"} name="region">
          <select id="region" name="region" className="input" defaultValue={defaults.region ?? ""}>
            <option value="">Select…</option>
            {regions.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      {platform === "AMAZON" && (
        <Field label="Amazon marketplace" name="marketplaceId">
          <select id="marketplaceId" name="marketplaceId" className="input" defaultValue={defaults.marketplaceId ?? ""}>
            <option value="">Select…</option>
            {AMAZON_MARKETPLACES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Sync from date" name="syncStartDate" hint="Orders and fees before this date are ignored.">
        <input id="syncStartDate" name="syncStartDate" type="date" className="input" defaultValue={defaults.syncStartDate} required />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={defaults.active} /> Active (included in daily sync)
      </label>
    </div>
  );
}
