"use client";

import { useEffect, useState, useTransition } from "react";
import {
  AlertTriangle,
  Car,
  Coffee,
  ExternalLink,
  Fuel,
  Loader2,
  MapPin,
  Sparkles,
} from "lucide-react";
import {
  estimateDrivingSegmentsAction,
  fuelEstimateAction,
} from "@/app/(actions)/driving-segments-actions";
import {
  parseDrivingSegmentsJson,
  type DrivingFuelEstimate,
  type DrivingSegments,
} from "@/lib/services/driving-segments-types";

// Phase 12c — DRIVING-only detail panel rendered inside TransportEditDialogV2.
// Top: tier-1 fuel estimate (always free; recomputed on mount).
// Middle: vertical timeline of road segments (surface / toll / highway) with
//   rest areas annotated as branches. Only when tier-2 LLM data exists.
// Bottom: 「估算 / 重新估算 (Gemini 搜尋)」 button + source list.
//
// LLM call is gated behind explicit user click — never auto-fired.

export function DrivingDetailPanel({
  tripId,
  transportId,
  initialDrivingSegmentsJson,
}: {
  tripId: string;
  transportId: string;
  initialDrivingSegmentsJson: string | null | undefined;
}) {
  const initial = parseDrivingSegmentsJson(initialDrivingSegmentsJson);
  const [data, setData] = useState<DrivingSegments | null>(initial);
  const [tier1Fuel, setTier1Fuel] = useState<DrivingFuelEstimate | null>(null);
  const [estimating, startEstimate] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Always recompute the tier-1 fuel estimate on mount so it reflects the
  // user's current Settings (price/efficiency may have changed since the
  // tier-2 estimate was persisted).
  useEffect(() => {
    fuelEstimateAction(transportId).then(setTier1Fuel).catch(() => setTier1Fuel(null));
  }, [transportId]);

  function runEstimate() {
    setError(null);
    startEstimate(async () => {
      const r = await estimateDrivingSegmentsAction(tripId, transportId);
      if (r.ok) setData(r.data);
      else setError(r.error);
    });
  }

  const fuel = data?.fuelEstimate ?? tier1Fuel;
  const segments = data?.segments ?? [];
  const restAreas = data?.restAreas ?? [];
  const totalDist = segments.reduce((sum, s) => sum + s.distanceM, 0);
  const pSurface = pct(segments.filter((s) => s.kind === "surface"), totalDist);
  const pToll = pct(segments.filter((s) => s.kind === "toll-road"), totalDist);
  const pHighway = pct(segments.filter((s) => s.kind === "highway"), totalDist);

  return (
    <div className="space-y-3 rounded-md border border-hairline-soft bg-surface-soft p-3">
      <p className="flex items-center gap-1 text-caption-uppercase text-muted-soft">
        <Car size={11} strokeWidth={1.8} /> 自駕詳情
      </p>

      {/* Fuel estimate — always rendered, free */}
      {fuel && (
        <div className="flex items-center gap-2 rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-[11px]">
          <Fuel size={11} strokeWidth={1.8} className="text-warning" />
          <span className="text-muted">油費估算：</span>
          <span className="font-mono text-ink">{fuel.liters} L · {fmtMoney(fuel.cost, fuel.currency)}</span>
          <span className="text-muted-soft">（{fuel.pricePerLiter} {fuel.currency}/L · {fuel.efficiencyKmPerL} km/L）</span>
        </div>
      )}

      {/* Segment proportion bar — only when LLM data exists */}
      {data && segments.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-soft">
            <span>路段組成</span>
            {data.tollTotal && (
              <span className="font-mono text-ink">過路費合計 {fmtMoney(data.tollTotal.amount, data.tollTotal.currency)}</span>
            )}
          </div>
          <div className="flex h-5 overflow-hidden rounded text-[10px] text-on-primary">
            {pSurface > 0 && (
              <div className="flex items-center justify-center bg-success/80" style={{ width: `${pSurface}%` }}>
                平面 {pSurface}%
              </div>
            )}
            {pToll > 0 && (
              <div className="flex items-center justify-center bg-warning/80" style={{ width: `${pToll}%` }}>
                收費 {pToll}%
              </div>
            )}
            {pHighway > 0 && (
              <div className="flex items-center justify-center bg-error/70" style={{ width: `${pHighway}%` }}>
                高速 {pHighway}%
              </div>
            )}
          </div>
        </div>
      )}

      {/* Segment timeline */}
      {data && segments.length > 0 && (
        <ol className="relative space-y-2 border-l border-hairline-soft pl-4">
          {segments.map((s, i) => (
            <li key={i} className="text-[11px]">
              <span
                className={`absolute -left-[5px] mt-1 h-2 w-2 rounded-full ${
                  s.kind === "highway"
                    ? "bg-error"
                    : s.kind === "toll-road"
                      ? "bg-warning"
                      : "bg-success"
                }`}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <MapPin size={10} strokeWidth={1.8} className="text-muted-soft" />
                <span className="font-medium text-ink">{s.roadName ?? labelForKind(s.kind)}</span>
                <span className="rounded bg-surface-card px-1.5 py-px font-mono text-[10px] text-muted">
                  {(s.distanceM / 1000).toFixed(1)} km · {Math.round(s.durationSec / 60)} 分
                </span>
                {s.tollAmount != null && s.tollCurrency && (
                  <span className="rounded border border-warning/40 bg-warning/5 px-1.5 py-px font-mono text-[10px] text-warning">
                    過路費 {fmtMoney(s.tollAmount, s.tollCurrency)}
                  </span>
                )}
              </div>
              {restAreasForSegment(restAreas, segments, i).map((r) => (
                <div
                  key={r.name}
                  className="ml-4 mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted"
                >
                  <Coffee size={10} strokeWidth={1.8} />
                  <span className="text-ink">{r.name}</span>
                  <span className="text-muted-soft">
                    ({r.kmFromStart.toFixed(1)} km · {r.type}
                    {r.direction === "outbound" ? " · 去程方向" : ""})
                  </span>
                  {r.notes && <span className="text-muted-soft">— {r.notes}</span>}
                </div>
              ))}
            </li>
          ))}
        </ol>
      )}

      {/* Empty state hint */}
      {!data && (
        <p className="rounded-md border border-dashed border-hairline-soft p-2 text-[11px] text-muted-soft">
          按下方按鈕呼叫 Gemini（含 Google 搜尋）估算過路費 / 高速路段 / 休息站。費用與服務區資訊變動頻繁，估完請現場確認。
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-error/30 bg-error/5 p-2 text-[11px] text-error">
          <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={runEstimate}
          disabled={estimating}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-button text-on-primary hover:bg-primary-active disabled:opacity-60"
        >
          {estimating ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Sparkles size={11} strokeWidth={1.8} />
          )}
          {data ? "重新估算" : "估算過路費 / 休息站"}
        </button>
        {data?.groundingSources && data.groundingSources.length > 0 && (
          <details className="text-[10px] text-muted">
            <summary className="cursor-pointer">資料來源 ({data.groundingSources.length})</summary>
            <ul className="mt-1 space-y-0.5">
              {data.groundingSources.map((u, i) => (
                <li key={i} className="flex items-center gap-1">
                  <ExternalLink size={9} strokeWidth={1.8} />
                  <a
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-brand-accent hover:underline"
                  >
                    {hostname(u)}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {data && (
        <p className="text-[10px] text-muted-soft">
          ⚠️ 收費金額與服務區營運狀態請現場確認。估算於 {new Date(data.estimatedAt).toLocaleString("zh-TW")}
          {data.modelUsed ? ` · 模型 ${data.modelUsed}` : ""}
        </p>
      )}
    </div>
  );
}

function pct(arr: { distanceM: number }[], total: number): number {
  if (total === 0) return 0;
  return Math.round((arr.reduce((s, x) => s + x.distanceM, 0) / total) * 100);
}

function labelForKind(kind: "surface" | "toll-road" | "highway"): string {
  return kind === "surface" ? "平面道路" : kind === "toll-road" ? "收費道路" : "高速公路";
}

function fmtMoney(amount: number, currency: string): string {
  return `${currency} ${Math.round(amount).toLocaleString()}`;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 30);
  }
}

// Locate rest areas that fall within this segment's km range.
function restAreasForSegment(
  restAreas: { name: string; kmFromStart: number; direction: "outbound" | "either"; type: "PA" | "SA" | "rest-stop"; notes?: string }[],
  segments: { distanceM: number }[],
  index: number,
) {
  if (restAreas.length === 0) return [];
  const startKm = segments.slice(0, index).reduce((s, x) => s + x.distanceM, 0) / 1000;
  const endKm = startKm + segments[index].distanceM / 1000;
  return restAreas.filter((r) => r.kmFromStart >= startKm && r.kmFromStart <= endKm);
}
