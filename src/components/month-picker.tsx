"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { periodLabel, shiftPeriod } from "@/lib/period";

export function MonthPicker({ period, around }: { period: string; around: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const months = Array.from({ length: 18 }, (_, i) => shiftPeriod(around, 2 - i));
  if (!months.includes(period)) months.unshift(period);
  return (
    <label className="flex items-center gap-2 text-sm text-gray-600">
      Month
      <select
        className="input w-44"
        value={period}
        onChange={(e) => {
          const p = new URLSearchParams(sp);
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
  );
}
