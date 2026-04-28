"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { SpikeMark } from "@/components/brand/SpikeMark";
import { fmtTwd, mockDays, mockPlans, type MockPlan } from "@/lib/mock-schedule";
import { mockTrips } from "@/lib/mock-trips";
import { PriceWithLocal } from "@/components/common/PriceWithLocal";
import { defaultCurrencySettings, formatCurrency, mockRates } from "@/lib/currency";
import { CompareScopeBar, type CompareScope } from "@/components/compare/CompareScopeBar";

export default function ComparePage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = use(params);
  const trip = mockTrips.find((t) => t.id === tripId) ?? mockTrips[0];
  const [scope, setScope] = useState<CompareScope>({ kind: "trip" });

  // Derive scope-scaled metrics. For demo we scale linearly by selected day count.
  const dayCount = mockDays.length;
  const scopeDays = useMemo(() => {
    if (scope.kind === "trip") return dayCount;
    if (scope.kind === "day") return 1;
    const s = mockDays.find((d) => d.id === scope.startDayId);
    const e = mockDays.find((d) => d.id === scope.endDayId);
    if (!s || !e) return dayCount;
    return Math.max(1, e.dayIndex - s.dayIndex + 1);
  }, [scope, dayCount]);
  const scopeFraction = scopeDays / dayCount;

  // Scope-adjusted snapshot of each plan
  const scopedPlans: ScopedPlan[] = useMemo(
    () =>
      mockPlans.map((p) => ({
        ...p,
        scopedTotalCost: Math.round(p.totalCost * scopeFraction),
        scopedDistanceKm: Math.round(p.totalDistanceKm * scopeFraction),
        scopedDays: scopeDays,
        scopedBreakdown: {
          food: Math.round(p.costBreakdown.food * scopeFraction),
          lodging: Math.round(p.costBreakdown.lodging * scopeFraction),
          transport: Math.round(p.costBreakdown.transport * scopeFraction),
          ticket: Math.round(p.costBreakdown.ticket * scopeFraction),
          misc: Math.round(p.costBreakdown.misc * scopeFraction),
        },
      })),
    [scopeFraction, scopeDays],
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* Compact header */}
      <header className="sticky top-0 z-40 border-b border-hairline-soft bg-canvas/95 backdrop-blur">
        <div className="flex h-14 items-center gap-md px-lg">
          <Link href="/" className="flex items-center gap-xs text-muted hover:text-ink">
            <SpikeMark size={14} />
            <span className="text-caption">旅遊規劃</span>
          </Link>
          <span className="text-muted-soft">/</span>
          <Link href={`/trips/${trip.id}`} className="text-caption text-muted hover:text-ink">
            {trip.title}
          </Link>
          <span className="text-muted-soft">/</span>
          <span className="text-title-sm text-ink">方案對比</span>

          <div className="ml-auto flex items-center gap-xs">
            <Link
              href={`/trips/${trip.id}`}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-caption text-ink hover:border-ink"
            >
              ← 返回編輯
            </Link>
            <button className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-caption text-on-primary hover:bg-primary-active">
              + 複製新方案
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-lg py-lg">
        {/* Title */}
        <div className="mb-md flex items-end justify-between">
          <div>
            <p className="text-caption-uppercase text-muted-soft">COMPARE PLANS</p>
            <h1 className="mt-xxs display-md text-ink">並列三個方案，做出選擇</h1>
            <p className="mt-xs text-body-md text-muted">
              {trip.title} · 5/12–18 · 7 天 · {mockPlans.length} 個方案
            </p>
          </div>
          <div className="flex items-center gap-xs">
            <span className="text-caption text-muted">並列顯示</span>
            <div className="flex items-center gap-px rounded-md border border-hairline bg-canvas p-0.5">
              <button className="rounded-sm px-2.5 py-1 text-caption text-muted hover:text-ink">2 欄</button>
              <button className="rounded-sm bg-surface-card px-2.5 py-1 text-caption text-ink">3 欄</button>
            </div>
          </div>
        </div>

        {/* Scope selector */}
        <div className="mb-lg">
          <CompareScopeBar days={mockDays} scope={scope} onChange={setScope} />
        </div>

        {/* Compare grid */}
        <div className="grid gap-md md:grid-cols-3">
          {scopedPlans.map((plan, idx) => (
            <PlanColumn key={plan.id} plan={plan} index={idx} />
          ))}
        </div>

        {/* Diff table */}
        <section className="mt-xl">
          <h2 className="mb-md text-title-md text-ink">指標總覽</h2>
          <div className="overflow-hidden rounded-lg border border-hairline">
            <table className="w-full text-body-sm">
              <thead className="bg-surface-soft text-caption text-muted">
                <tr>
                  <th className="px-md py-sm text-left">指標</th>
                  {mockPlans.map((p) => (
                    <th key={p.id} className="px-md py-sm text-right">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-soft bg-canvas">
                <PriceRow
                  label="總花費"
                  amounts={scopedPlans.map((p) => p.scopedTotalCost)}
                  highlightLowest
                />
                <TextRow label="總距離" values={scopedPlans.map((p) => `${p.scopedDistanceKm} km`)} />
                <TextRow label="天數" values={scopedPlans.map((p) => `${p.scopedDays} 天`)} />
                <TextRow label="節奏" values={scopedPlans.map((p) => p.pace)} />
                <PriceRow label="食" amounts={scopedPlans.map((p) => p.scopedBreakdown.food)} />
                <PriceRow label="住" amounts={scopedPlans.map((p) => p.scopedBreakdown.lodging)} />
                <PriceRow label="行" amounts={scopedPlans.map((p) => p.scopedBreakdown.transport)} />
                <PriceRow label="票卷" amounts={scopedPlans.map((p) => p.scopedBreakdown.ticket)} />
                <PriceRow label="其他" amounts={scopedPlans.map((p) => p.scopedBreakdown.misc)} />
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-md text-center text-caption text-muted-soft">
          示意資料 · Phase 3 接真資料後可即時對比
        </p>
      </main>
    </div>
  );
}

type ScopedPlan = MockPlan & {
  scopedTotalCost: number;
  scopedDistanceKm: number;
  scopedDays: number;
  scopedBreakdown: { food: number; lodging: number; transport: number; ticket: number; misc: number };
};

function PlanColumn({ plan, index }: { plan: ScopedPlan; index: number }) {
  const accentBars = ["bg-brand-accent", "bg-badge-violet", "bg-badge-orange"];
  const accentBarsSoft = ["bg-brand-accent/60", "bg-badge-violet/60", "bg-badge-orange/60"];
  const accent = accentBars[index] ?? "bg-muted";
  const accentSoft = accentBarsSoft[index] ?? "bg-muted/60";

  // Mini timeline mock — vary the bars per plan
  const timelineSeed = [
    [3, 4, 5, 4, 6, 5, 4],
    [2, 3, 4, 3, 4, 4, 3],
    [4, 5, 6, 5, 7, 6, 5],
  ][index] ?? [3, 3, 3, 3, 3, 3, 3];

  return (
    <div
      className={`flex flex-col rounded-lg border bg-canvas ${
        plan.isDefault ? "border-primary shadow-soft-elevation" : "border-hairline"
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-sm border-b border-hairline-soft p-md">
        <span className={`mt-1 h-3 w-1 rounded-full ${accent}`} />
        <div className="flex-1">
          <div className="flex items-center gap-xs">
            <h3 className="text-title-md text-ink">{plan.name}</h3>
            {plan.isDefault && (
              <span className="rounded-pill bg-primary/15 px-2 py-0.5 text-caption text-primary-active">
                使用中
              </span>
            )}
          </div>
          <p className="mt-xxs text-caption text-muted">{plan.description}</p>
        </div>
      </div>

      {/* Cost */}
      <div className="border-b border-hairline-soft p-md">
        <p className="text-caption text-muted">範圍內試算</p>
        <div className="mt-xxs">
          <PriceWithLocal amount={plan.scopedTotalCost} size="xl" align="left" />
        </div>
        <div className="mt-sm flex flex-wrap items-center gap-xs text-caption text-muted">
          <span className="rounded-pill bg-surface-card px-2 py-0.5 text-ink">{plan.pace}</span>
          <span>·</span>
          <span>{plan.scopedDistanceKm} km</span>
          <span>·</span>
          <span>{plan.scopedDays} 天</span>
        </div>
      </div>

      {/* Mini timeline (7 days) */}
      <div className="border-b border-hairline-soft p-md">
        <p className="text-caption-uppercase text-muted-soft">每日強度</p>
        <div className="mt-xs flex h-16 items-end gap-1">
          {timelineSeed.map((h, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-xs">
              <div
                className={`w-full rounded-sm ${accentSoft}`}
                style={{ height: `${h * 10}px` }}
              />
              <span className="font-mono text-[10px] text-muted-soft">D{i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Mini map */}
      <div className="border-b border-hairline-soft p-md">
        <p className="text-caption-uppercase text-muted-soft">路線輪廓</p>
        <div className="mt-xs aspect-video overflow-hidden rounded-md bg-surface-soft">
          <MiniMap variant={index} />
        </div>
      </div>

      {/* Cost breakdown bar */}
      <div className="flex-1 p-md">
        <p className="text-caption-uppercase text-muted-soft">費用分布</p>
        <div className="mt-xs flex h-2 overflow-hidden rounded-full">
          <CostSeg w={plan.scopedBreakdown.lodging / Math.max(1, plan.scopedTotalCost)} cls="bg-badge-emerald" />
          <CostSeg w={plan.scopedBreakdown.food / Math.max(1, plan.scopedTotalCost)} cls="bg-badge-pink" />
          <CostSeg w={plan.scopedBreakdown.transport / Math.max(1, plan.scopedTotalCost)} cls="bg-badge-orange" />
          <CostSeg w={plan.scopedBreakdown.ticket / Math.max(1, plan.scopedTotalCost)} cls="bg-warning" />
          <CostSeg w={plan.scopedBreakdown.misc / Math.max(1, plan.scopedTotalCost)} cls="bg-muted" />
        </div>
        <ul className="mt-sm space-y-1 text-caption text-muted">
          <BreakItem cls="bg-badge-emerald" label="住宿" amount={plan.scopedBreakdown.lodging} />
          <BreakItem cls="bg-badge-pink" label="餐飲" amount={plan.scopedBreakdown.food} />
          <BreakItem cls="bg-badge-orange" label="交通" amount={plan.scopedBreakdown.transport} />
          <BreakItem cls="bg-warning" label="票卷" amount={plan.scopedBreakdown.ticket} />
          <BreakItem cls="bg-muted" label="其他" amount={plan.scopedBreakdown.misc} />
        </ul>
      </div>

      {/* Actions */}
      <div className="border-t border-hairline-soft p-md">
        {plan.isDefault ? (
          <button className="w-full rounded-md bg-surface-card py-2 text-caption text-muted">
            目前使用此方案
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-xs">
            <button className="rounded-md border border-hairline bg-canvas py-2 text-caption text-ink hover:border-ink">
              查看細節
            </button>
            <button className="rounded-md bg-ink py-2 text-caption text-on-dark hover:bg-body-strong">
              切換到此方案
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TextRow({ label, values }: { label: string; values: string[] }) {
  return (
    <tr>
      <td className="px-md py-sm text-muted">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="px-md py-sm text-right font-mono text-ink">
          {v}
        </td>
      ))}
    </tr>
  );
}

function PriceRow({
  label,
  amounts,
  highlightLowest = false,
}: {
  label: string;
  amounts: number[];
  highlightLowest?: boolean;
}) {
  const min = highlightLowest ? Math.min(...amounts) : -1;
  return (
    <tr>
      <td className="px-md py-sm text-muted">{label}</td>
      {amounts.map((a, i) => {
        const isHi = highlightLowest && a === min;
        return (
          <td key={i} className="px-md py-sm">
            <div className={`flex flex-col items-end gap-px ${isHi ? "text-success" : "text-ink"}`}>
              <span className="font-mono">{fmtTwd(a)}</span>
              <span className="font-mono text-[10px] text-muted-soft">
                {formatCurrency(
                  (a / (mockRates.rates[defaultCurrencySettings.primary] ?? 1)) *
                    (mockRates.rates[defaultCurrencySettings.local] ?? 0),
                  defaultCurrencySettings.local,
                )}
              </span>
              {isHi && <span className="text-[10px]">↓ 最低</span>}
            </div>
          </td>
        );
      })}
    </tr>
  );
}

function CostSeg({ w, cls }: { w: number; cls: string }) {
  return <div style={{ width: `${w * 100}%` }} className={cls} />;
}

function BreakItem({ cls, label, amount }: { cls: string; label: string; amount: number }) {
  return (
    <li className="flex items-center gap-xs">
      <span className={`h-2 w-2 rounded-full ${cls}`} />
      <span className="flex-1">{label}</span>
      <span className="font-mono text-ink">{fmtTwd(amount)}</span>
      <span className="font-mono text-[10px] text-muted-soft">
        {formatCurrency(
          (amount / (mockRates.rates[defaultCurrencySettings.primary] ?? 1)) *
            (mockRates.rates[defaultCurrencySettings.local] ?? 0),
          defaultCurrencySettings.local,
        )}
      </span>
    </li>
  );
}

// Lightweight stylised mini-map — different polyline shape per plan
function MiniMap({ variant }: { variant: number }) {
  const paths = [
    "M 30 110 Q 80 60 130 80 T 230 50 Q 280 40 270 100 T 200 130", // plan A — covers more
    "M 50 100 Q 100 80 150 90 T 250 95",                              // plan B — minimal
    "M 20 130 L 80 100 L 130 50 L 200 80 L 270 60 L 250 130",         // plan C — angular
  ];
  const colors = ["#3b82f6", "#8b5cf6", "#fb923c"]; // brand-accent / violet / orange
  const points = [
    [
      [30, 110], [80, 70], [130, 80], [180, 60], [230, 50], [270, 100], [200, 130],
    ],
    [
      [50, 100], [100, 85], [150, 90], [200, 92], [250, 95],
    ],
    [
      [20, 130], [80, 100], [130, 50], [200, 80], [270, 60], [250, 130],
    ],
  ];
  return (
    <svg viewBox="0 0 300 170" className="h-full w-full">
      <rect width="300" height="170" fill="#f5f0e8" />
      <defs>
        <pattern id={`mp-${variant}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#f5f0e8" />
          <circle cx="2" cy="2" r="0.4" fill="#e6dfd8" />
        </pattern>
      </defs>
      <rect width="300" height="170" fill={`url(#mp-${variant})`} />
      {/* roads */}
      <g stroke="#e6dfd8" strokeWidth="1.5" fill="none">
        <path d="M 0 60 L 300 60" />
        <path d="M 0 110 L 300 110" />
        <path d="M 100 0 L 100 170" />
        <path d="M 200 0 L 200 170" />
      </g>
      <path
        d={paths[variant]}
        stroke={colors[variant]}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      {points[variant].map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r="4"
          fill={colors[variant]}
          stroke="#faf9f5"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}
