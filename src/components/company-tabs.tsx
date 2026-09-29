"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/company", label: "Overview" },
  { href: "/company/invoices", label: "Invoices" },
  { href: "/company/payments", label: "Payments received" },
  { href: "/company/expenses", label: "Expenses" },
  { href: "/company/payroll", label: "Payroll" },
  { href: "/company/partners", label: "Partners" },
  { href: "/company/assets", label: "Assets" },
];

export function CompanyTabs() {
  const pathname = usePathname();
  const active = TABS.filter((t) => (t.href === "/company" ? pathname === "/company" : pathname.startsWith(t.href))).at(-1);
  return (
    <nav className="-mb-px mb-6 flex flex-wrap gap-1 border-b border-gray-200 print:hidden">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${
            active?.href === t.href ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
