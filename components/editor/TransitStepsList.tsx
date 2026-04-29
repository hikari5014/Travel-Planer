"use client";

import { useEffect, useState } from "react";
import { Bus, Footprints, Loader2, Train, TrainFront } from "lucide-react";
import { getTransitStepsAction } from "@/app/(actions)/transport-actions";
import type { ParsedTransitStep } from "@/lib/services/directions-service";

// Phase 9.5 — Google-Maps-style step-by-step transit detail panel.
// Lazy-loads the parsed steps from the cached Routes response (server-side
// parses the heavy JSON, returns only the slim ParsedTransitStep[]).
// Falls back to a friendly hint when there's no cache yet.

export function TransitStepsList({
  transportId,
  fareCurrency,
  fareAmount,
  totalDistanceM,
  totalDurationSec,
  transitLine,
}: {
  transportId: string;
  fareCurrency: string | null | undefined;
  fareAmount: number | null | undefined;
  totalDistanceM: number;
  totalDurationSec: number;
  transitLine: string | null | undefined;
}) {
  const [steps, setSteps] = useState<ParsedTransitStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTransitStepsAction(transportId)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setSteps(r.steps);
        else setError(r.error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [transportId]);

  return (
    <div className="rounded-md border border-brand-accent/30 bg-brand-accent/5 p-3">
      <div className="flex items-baseline justify-between">
        <p className="flex items-center gap-1 text-caption font-medium text-brand-accent">
          <TrainFront size={12} strokeWidth={2} />
          大眾運輸詳細路線
        </p>
        <p className="text-[10px] text-muted">
          {(totalDistanceM / 1000).toFixed(1)} km · {Math.round(totalDurationSec / 60)} 分
          {fareAmount != null && ` · ${fareCurrency ?? ""} ${Math.round(fareAmount)}`}
        </p>
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-1.5 text-caption text-muted">
          <Loader2 size={11} className="animate-spin" /> 解析路線步驟…
        </div>
      ) : error ? (
        <div className="mt-3 space-y-1">
          <p className="text-[11px] text-warning">⚠ {error}</p>
          {transitLine && (
            <p className="text-[11px] text-ink">
              <span className="text-muted-soft">路線摘要：</span>
              {transitLine}
            </p>
          )}
        </div>
      ) : !steps || steps.length === 0 ? (
        <p className="mt-3 text-[11px] text-muted-soft">
          無詳細步驟（這條路線可能是純步行 / 駕車模式 — 已切換到大眾運輸後請按「刷新」）。
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2.5">
              {/* Connector dot + line */}
              <div className="flex flex-shrink-0 flex-col items-center">
                <StepDot step={s} />
                {i < steps.length - 1 && (
                  <div className="my-0.5 w-px flex-1 bg-hairline" style={{ minHeight: 14 }} />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <StepBody step={s} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function StepDot({ step }: { step: ParsedTransitStep }) {
  if (step.kind === "WALK") {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-card text-muted">
        <Footprints size={11} strokeWidth={2} />
      </div>
    );
  }
  if (step.kind === "TRANSIT") {
    const Icon = vehicleIcon(step.vehicleType);
    const bg = step.lineColor || "#3b82f6";
    const fg = step.lineTextColor || "#ffffff";
    return (
      <div
        className="flex h-6 w-6 items-center justify-center rounded-full"
        style={{ backgroundColor: bg, color: fg }}
        title={step.vehicleType ?? "transit"}
      >
        <Icon size={11} strokeWidth={2} />
      </div>
    );
  }
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-card text-muted">
      <Bus size={11} strokeWidth={2} />
    </div>
  );
}

function StepBody({ step }: { step: ParsedTransitStep }) {
  if (step.kind === "WALK") {
    return (
      <div>
        <p className="text-body-sm text-ink">
          🚶 步行 {(step.distanceMeters >= 1000
            ? `${(step.distanceMeters / 1000).toFixed(1)} km`
            : `${step.distanceMeters} m`)} · {Math.round(step.durationSec / 60)} 分
        </p>
        {step.instruction && (
          <p
            className="mt-0.5 text-[11px] text-muted leading-relaxed"
            // Google Routes returns plain text here; safe to render.
          >
            {stripHtmlTags(step.instruction)}
          </p>
        )}
      </div>
    );
  }
  if (step.kind === "TRANSIT") {
    return (
      <div>
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span
            className="rounded-pill px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: step.lineColor ?? "#3b82f6",
              color: step.lineTextColor ?? "#ffffff",
            }}
          >
            {step.lineNameShort ?? step.lineName}
          </span>
          {step.headsign && (
            <span className="text-[11px] text-muted">往 {step.headsign}</span>
          )}
        </div>
        <p className="mt-1 text-body-sm text-ink">
          {step.lineName}
        </p>
        <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
          <span className="font-mono text-ink">{step.departureTime ?? "—"}</span>
          <span className="truncate text-ink">⊙ {step.departureStop}</span>
          <span className="font-mono text-muted-soft">
            {step.stopCount != null ? `${step.stopCount} 站` : ""}
          </span>
          <span className="text-muted-soft">
            │ {Math.round(step.durationSec / 60)} 分
            {step.headwaySec ? ` · 班距 ${Math.round(step.headwaySec / 60)} 分` : ""}
          </span>
          <span className="font-mono text-ink">{step.arrivalTime ?? "—"}</span>
          <span className="truncate text-ink">⊙ {step.arrivalStop}</span>
        </div>
        {step.agency && (
          <p className="mt-1 text-[10px] text-muted-soft">營運：{step.agency}</p>
        )}
      </div>
    );
  }
  return (
    <div>
      <p className="text-body-sm text-ink">
        {step.mode} {(step.distanceMeters / 1000).toFixed(1)} km · {Math.round(step.durationSec / 60)} 分
      </p>
      {step.instruction && (
        <p className="mt-0.5 text-[11px] text-muted">{stripHtmlTags(step.instruction)}</p>
      )}
    </div>
  );
}

function vehicleIcon(type?: string): React.ComponentType<{ size?: number; strokeWidth?: number }> {
  if (!type) return TrainFront;
  if (type === "BUS" || type === "TROLLEYBUS") return Bus;
  if (type === "HEAVY_RAIL" || type === "COMMUTER_TRAIN" || type === "HIGH_SPEED_TRAIN" || type === "LONG_DISTANCE_TRAIN") return Train;
  // SUBWAY / METRO_RAIL / TRAM / RAIL → use TrainFront
  return TrainFront;
}

function stripHtmlTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}
