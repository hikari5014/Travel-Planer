"use client";

import { useMemo, useState } from "react";
import { PriceWithLocal } from "@/components/common/PriceWithLocal";
import { formatCurrency } from "@/lib/currency";
import type { CurrencyCode } from "@/lib/currency";
import { CompareScopeBar, type CompareScope } from "@/components/compare/CompareScopeBar";
import type { CompareDay, ComparePlanRow } from "@/lib/services/editor-loader";
import type { MockDay } from "@/lib/mock-schedule";

// Compare-page client wrapper: owns scope state, scales each plan's totals
// proportionally (Phase 3 simple model — Phase 6 can switch to per-day
// expense buckets when expenses gain stronger day attribution).
export function CompareView({
  plans,
  days,
  baseCurrency,
  totalDays,
}: {
  plans: ComparePlanRow[];
  days: CompareDay[];
  baseCurrency: CurrencyCode;
  totalDays: number;
}) {
  const [scope, setScope] = useState<CompareScope>({ kind: "trip" });

  // CompareScopeBar consumes MockDay shape; map quickly.
  const mockDays: MockDay[] = useMemo(
    () => days.map((d) => ({
      id: d.id, date: d.date, dayIndex: d.dayIndex, weekday: d.weekday,
      items: [], transports: [],
    })),
    [days],
  );

  // How many days does the current scope cover?
  const scopeDays = useMemo(() => {
    if (scope.kind === "trip") return totalDays;
    if (scope.kind === "day") return 1;
    const s = days.find((d) => d.id === scope.startDayId);
    const e = days.find((d) => d.id === scope.endDayId);
    if (!s || !e) return totalDays;
    return Math.max(1, e.dayIndex - s.dayIndex + 1);
  }, [scope, days, totalDays]);

  const fraction = totalDays > 0 ? scopeDays / totalDays : 1;

  const scaledPlans = useMemo(
    () => plans.map((p) => ({
      ...p,
      scopedTotalCost: Math.round(p.totalCost * fraction),
      scopedDistanceKm: Math.round(p.totalDistanceKm * fraction),
      scopedDays: scopeDays,
      scopedBreakdown: {
        food: Math.round(p.costBreakdown.food * fraction),
        lodging: Math.round(p.costBreakdown.lodging * fraction),
        transport: Math.round(p.costBreakdown.transport * fraction),
        ticket: Math.round(p.costBreakdown.ticket * fraction),
        misc: Math.round(p.costBreakdown.misc * fraction),
      },
    })),
    [plans, fraction, scopeDays],
  );

  return (
    <>
      <div className="mb-lg">
        <CompareScopeBar days={mockDays} scope={scope} onChange={setScope} />
      </div>

      <div className="grid gap-md md:grid-cols-3">
        {scaledPlans.map((plan, idx) => (
          <PlanColumn key={plan.id} plan={plan} index={idx} baseCurrency={baseCurrency} />
        ))}
      </div>

      <section className="mt-xl">
        <h2 className="mb-md text-title-md text-ink">指標總覽</h2>
        <div className="overflow-hidden rounded-lg border border-hairline">
          <table className="w-full text-body-sm">
            <thead className="bg-surface-soft text-caption text-muted">
              <tr>
                <th className="px-md py-sm text-left">指標</th>
                {scaledPlans.map((p) => (
                  <th key={p.id} className="px-md py-sm text-right">{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft bg-canvas">
              <PriceRow label="範圍內總花費" amounts={scaledPlans.map((p) => p.scopedTotalCost)} highlightLowest baseCurrency={baseCurrency} />
              <TextRow label="範圍距離" values={scaledPlans.map((p) => `${p.scopedDistanceKm} km`)} />
              <TextRow label="範圍天數" values={scaledPlans.map((p) => `${p.scopedDays} 天`)} />
              <TextRow label="節奏" values={scaledPlans.map((p) => p.pace)} />
              <PriceRow label="食" amounts={scaledPlans.map((p) => p.scopedBreakdown.food)} baseCurrency={baseCurrency} />
              <PriceRow label="住" amounts={scaledPlans.map((p) => p.scopedBreakdown.lodging)} baseCurrency={baseCurrency} />
              <PriceRow label="行" amounts={scaledPlans.map((p) => p.scopedBreakdown.transport)} baseCurrency={baseCurrency} />
              <PriceRow label="票卷" amounts={scaledPlans.map((p) => p.scopedBreakdown.ticket)} baseCurrency={baseCurrency} />
              <PriceRow label="其他" amounts={scaledPlans.map((p) => p.scopedBreakdown.misc)} baseCurrency={baseCurrency} />
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

type Scaled = ComparePlanRow & {
  scopedTotalCost: number;
  scopedDistanceKm: number;
  scopedDays: number;
  scopedBreakdown: { food: number; lodging: number; transport: number; ticket: number; misc: number };
};

function PlanColumn({ plan, index, baseCurrency }: { plan: Scaled; index: number; baseCurrency: CurrencyCode }) {
  const accentBars = ["bg-brand-accent", "bg-badge-violet", "bg-badge-orange", "bg-badge-emerald"];
  const accentBarsSoft = ["bg-brand-accent/60", "bg-badge-violet/60", "bg-badge-orange/60", "bg-badge-emerald/60"];
  const accent = accentBars[index] ?? "bg-muted";
  const accentSoft = accentBarsSoft[index] ?? "bg-muted/60";

  return (
    <div className={`flex flex-col rounded-lg border bg-canvas ${plan.isDefault ? "border-ink shadow-soft-elevation" : "border-hairline"}`}>
      <div className="flex items-start gap-sm border-b border-hairline-soft p-md">
        <span className={`mt-1 h-3 w-1 rounded-full ${accent}`} />
        <div className="flex-1">
          <div className="flex items-center gap-xs">
            <h3 className="text-title-md text-ink">{plan.name}</h3>
            {plan.isDefault && (
              <span className="rounded-pill bg-surface-card px-2 py-0.5 text-caption text-ink">使用中</span>
            )}
          </div>
          <p className="mt-xxs text-caption text-muted">{plan.description || "—"}</p>
        </div>
      </div>

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

      <div className="border-b border-hairline-soft p-md">
        <p className="text-caption-uppercase text-muted-soft">每日強度</p>
        <div className="mt-xs flex h-14 items-end gap-1">
          {plan.dayIntensity.length === 0 && <p className="text-caption text-muted-soft">尚未排定行程</p>}
          {plan.dayIntensity.map((h, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-xs">
              <div className={`w-full rounded-sm ${accentSoft}`} style={{ height: `${Math.max(2, h * 8)}px` }} />
              <span className="font-mono text-[10px] text-muted-soft">D{i + 1}</span>
            </div>
          ))}
        </div>
      </div>

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
          <BreakItem cls="bg-badge-emerald" label="住宿" amount={plan.scopedBreakdown.lodging} baseCurrency={baseCurrency} />
          <BreakItem cls="bg-badge-pink" label="餐飲" amount={plan.scopedBreakdown.food} baseCurrency={baseCurrency} />
          <BreakItem cls="bg-badge-orange" label="交通" amount={plan.scopedBreakdown.transport} baseCurrency={baseCurrency} />
          <BreakItem cls="bg-warning" label="票卷" amount={plan.scopedBreakdown.ticket} baseCurrency={baseCurrency} />
          <BreakItem cls="bg-muted" label="其他" amount={plan.scopedBreakdown.misc} baseCurrency={baseCurrency} />
        </ul>
      </div>
    </div>
  );
}

function CostSeg({ w, cls }: { w: number; cls: string }) {
  return <div style={{ width: `${w * 100}%` }} className={cls} />;
}
function BreakItem({ cls, label, amount, baseCurrency }: { cls: string; label: string; amount: number; baseCurrency: CurrencyCode }) {
  return (
    <li className="flex items-center gap-xs">
      <span className={`h-2 w-2 rounded-full ${cls}`} />
      <span className="flex-1">{label}</span>
      <span className="font-mono text-ink">{formatCurrency(amount, baseCurrency)}</span>
    </li>
  );
}
function TextRow({ label, values }: { label: string; values: string[] }) {
  return (
    <tr>
      <td className="px-md py-sm text-muted">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="px-md py-sm text-right font-mono text-ink">{v}</td>
      ))}
    </tr>
  );
}
function PriceRow({
  label, amounts, highlightLowest = false, baseCurrency,
}: {
  label: string; amounts: number[]; highlightLowest?: boolean; baseCurrency: CurrencyCode;
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
              <span className="font-mono">{formatCurrency(a, baseCurrency)}</span>
              {isHi && <span className="text-[10px]">↓ 最低</span>}
            </div>
          </td>
        );
      })}
    </tr>
  );
}
