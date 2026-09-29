"use client";

import { useState } from "react";
import type { Platform } from "@/db/schema";

// Fixed platform colours (validated categorical slots 1–4); a platform keeps its colour under any filter.
export const PLATFORM_COLORS: Record<Platform, string> = {
  SHOPIFY: "#2a78d6",
  EBAY: "#eb6834",
  AMAZON: "#1baf7a",
  WALMART: "#eda100",
};
const PLATFORM_NAMES: Record<Platform, string> = { SHOPIFY: "Shopify", EBAY: "eBay", AMAZON: "Amazon", WALMART: "Walmart" };

type Bucket = { key: string; byPlatform: Partial<Record<Platform, number>>; total: number };

// Round tick step (1, 2 or 5 × 10^n in major units) giving about four gridlines.
function niceTicks(maxMinor: number): number[] {
  const max = Math.max(maxMinor, 100);
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw)!;
  const stepMinor = Math.max(100, Math.round(step / 100) * 100);
  const n = Math.ceil(max / stepMinor);
  return Array.from({ length: n + 1 }, (_, i) => i * stepMinor);
}

function bucketLabel(key: string, granularity: "day" | "month", short: boolean) {
  const d = new Date(granularity === "day" ? `${key}T00:00:00Z` : `${key}-01T00:00:00Z`);
  return granularity === "day"
    ? d.toLocaleDateString("en-GB", { day: "numeric", month: short ? undefined : "short", timeZone: "UTC" })
    : d.toLocaleDateString("en-GB", { month: "short", year: short ? "2-digit" : "numeric", timeZone: "UTC" });
}

export function SalesChart({
  currency,
  buckets,
  platforms,
  granularity,
}: {
  currency: string;
  buckets: Bucket[];
  platforms: Platform[];
  granularity: "day" | "month";
}) {
  const [hover, setHover] = useState<number | null>(null);
  const fmt = (minor: number, compact = false) =>
    new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-GB", {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : 2,
    }).format((minor || 0) / 100);

  const W = 760;
  const H = 260;
  const pad = { top: 12, right: 8, bottom: 26, left: 56 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const ticks = niceTicks(Math.max(0, ...buckets.map((b) => b.total)));
  const max = ticks.at(-1)!;
  const slot = plotW / Math.max(1, buckets.length);
  const barW = Math.max(3, Math.min(40, slot * 0.62));
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const labelEvery = Math.ceil(buckets.length / 12);
  const GAP = 2;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Sales by marketplace in ${currency}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-gray-500 text-[11px] tabular-nums">
              {fmt(t, true)}
            </text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const cx = pad.left + slot * i + slot / 2;
          const x = cx - barW / 2;
          const segs = platforms.filter((p) => (b.byPlatform[p] ?? 0) > 0);
          let acc = 0;
          return (
            <g key={b.key}>
              {segs.map((p, si) => {
                const v = b.byPlatform[p]!;
                const y0 = y(acc);
                acc += v;
                const y1 = y(acc);
                const top = si === segs.length - 1;
                const h = Math.max(0, y0 - y1 - (si > 0 ? GAP : 0));
                const yTop = y1;
                const r = top ? Math.min(4, h, barW / 2) : 0;
                const bottom = yTop + h;
                const d = `M${x},${bottom} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${bottom} Z`;
                return <path key={p} d={d} fill={PLATFORM_COLORS[p]} opacity={hover == null || hover === i ? 1 : 0.45} />;
              })}
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" className="fill-gray-500 text-[11px]">
                  {bucketLabel(b.key, granularity, true)}
                </text>
              )}
              <rect
                x={pad.left + slot * i}
                y={pad.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
        <line x1={pad.left} x2={W - pad.right} y1={y(0)} y2={y(0)} stroke="#9ca3af" strokeWidth={1} />
      </svg>

      {hover != null && buckets[hover] && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${((pad.left + slot * hover + slot / 2) / W) * 100}%`,
            transform: hover > buckets.length / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
          }}
        >
          <p className="mb-1 font-medium text-gray-900">{bucketLabel(buckets[hover].key, granularity, false)}</p>
          {platforms.map((p) => (
            <p key={p} className="flex items-center justify-between gap-4 text-gray-700">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PLATFORM_COLORS[p] }} />
                {PLATFORM_NAMES[p]}
              </span>
              <span className="tabular-nums">{fmt(buckets[hover].byPlatform[p] ?? 0)}</span>
            </p>
          ))}
          <p className="mt-1 flex justify-between gap-4 border-t border-gray-100 pt-1 font-medium text-gray-900">
            <span>Total</span>
            <span className="tabular-nums">{fmt(buckets[hover].total)}</span>
          </p>
        </div>
      )}

      {platforms.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600">
          {platforms.map((p) => (
            <span key={p} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PLATFORM_COLORS[p] }} />
              {PLATFORM_NAMES[p]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
