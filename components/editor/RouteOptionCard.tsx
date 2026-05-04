"use client";

import { useState } from "react";
import {
  Bike,
  Car,
  CarTaxiFront,
  ChevronDown,
  ChevronUp,
  Clock,
  Footprints,
  Leaf,
  Loader2,
  Sparkles,
  TrafficCone,
  TrainFront,
  Wallet,
  Wand2,
} from "lucide-react";
import type { RouteOption, RouteOptionMode, RouteOptionBadge } from "@/lib/services/route-options-service";
import type { ParsedTransitStep } from "@/lib/services/directions-service";
import { fmtDistance, fmtDuration } from "@/lib/mock-schedule";
import { PriceWithLocal } from "@/components/common/PriceWithLocal";
import type { CurrencyCode } from "@/lib/currency";
import { ROUTE_COLOR } from "@/lib/polyline";

// Maps-style route option card. Click "選擇此方案" → applyRouteOptionAction.
// Expandable: shows mode-specific details (transit steps, taxi breakdown,
// driving traffic note).

const MODE_ICON: Record<RouteOptionMode, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  DRIVING: Car,
  WALKING: Footprints,
  TRANSIT: TrainFront,
  BICYCLING: Bike,
  TAXI: CarTaxiFront,
  FLIGHT: Wand2, // FLIGHT shouldn't reach here in V2 picker, but keep the map total
};

const BADGE_LABEL: Record<RouteOptionBadge, { label: string; cls: string; icon?: React.ComponentType<{ size?: number; strokeWidth?: number }> }> = {
  recommended: { label: "推薦", cls: "bg-primary text-on-primary", icon: Sparkles },
  fastest: { label: "最快", cls: "bg-brand-accent/15 text-brand-accent", icon: Clock },
  cheapest: { label: "最便宜", cls: "bg-success/15 text-success", icon: Wallet },
  "most-comfortable": { label: "最舒適", cls: "bg-badge-violet/15 text-ink" },
  greenest: { label: "最環保", cls: "bg-badge-emerald/15 text-ink", icon: Leaf },
};

export function RouteOptionCard({
  option,
  isSelected,
  onSelect,
  applying,
}: {
  option: RouteOption;
  isSelected: boolean;
  onSelect: () => void;
  applying: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = MODE_ICON[option.mode] ?? Wand2;
  const color = ROUTE_COLOR[option.mode] ?? ROUTE_COLOR.CUSTOM;

  const hasDetail =
    (option.mode === "TRANSIT" && (option.transitSteps?.length ?? 0) > 0) ||
    (option.mode === "TAXI" && option.taxiRateSnapshot) ||
    ((option.mode === "DRIVING" || option.mode === "TAXI") && option.trafficLevel);

  return (
    <div
      className={`overflow-hidden rounded-lg border transition-all ${
        isSelected ? "border-ink shadow-soft-elevation" : "border-hairline hover:border-ink/40"
      }`}
    >
      {/* Top row: clickable summary */}
      <button
        type="button"
        onClick={onSelect}
        disabled={applying}
        className="flex w-full items-start gap-3 bg-canvas p-3 text-left disabled:opacity-60"
      >
        {/* Mode icon chip */}
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: color }}
        >
          <Icon size={16} strokeWidth={2} />
        </div>

        <div className="min-w-0 flex-1">
          {/* Title + badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-body-sm font-medium text-ink">{option.label}</span>
            {option.badges.map((b) => {
              const meta = BADGE_LABEL[b];
              const BIcon = meta.icon;
              return (
                <span
                  key={b}
                  className={`inline-flex items-center gap-0.5 rounded-pill px-1.5 py-px text-[10px] ${meta.cls}`}
                >
                  {BIcon && <BIcon size={9} strokeWidth={2} />}
                  {meta.label}
                </span>
              );
            })}
          </div>

          {/* Stats row */}
          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-0.5">
              <Clock size={10} strokeWidth={1.8} />
              <span className="font-mono text-ink">{fmtDuration(option.durationSec)}</span>
            </span>
            <span className="font-mono">{fmtDistance(option.distanceM)}</span>
            {option.fareAmount != null && option.fareAmount > 0 && (
              <span className="flex items-center gap-0.5">
                {option.mode === "TAXI" && <span className="text-muted-soft">≈</span>}
                <PriceWithLocal
                  amount={option.fareAmount}
                  currency={(option.fareCurrency ?? undefined) as CurrencyCode | undefined}
                  size="sm"
                  inline
                />
              </span>
            )}
            {option.transferCount != null && option.transferCount > 0 && (
              <span className="text-muted-soft">轉乘 {option.transferCount} 次</span>
            )}
            {option.walkingMeters != null && option.walkingMeters > 0 && option.mode === "TRANSIT" && (
              <span className="text-muted-soft">步行 {fmtDistance(option.walkingMeters)}</span>
            )}
          </div>
        </div>

        {/* Right side: select state / expand */}
        <div className="flex flex-col items-end gap-1">
          {applying ? (
            <Loader2 size={14} className="animate-spin text-ink" />
          ) : isSelected ? (
            <span className="rounded-pill bg-ink px-2 py-0.5 text-[10px] text-on-primary">已選</span>
          ) : (
            <span className="text-[10px] text-brand-accent">選擇此方案</span>
          )}
        </div>
      </button>

      {/* Expand toggle (separate row, not the whole card) */}
      {hasDetail && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="flex w-full items-center justify-center gap-1 border-t border-hairline-soft bg-surface-soft py-1 text-[10px] text-muted hover:text-ink"
        >
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          {expanded ? "收起" : "顯示詳情"}
        </button>
      )}

      {/* Expanded details */}
      {expanded && hasDetail && (
        <div className="border-t border-hairline-soft bg-canvas p-3">
          {option.mode === "TRANSIT" && option.transitSteps && (
            <TransitDetail steps={option.transitSteps} />
          )}
          {option.mode === "TAXI" && option.taxiRateSnapshot && (
            <TaxiDetail option={option} />
          )}
          {(option.mode === "DRIVING" || option.mode === "TAXI") && option.trafficLevel && (
            <TrafficDetail level={option.trafficLevel} />
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail panels
// ─────────────────────────────────────────────────────────────────────────────

function TransitDetail({ steps }: { steps: ParsedTransitStep[] }) {
  return (
    <ul className="space-y-1.5 text-[11px]">
      {steps.map((s, i) => {
        if (s.kind === "WALK") {
          return (
            <li key={i} className="flex items-center gap-2 text-muted">
              <Footprints size={11} strokeWidth={1.8} />
              <span>步行 {fmtDistance(s.distanceMeters)} · {fmtDuration(s.durationSec)}</span>
            </li>
          );
        }
        if (s.kind === "TRANSIT") {
          return (
            <li key={i} className="rounded-md border border-hairline-soft bg-surface-soft p-2">
              <div className="flex items-center gap-1.5">
                <span
                  className="rounded px-1.5 py-px text-[10px] font-medium text-white"
                  style={{ backgroundColor: s.lineColor ?? "#4b5563" }}
                >
                  {s.lineNameShort ?? s.lineName}
                </span>
                {s.headsign && <span className="text-muted">→ {s.headsign}</span>}
                {s.headwaySec != null && (
                  <span className="text-muted-soft">每 {Math.round(s.headwaySec / 60)} 分</span>
                )}
              </div>
              <div className="mt-1 grid grid-cols-[auto_1fr_auto] items-center gap-2 text-ink">
                <span className="font-mono text-[11px]">{s.departureTime ?? "—"}</span>
                <span className="truncate">{s.departureStop} → {s.arrivalStop}</span>
                <span className="font-mono text-[11px]">{s.arrivalTime ?? "—"}</span>
              </div>
              {s.stopCount != null && (
                <p className="mt-0.5 text-[10px] text-muted-soft">
                  共 {s.stopCount} 站
                  {s.agency && ` · ${s.agency}`}
                </p>
              )}
            </li>
          );
        }
        return (
          <li key={i} className="text-muted">
            {s.mode} · {fmtDistance(s.distanceMeters)}
          </li>
        );
      })}
    </ul>
  );
}

function TaxiDetail({ option }: { option: RouteOption }) {
  const r = option.taxiRateSnapshot;
  if (!r) return null;
  return (
    <div className="space-y-1.5 text-[11px]">
      <p className="text-ink">
        費率（{r.region}）：起跳 {r.currency} {r.baseFare} · 每 km {r.perKm} · 每分 {r.perMin}
      </p>
      {r.notes && <p className="text-[10px] leading-relaxed text-muted">{r.notes}</p>}
      <p className="rounded-md border border-warning/30 bg-warning/5 p-1.5 text-[10px] text-ink">
        ⓘ 估算僅供參考。尖峰時段、機場、夜間附加費未計入。
      </p>
    </div>
  );
}

function TrafficDetail({ level }: { level: "light" | "moderate" | "heavy" }) {
  const meta = {
    light: { label: "順暢", cls: "text-success" },
    moderate: { label: "中等壅塞", cls: "text-warning" },
    heavy: { label: "嚴重壅塞", cls: "text-error" },
  }[level];
  return (
    <p className={`flex items-center gap-1 text-[11px] ${meta.cls}`}>
      <TrafficCone size={11} strokeWidth={2} />
      即時路況：{meta.label}
    </p>
  );
}
