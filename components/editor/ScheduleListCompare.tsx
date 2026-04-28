"use client";

import { Copy, ArrowLeftRight, ClipboardCheck, Star } from "lucide-react";
import { ScheduleListView } from "@/components/editor/ScheduleListView";
import {
  fmtDistance,
  fmtDuration,
  getPlace,
  modeLabel,
  type MockDay,
  type MockPlan,
} from "@/lib/mock-schedule";
import { PlaceIconChip } from "@/lib/place-icon";
import { useState } from "react";

// Side-by-side day comparison across 2-3 plans.
// For Phase 0a these all read from the same `mockDays` source; in Phase 3 each
// plan will carry its own deep-cloned days.
//
// The leftmost column reuses `<ScheduleListView>` (full editor experience);
// the additional columns are read-only mini-cards with copy-to-current actions.
export function ScheduleListCompare({
  comparePlans,
  day,
  selectedItemId,
  onSelectItem,
}: {
  comparePlans: MockPlan[];
  day: MockDay;
  selectedItemId?: string;
  onSelectItem: (id: string) => void;
}) {
  return (
    <div className="flex h-full">
      {comparePlans.map((plan, idx) => (
        <PlanCompareColumn
          key={plan.id}
          plan={plan}
          day={day}
          isPrimary={idx === 0}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
        />
      ))}
    </div>
  );
}

function PlanCompareColumn({
  plan,
  day,
  isPrimary,
  selectedItemId,
  onSelectItem,
}: {
  plan: MockPlan;
  day: MockDay;
  isPrimary: boolean;
  selectedItemId?: string;
  onSelectItem: (id: string) => void;
}) {
  const accent = ["bg-brand-accent", "bg-badge-violet", "bg-badge-orange"][
    Math.min(2, planIndexHash(plan.id))
  ];

  return (
    <div className={`flex h-full flex-1 flex-col border-r border-hairline-soft last:border-r-0 ${isPrimary ? "bg-canvas" : "bg-surface-soft/50"}`}>
      {/* Column header */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-hairline-soft bg-canvas px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${accent}`} />
          <h3 className="truncate text-title-sm text-ink">{plan.name}</h3>
          {isPrimary && (
            <span className="rounded-pill bg-surface-card px-1.5 py-0.5 text-[10px] text-muted">
              使用中
            </span>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1 text-[11px] text-muted">
          <span>{plan.pace}</span>
          <span className="text-muted-soft">·</span>
          <span className="font-mono text-ink">NT$ {(plan.totalCost / 1000).toFixed(1)}k</span>
        </div>
      </div>

      {/* Day content */}
      <div className="flex-1 overflow-y-auto">
        {isPrimary ? (
          // Primary column: full editing experience
          <ScheduleListView day={day} selectedItemId={selectedItemId} onSelectItem={onSelectItem} />
        ) : (
          // Comparison columns: read-only mini list + copy actions
          <ReadonlyDayList
            day={day}
            sourcePlanName={plan.name}
            targetPlanName={"預設方案"}
          />
        )}
      </div>
    </div>
  );
}

function ReadonlyDayList({
  day,
  sourcePlanName,
  targetPlanName,
}: {
  day: MockDay;
  sourcePlanName: string;
  targetPlanName: string;
}) {
  // Build a transport lookup keyed by from-item
  const transportsByFrom = new Map<string, (typeof day.transports)[number]>();
  for (const t of day.transports) transportsByFrom.set(t.fromItemId, t);
  const timed = day.items.filter((i) => !i.isAllDay);

  const [justCopiedId, setJustCopiedId] = useState<string | null>(null);

  function handleCopy(id: string) {
    setJustCopiedId(id);
    setTimeout(() => setJustCopiedId(null), 1500);
  }

  return (
    <div className="px-3 py-3">
      {/* Day header (compact) */}
      <div className="mb-2 flex items-end justify-between">
        <p className="text-[10px] uppercase tracking-wide text-muted-soft">
          DAY {day.dayIndex} · {formatFull(day.date)}
        </p>
        <p className="font-mono text-[10px] text-muted-soft">
          {timed.length > 0
            ? `${timed[0].startTime}–${timed[timed.length - 1].endTime}`
            : "—"}
        </p>
      </div>

      {/* Bulk copy bar */}
      <div className="mb-2 flex items-center gap-1 rounded-md border border-dashed border-hairline px-2 py-1.5">
        <ArrowLeftRight size={12} strokeWidth={1.8} className="text-muted-soft" />
        <span className="flex-1 text-[11px] text-muted">
          將整日從「{sourcePlanName}」複製到「{targetPlanName}」
        </span>
        <button className="rounded-sm border border-hairline bg-canvas px-2 py-0.5 text-[11px] text-ink hover:border-ink">
          複製整日
        </button>
      </div>

      {/* Items */}
      {timed.map((item, idx) => {
        const place = getPlace(item.placeId);
        if (!place) return null;
        const transport = idx < timed.length - 1 ? transportsByFrom.get(item.id) : undefined;
        const next = timed[idx + 1];
        const copied = justCopiedId === item.id;
        return (
          <div key={item.id}>
            <div className="group flex items-stretch gap-2 py-1">
              <div className="flex w-[34px] flex-col items-end pt-1.5">
                <span className="font-mono text-[11px] text-ink leading-tight">{item.startTime}</span>
                <span className="font-mono text-[10px] text-muted-soft leading-tight">{item.endTime}</span>
              </div>
              <div className="flex flex-1 items-center gap-2 rounded-md border border-hairline bg-canvas p-1.5">
                <PlaceIconChip iconKey={place.iconKey} size={16} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-ink">{place.name}</p>
                  <p className="truncate text-[10px] text-muted">
                    <Star size={9} className="-mt-0.5 inline fill-warning stroke-warning" />{" "}
                    {place.rating} · {fmtMinutes(item.durationMin)}
                  </p>
                </div>
                <button
                  onClick={() => handleCopy(item.id)}
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-muted-soft opacity-0 transition-opacity hover:bg-surface-card hover:text-ink group-hover:opacity-100"
                  title={`複製到「${targetPlanName}」`}
                >
                  {copied ? <ClipboardCheck size={12} className="text-success" /> : <Copy size={12} />}
                </button>
              </div>
            </div>
            {transport && next && (
              <div className="ml-[42px] flex items-center gap-1 py-px text-[10px] text-muted">
                <span className="text-muted-soft">{modeLabel(transport.mode)}</span>
                <span className="text-muted-soft">·</span>
                <span className="font-mono">{fmtDuration(transport.durationSec)}</span>
                <span className="text-muted-soft">·</span>
                <span className="font-mono">{fmtDistance(transport.distanceM)}</span>
              </div>
            )}
          </div>
        );
      })}

      {timed.length === 0 && (
        <div className="rounded-md border border-dashed border-hairline p-4 text-center text-caption text-muted-soft">
          此方案的 Day {day.dayIndex} 尚未排定
        </div>
      )}
    </div>
  );
}

function fmtMinutes(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h}小時` : `${h}小時${m}分`;
  }
  return `${min}分`;
}
function formatFull(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function planIndexHash(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997;
  return h;
}
