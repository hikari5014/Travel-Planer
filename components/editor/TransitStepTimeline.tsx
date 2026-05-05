"use client";

import { Footprints, TrainFront, Train, Bus, Ship } from "lucide-react";
import type {
  TransitRideStep,
  TransitSteps,
  TransitWalkStep,
} from "@/lib/services/transit-steps-types";

// Phase 12b — vertical timeline mirroring Google Maps' transit detail view:
//
//   12:30 ●  淺草寺
//         ┊  walk 3 分 · 200 m
//   12:33 ●  淺草站
//         ┃  銀座線 各站停車 · 10 分 · 6 站 · G19 → G09
//   12:43 ●  神田 (G09)
//         ┊  walk 3 分
//   ...
//
// Connector visual:
//   - Walk: dashed grey vertical line
//   - Ride: solid colored vertical line (lineColor) — Google's brand color
//
// Pure presentational — accepts already-parsed TransitSteps.

const VEHICLE_ICONS = {
  SUBWAY: TrainFront,
  HEAVY_RAIL: Train,
  COMMUTER_TRAIN: Train,
  BUS: Bus,
  TRAM: TrainFront,
  FERRY: Ship,
} as const;

export function TransitStepTimeline({
  steps,
  className = "",
}: {
  steps: TransitSteps;
  className?: string;
}) {
  if (!steps.steps || steps.steps.length === 0) return null;

  return (
    <ol className={`space-y-0 ${className}`}>
      {steps.steps.map((s, i) => (
        <li key={i}>
          {s.kind === "walk" ? <WalkRow s={s} /> : <RideRow s={s} />}
        </li>
      ))}
      {steps.serviceFrequencyMin != null && (
        <li className="pl-8 pt-1 text-[10px] text-muted-soft">
          班距：每 {steps.serviceFrequencyMin} 分鐘
        </li>
      )}
    </ol>
  );
}

function WalkRow({ s }: { s: TransitWalkStep }) {
  const min = Math.round(s.durationSec / 60);
  return (
    <div className="flex gap-2 py-1">
      <div className="flex w-6 flex-shrink-0 flex-col items-center">
        <div className="my-0.5 flex-1 border-l border-dashed border-hairline" style={{ minHeight: 18 }} />
      </div>
      <div className="flex flex-1 items-center gap-1.5 text-[11px] text-muted">
        <Footprints size={11} strokeWidth={1.8} />
        <span>步行 {min} 分</span>
        {s.distanceM > 0 && <span className="text-muted-soft">· {formatDistance(s.distanceM)}</span>}
        {s.instruction && <span className="text-muted-soft">· {s.instruction}</span>}
      </div>
    </div>
  );
}

function RideRow({ s }: { s: TransitRideStep }) {
  const Icon = (s.vehicleType && VEHICLE_ICONS[s.vehicleType]) ?? TrainFront;
  const lineColor = s.lineColor ?? "#3b82f6"; // brand-accent fallback
  const textColor = s.lineTextColor ?? "#ffffff";
  const min = Math.round(s.durationSec / 60);

  return (
    <div className="py-1.5">
      {/* From-station row */}
      <div className="flex gap-2">
        <div className="flex w-6 flex-shrink-0 flex-col items-center">
          <div
            className="h-3 w-3 rounded-full border-2 bg-canvas"
            style={{ borderColor: lineColor }}
          />
        </div>
        <div className="flex flex-1 items-baseline gap-1.5 text-body-sm">
          <span className="font-mono text-[11px] text-muted-soft">{s.departureTime}</span>
          <span className="text-ink">{s.fromStation}</span>
          {s.fromStationId && <StationIdPill id={s.fromStationId} color={lineColor} />}
        </div>
      </div>

      {/* Connector + line label */}
      <div className="flex gap-2">
        <div className="flex w-6 flex-shrink-0 flex-col items-center">
          <div
            className="my-0.5 flex-1"
            style={{ width: 3, background: lineColor, minHeight: 28 }}
          />
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-1 py-1.5 text-[11px]">
          <span
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium"
            style={{ background: lineColor, color: textColor }}
          >
            <Icon size={11} strokeWidth={2} />
            {s.lineCode && <span className="font-mono text-[10px]">{s.lineCode}</span>}
            {s.lineName}
          </span>
          {s.serviceType && <span className="text-muted">{s.serviceType}</span>}
          {s.headsign && <span className="text-muted">往 {s.headsign}</span>}
          <span className="text-muted-soft">·</span>
          <span className="text-muted">{min} 分</span>
          <span className="text-muted-soft">·</span>
          <span className="text-muted">{s.numStops} 站</span>
          {s.platform && (
            <>
              <span className="text-muted-soft">·</span>
              <span className="text-muted">{s.platform}</span>
            </>
          )}
        </div>
      </div>

      {/* To-station row */}
      <div className="flex gap-2">
        <div className="flex w-6 flex-shrink-0 flex-col items-center">
          <div
            className="h-3 w-3 rounded-full border-2 bg-canvas"
            style={{ borderColor: lineColor }}
          />
        </div>
        <div className="flex flex-1 items-baseline gap-1.5 text-body-sm">
          <span className="font-mono text-[11px] text-muted-soft">{s.arrivalTime}</span>
          <span className="text-ink">{s.toStation}</span>
          {s.toStationId && <StationIdPill id={s.toStationId} color={lineColor} />}
        </div>
      </div>
    </div>
  );
}

function StationIdPill({ id, color }: { id: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded px-1 font-mono text-[9px]"
      style={{ borderWidth: 1, borderColor: color, color }}
    >
      {id}
    </span>
  );
}

function formatDistance(m: number): string {
  if (m < 1000) return `${m} 公尺`;
  return `${(m / 1000).toFixed(1)} 公里`;
}
