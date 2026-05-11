"use client";

import { Footprints, TrainFront, Train, Bus, Ship } from "lucide-react";
import type {
  TransitRideStep,
  TransitSteps,
} from "@/lib/services/transit-steps-types";

// Phase 13 — single-row Google-Maps-style summary of a transit timeline.
// Renders ride lines as colored chips (using each line's lineColor) and walk
// segments as a small footprints icon. Total walking time + service frequency
// surface inline. The detailed timeline (TransitStepTimeline) is the expanded
// counterpart shown when the user toggles 「詳細」.

const VEHICLE_ICONS = {
  SUBWAY: TrainFront,
  HEAVY_RAIL: Train,
  COMMUTER_TRAIN: Train,
  BUS: Bus,
  TRAM: TrainFront,
  FERRY: Ship,
} as const;

export function TransitSummary({
  steps,
  fareAmount,
  fareCurrency,
}: {
  steps: TransitSteps;
  fareAmount?: number | null;
  fareCurrency?: string | null;
}) {
  const rides: TransitRideStep[] = steps.steps.filter(
    (s): s is TransitRideStep => s.kind === "ride",
  );
  const walks = steps.steps.filter((s) => s.kind === "walk");
  const totalWalkMin = Math.round(
    walks.reduce((sum, w) => sum + (w.kind === "walk" ? w.durationSec : 0), 0) / 60,
  );

  const flow: Array<
    | { kind: "walk"; key: string }
    | { kind: "ride"; key: string; ride: TransitRideStep }
  > = [];
  steps.steps.forEach((s, i) => {
    if (s.kind === "walk") flow.push({ kind: "walk", key: `w${i}` });
    else flow.push({ kind: "ride", key: `r${i}`, ride: s });
  });

  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px]">
      {flow.map((node, i) => (
        <span key={node.key} className="inline-flex items-center gap-1">
          {node.kind === "walk" ? (
            <Footprints size={11} strokeWidth={1.8} className="text-muted-soft" />
          ) : (
            <RideChip ride={node.ride} />
          )}
          {i < flow.length - 1 && (
            <span className="text-muted-soft" aria-hidden>
              ›
            </span>
          )}
        </span>
      ))}
      {fareAmount != null && fareAmount > 0 && (
        <>
          <span className="text-muted-soft">·</span>
          <span className="font-mono text-ink">
            {fareCurrency ?? ""} {Math.round(fareAmount).toLocaleString()}
          </span>
        </>
      )}
      {totalWalkMin > 0 && (
        <>
          <span className="text-muted-soft">·</span>
          <span className="inline-flex items-center gap-0.5 text-muted">
            <Footprints size={9} strokeWidth={1.8} />
            {totalWalkMin} 分
          </span>
        </>
      )}
      {steps.serviceFrequencyMin != null && (
        <>
          <span className="text-muted-soft">·</span>
          <span className="text-muted">每 {steps.serviceFrequencyMin} 分鐘</span>
        </>
      )}
      {rides.length === 0 && (
        <span className="text-muted-soft">（純步行）</span>
      )}
    </div>
  );
}

function RideChip({ ride }: { ride: TransitRideStep }) {
  const Icon = (ride.vehicleType && VEHICLE_ICONS[ride.vehicleType]) ?? TrainFront;
  const bg = ride.lineColor ?? "#3b82f6";
  const fg = ride.lineTextColor ?? "#ffffff";
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded px-1.5 py-px text-[10px] font-medium"
      style={{ background: bg, color: fg }}
      title={`${ride.lineName}${ride.serviceType ? " · " + ride.serviceType : ""}${ride.numStops ? " · " + ride.numStops + " 站" : ""}`}
    >
      <Icon size={10} strokeWidth={2} />
      {ride.lineCode && <span className="font-mono text-[9px]">{ride.lineCode}</span>}
      <span className="max-w-[90px] truncate">{ride.lineName}</span>
    </span>
  );
}
