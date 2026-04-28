"use client";

import { Star, Lock, Ticket, Footprints, TrainFront, Car, ParkingCircle, MoreVertical, Plus } from "lucide-react";
import {
  fmtDistance,
  fmtDuration,
  getPlace,
  modeLabel,
  type MockDay,
  type MockScheduleItem,
  type MockTransport,
} from "@/lib/mock-schedule";
import { PlaceIconChip } from "@/lib/place-icon";
import { PriceWithLocal } from "@/components/common/PriceWithLocal";

const kindBadge: Record<string, { label: string; cls: string }> = {
  ATTRACTION: { label: "景點", cls: "bg-badge-orange/15 text-ink" },
  MEAL: { label: "餐飲", cls: "bg-badge-pink/15 text-ink" },
  LODGING: { label: "住宿", cls: "bg-badge-emerald/15 text-ink" },
  FREE: { label: "自由", cls: "bg-surface-card text-muted" },
};

export function ScheduleListView({
  day,
  selectedItemId,
  onSelectItem,
}: {
  day: MockDay;
  selectedItemId?: string;
  onSelectItem: (id: string) => void;
}) {
  const allDayItems = day.items.filter((i) => i.isAllDay);
  const timedItems = day.items.filter((i) => !i.isAllDay);

  const transportsByFrom = new Map<string, MockTransport>();
  for (const t of day.transports) transportsByFrom.set(t.fromItemId, t);

  return (
    <div className="px-md py-md">
      {/* Day header */}
      <div className="mb-sm flex items-end justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-soft">DAY {day.dayIndex}</p>
          <h2 className="mt-px text-title-md text-ink">{formatFull(day.date)}（週{day.weekday}）</h2>
        </div>
        <div className="text-right text-caption text-muted">
          <p>
            <span className="text-ink">{timedItems.length}</span> 個項目
            {timedItems.length > 0 && (
              <span className="ml-2 font-mono text-muted-soft">
                {timedItems[0].startTime}–{timedItems[timedItems.length - 1].endTime}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* All-day strip */}
      {allDayItems.length > 0 && (
        <div className="mb-sm">
          {allDayItems.map((item) => {
            const place = getPlace(item.placeId);
            if (!place) return null;
            return (
              <button
                key={item.id}
                onClick={() => onSelectItem(item.id)}
                className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
                  selectedItemId === item.id
                    ? "border-primary bg-primary/5"
                    : "border-hairline bg-surface-soft hover:border-ink"
                }`}
              >
                <PlaceIconChip iconKey={place.iconKey} size={14} />
                <div className="flex-1 min-w-0">
                  <p className="text-caption text-ink truncate">{place.name}</p>
                  <p className="text-[11px] text-muted truncate">
                    {place.category} · {place.address}
                  </p>
                </div>
                <span className="rounded-pill bg-badge-emerald/15 px-1.5 py-0.5 text-[10px] text-ink">
                  整日 · 住宿
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Timed items */}
      <div className="relative">
        {/* Time rail */}
        <div className="absolute left-[44px] top-1 bottom-1 w-px bg-hairline" />

        {timedItems.map((item, idx) => {
          const next = timedItems[idx + 1];
          const transport = transportsByFrom.get(item.id);
          return (
            <div key={item.id}>
              <ScheduleCard
                item={item}
                selected={selectedItemId === item.id}
                onSelect={() => onSelectItem(item.id)}
              />
              {next && transport && (
                <TransportRow transport={transport} nextStartTime={next.startTime} />
              )}
            </div>
          );
        })}

        {/* Add item */}
        <div className="ml-[64px] mt-sm">
          <button className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-hairline py-2 text-caption text-muted hover:border-primary hover:text-primary">
            <Plus size={12} strokeWidth={2.2} /> 新增景點 / 餐廳 / 自由時間
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduleCard({
  item,
  selected,
  onSelect,
}: {
  item: MockScheduleItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const place = getPlace(item.placeId);
  const badge = kindBadge[item.kind];
  if (!place) return null;
  return (
    <div className="flex items-stretch gap-2 py-1">
      {/* Time column */}
      <div className="flex w-[36px] flex-col items-end pt-2">
        <span className="font-mono text-caption text-ink leading-tight">{item.startTime}</span>
        <span className="font-mono text-[10px] text-muted-soft leading-tight">{item.endTime}</span>
        {item.isTimeLocked && <Lock size={10} strokeWidth={2} className="mt-0.5 text-muted-soft" />}
      </div>

      {/* Marker */}
      <div className="relative flex w-3 flex-shrink-0 items-start pt-2.5">
        <span
          className={`relative z-10 h-3 w-3 rounded-full border-2 ${
            selected ? "border-brand-accent bg-brand-accent" : "border-ink bg-canvas"
          }`}
        />
      </div>

      {/* Card */}
      <button
        onClick={onSelect}
        className={`flex flex-1 cursor-pointer items-center gap-2.5 rounded-md border p-2 text-left transition-all ${
          selected
            ? "border-ink bg-canvas shadow-soft-elevation"
            : "border-hairline bg-canvas hover:border-ink/40"
        }`}
      >
        {/* Icon chip (auto-resolved by category) */}
        <PlaceIconChip iconKey={place.iconKey} size={20} />

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="truncate text-body-sm text-ink leading-tight">{place.name}</h3>
            <span className={`rounded-pill px-1.5 py-px text-[10px] ${badge.cls}`}>{badge.label}</span>
            {item.hasTicket && (
              <span className="inline-flex items-center gap-0.5 rounded-pill bg-warning/15 px-1.5 py-px text-[10px] text-ink">
                <Ticket size={9} strokeWidth={2} /> 已訂
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2.5 text-[11px] text-muted">
            <span className="flex items-center gap-0.5">
              <Star size={10} fill="#d4a017" stroke="#d4a017" />
              <span className="text-ink">{place.rating}</span>
              <span className="text-muted-soft">({place.ratingCount.toLocaleString()})</span>
            </span>
            <span className="text-muted-soft">·</span>
            <span>{fmtMinutes(item.durationMin)}</span>
            <span className="text-muted-soft">·</span>
            <span className="truncate">{place.category}</span>
            {item.note && (
              <>
                <span className="text-muted-soft">·</span>
                <span className="truncate text-muted-soft">{item.note}</span>
              </>
            )}
          </div>
        </div>

        <MoreVertical size={14} className="text-muted-soft" />
      </button>
    </div>
  );
}

function TransportRow({
  transport,
  nextStartTime,
}: {
  transport: MockTransport;
  nextStartTime: string;
}) {
  const isDriving = transport.mode === "DRIVING";
  const Icon = transport.mode === "WALKING" ? Footprints : transport.mode === "TRANSIT" ? TrainFront : Car;
  return (
    <div className="ml-[64px] flex items-center gap-2 py-0.5">
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-card text-muted">
        <Icon size={11} strokeWidth={1.8} />
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-1 text-[11px] text-muted">
        <span>{modeLabel(transport.mode)}</span>
        <span className="text-muted-soft">·</span>
        <span className="font-mono text-ink">{fmtDuration(transport.durationSec)}</span>
        <span className="text-muted-soft">·</span>
        <span className="font-mono">{fmtDistance(transport.distanceM)}</span>
        {transport.estimatedCost ? (
          <>
            <span className="text-muted-soft">·</span>
            <PriceWithLocal amount={transport.estimatedCost} size="sm" inline />
          </>
        ) : null}
        {isDriving && (
          <span className="ml-1 inline-flex items-center gap-0.5 rounded-pill bg-warning/15 px-1.5 py-px text-[10px] text-ink">
            <ParkingCircle size={10} strokeWidth={2} /> 規劃停車場
          </span>
        )}
        <span className="ml-auto font-mono text-muted-soft">→ {nextStartTime}</span>
      </div>
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
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
