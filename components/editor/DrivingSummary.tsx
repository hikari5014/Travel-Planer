"use client";

import { Car, Fuel } from "lucide-react";
import type { DrivingSegments } from "@/lib/services/driving-segments-types";

// Phase 13 — single-row driving summary for TransportRow. Mirrors the
// pattern of TransitSummary: shows segment-type proportion chips + fuel
// + toll total inline. Expanded "詳細" view (existing in ScheduleListView)
// still renders the full segment list + rest areas.

export function DrivingSummary({
  segments,
  durationSec,
  distanceM,
}: {
  segments: DrivingSegments;
  durationSec: number;
  distanceM: number;
}) {
  const total = segments.segments.reduce((s, x) => s + x.distanceM, 0);
  const pct = (kind: "surface" | "toll-road" | "highway") => {
    if (total === 0) return 0;
    const sum = segments.segments
      .filter((s) => s.kind === kind)
      .reduce((s, x) => s + x.distanceM, 0);
    return Math.round((sum / total) * 100);
  };
  const pSurface = pct("surface");
  const pToll = pct("toll-road");
  const pHighway = pct("highway");
  const fuel = segments.fuelEstimate;
  const toll = segments.tollTotal;

  return (
    <span className="flex flex-wrap items-center gap-1 text-[11px]">
      <Car size={11} strokeWidth={1.8} />
      <span className="font-mono text-ink">{Math.round(durationSec / 60)} 分</span>
      <span className="text-muted-soft">·</span>
      <span className="font-mono">{(distanceM / 1000).toFixed(1)} km</span>
      {(pSurface > 0 || pToll > 0 || pHighway > 0) && (
        <>
          <span className="text-muted-soft">·</span>
          {pSurface > 0 && (
            <span className="rounded bg-success/15 px-1 py-px text-[10px] text-success">平面 {pSurface}%</span>
          )}
          {pToll > 0 && (
            <span className="rounded bg-warning/15 px-1 py-px text-[10px] text-warning">收費 {pToll}%</span>
          )}
          {pHighway > 0 && (
            <span className="rounded bg-error/15 px-1 py-px text-[10px] text-error">高速 {pHighway}%</span>
          )}
        </>
      )}
      <span className="text-muted-soft">·</span>
      <span className="inline-flex items-center gap-0.5 text-muted">
        <Fuel size={9} strokeWidth={1.8} />
        {fuel.currency} {Math.round(fuel.cost).toLocaleString()}
      </span>
      {toll && toll.amount > 0 && (
        <>
          <span className="text-muted-soft">·</span>
          <span className="text-warning">過路費 {toll.currency} {Math.round(toll.amount).toLocaleString()}</span>
        </>
      )}
    </span>
  );
}
