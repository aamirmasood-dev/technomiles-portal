"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { periodLabel, shiftPeriod } from "@/lib/period";

// `marketplace`: only for store-management clients (service and project clients are billed by invoice only).
const TABS = [
  { path: "", label: "Overview", monthly: true, staff: false, marketplace: true },
  { path: "/orders", label: "Orders", monthly: true, staff: true, marketplace: true },
  { path: "/expenses", label: "Expenses", monthly: true, staff: true, marketplace: true },
  { path: "/statement", label: "Profit sheet", monthly: true, staff: false, marketplace: true },
  { path: "/transactions", label: "Transactions", monthly: true, staff: false, marketplace: true },
  { path: "/invoices", label: "Invoices & payments", monthly: false, staff: false, marketplace: false },
  { path: "/stores", label: "Stores", monthly: false, staff: true, marketplace: true },
  { path: "/setup", label: "Contract & setup", monthly: false, staff: false, marketplace: false },
];

export function ClientTabs({
  clientId,
  defaultPeriod,
  admin,
  marketplace,
}: {
  clientId: number;
  defaultPeriod: string;
  admin: boolean;
  marketplace: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const base = `/clients/${clientId}`;
  const month = searchParams.get("month") ?? defaultPeriod;
  const rest = pathname.slice(base.length);
  const tabs = TABS.filter((t) => (admin || t.staff) && (marketplace || !t.marketplace));
  const active = tabs.filter((t) => (t.path === "" ? rest === "" : rest.startsWith(t.path))).at(-1) ?? null;
  const qs = searchParams.get("month") ? `?month=${month}` : "";
  const months = Array.from({ length: 18 }, (_, i) => shiftPeriod(defaultPeriod, 2 - i));
  if (!months.includes(month)) months.unshift(month);

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 print:hidden">
      <nav className="-mb-px flex flex-wrap gap-1">
        {tabs.map((t) => (
          <Link
            key={t.path}
            href={`${base}${t.path}${t.monthly ? qs : ""}`}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              active?.path === t.path ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {active?.monthly && rest === active.path && (
        <label className="mb-2 flex items-center gap-2 text-sm text-gray-600">
          Month
          <select
            className="input w-44"
            value={month}
            onChange={(e) => {
              const p = new URLSearchParams(searchParams);
              p.set("month", e.target.value);
              router.push(`${pathname}?${p.toString()}`);
            }}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {periodLabel(m)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
