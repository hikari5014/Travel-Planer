"use client";

import { createPortal } from "react-dom";
import { Bike, Car, Footprints, Pencil, Plane, TrainFront, TrafficCone, Wand2 } from "lucide-react";
import type { MockTransport } from "@/lib/mock-schedule";
import { fmtDistance, fmtDuration, modeLabel } from "@/lib/mock-schedule";
import { ROUTE_COLOR } from "@/lib/polyline";
import { PriceWithLocal } from "@/components/common/PriceWithLocal";

// Phase 9.6 — small floating card that follows the cursor while hovering
// the polyline on the map. Shows a one-line summary so the user can read
// each segment without going back to the list. Click → opens the
// TransportEditDialog (handled by the parent via onClick).

const MODE_ICON = {
  DRIVING: Car,
  WALKING: Footprints,
  TRANSIT: TrainFront,
  BICYCLING: Bike,
  CUSTOM: Wand2,
  FLIGHT: Plane,
} as const;

export function TransportHoverPopover({
  transport,
  fromName,
  toName,
  x,
  y,
  onClick,
}: {
  transport: MockTransport;
  fromName?: string;
  toName?: string;
  x: number;
  y: number;
  onClick?: () => void;
}) {
  if (typeof window === "undefined") return null;

  const Icon = MODE_ICON[transport.mode] ?? Wand2;
  const color = ROUTE_COLOR[transport.mode] ?? ROUTE_COLOR.CUSTOM;

  // Clamp so the card stays in viewport (320px wide, ~140px tall guess)
  const CARD_W = 280;
  const CARD_H = 160;
  const padding = 8;
  const left = Math.min(Math.max(padding, x + 14), window.innerWidth - CARD_W - padding);
  const top = Math.min(Math.max(padding, y + 14), window.innerHeight - CARD_H - padding);

  return createPortal(
    <div
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{ top, left, width: CARD_W }}
      className="pointer-events-auto fixed z-[60] cursor-pointer overflow-hidden rounded-lg border border-hairline bg-canvas/97 shadow-pop backdrop-blur-sm"
    >
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderLeft: `3px solid ${color}` }}
      >
        <div
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: color }}
        >
          <Icon size={13} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-soft">
            {modeLabel(transport.mode)}
            {transport.manuallyEdited && " · 已覆蓋"}
            {!transport.encodedPolyline && " · 估算"}
          </p>
          <p className="truncate text-body-sm text-ink">
            {fromName && toName ? `${fromName} → ${toName}` : "移動段"}
          </p>
        </div>
      </div>

      <div className="border-t border-hairline-soft px-3 py-2">
        {transport.transitLine && transport.mode === "TRANSIT" && (
          <p className="mb-1 truncate text-caption text-ink">{transport.transitLine}</p>
        )}
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <p className="text-muted-soft">時間</p>
            <p className="font-mono text-ink">{fmtDuration(transport.durationSec)}</p>
          </div>
          <div>
            <p className="text-muted-soft">距離</p>
            <p className="font-mono text-ink">{fmtDistance(transport.distanceM)}</p>
          </div>
          <div>
            <p className="text-muted-soft">費用</p>
            {transport.estimatedCost != null ? (
              <PriceWithLocal amount={transport.estimatedCost} size="sm" inline />
            ) : (
              <p className="text-muted-soft">—</p>
            )}
          </div>
        </div>
        {transport.trafficLevel && transport.mode === "DRIVING" && (
          <p
            className={`mt-1.5 inline-flex items-center gap-1 text-[10px] ${
              transport.trafficLevel === "heavy"
                ? "text-error"
                : transport.trafficLevel === "moderate"
                  ? "text-warning"
                  : "text-success"
            }`}
          >
            <TrafficCone size={10} strokeWidth={2} />
            路況：
            {transport.trafficLevel === "heavy"
              ? "嚴重壅塞"
              : transport.trafficLevel === "moderate"
                ? "中等壅塞"
                : "順暢"}
          </p>
        )}
      </div>

      {onClick && (
        <div className="flex items-center gap-1 border-t border-hairline-soft bg-surface-soft px-3 py-1.5 text-[10px] text-muted">
          <Pencil size={10} strokeWidth={1.8} />
          點擊編輯這段移動
        </div>
      )}
    </div>,
    document.body,
  );
}
