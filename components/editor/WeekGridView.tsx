"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Footprints, TrainFront, Car, Lock, Ticket, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Hand } from "lucide-react";
import { fmtDistance, fmtDuration, getPlace, modeLabel, type MockDay } from "@/lib/mock-schedule";
import { PlaceIconBare } from "@/lib/place-icon";

const COL_PX = 200;        // fixed day-column width — independent of map resize
const TIME_GUTTER_PX = 56; // left time gutter

const HOUR_PX_DEFAULT = 56;
const HOUR_PX_MIN = 28;
const HOUR_PX_MAX = 120;

const START_HOUR = 6;
const END_HOUR = 23;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

const kindStyle: Record<string, { bg: string; bar: string; text: string }> = {
  ATTRACTION: { bg: "bg-badge-orange/12", bar: "bg-badge-orange", text: "text-ink" },
  MEAL: { bg: "bg-badge-pink/12", bar: "bg-badge-pink", text: "text-ink" },
  LODGING: { bg: "bg-badge-emerald/15", bar: "bg-badge-emerald", text: "text-ink" },
  FREE: { bg: "bg-surface-card", bar: "bg-muted", text: "text-muted" },
};

export function WeekGridView({
  days,
  selectedItemId,
  selectedDayId,
  onSelectItem,
}: {
  days: MockDay[];
  selectedItemId?: string;
  selectedDayId?: string;
  onSelectItem: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hourPx, setHourPx] = useState(HOUR_PX_DEFAULT);
  const [panning, setPanning] = useState(false);

  const totalGridWidth = TIME_GUTTER_PX + days.length * COL_PX;

  // Center the selected day on mount / when selection or column width changes
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.max(0, days.findIndex((d) => d.id === selectedDayId));
    if (idx < 0) return;
    const colCenter = TIME_GUTTER_PX + idx * COL_PX + COL_PX / 2;
    const viewport = el.clientWidth;
    el.scrollLeft = Math.max(0, colCenter - viewport / 2);
    // Also center vertically around 09:00 by default for travel context
    const targetTop = (9 - START_HOUR) * hourPx - 80;
    el.scrollTop = Math.max(0, targetTop);
    // Re-run only when these inputs change
  }, [selectedDayId, days, hourPx]);

  // Wheel: hold Cmd/Ctrl to zoom time axis. Otherwise normal scroll.
  // Cursor-anchored: keep the time under the cursor at the same screen Y.
  const onWheel = useCallback(
    (e: WheelEvent) => {
      const el = scrollRef.current;
      if (!el) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const cursorY = e.clientY - rect.top + el.scrollTop;
        const fraction = cursorY / hourPx;
        const next = clamp(hourPx - e.deltaY * 0.25, HOUR_PX_MIN, HOUR_PX_MAX);
        if (next === hourPx) return;
        setHourPx(next);
        // After state update, restore cursor anchor
        requestAnimationFrame(() => {
          if (!scrollRef.current) return;
          const newY = fraction * next;
          scrollRef.current.scrollTop = newY - (e.clientY - rect.top);
        });
        return;
      }
      // Plain wheel — convert vertical wheel into horizontal scroll if shift held
      if (e.shiftKey) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
      // else: native vertical scroll
    },
    [hourPx],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  // Pointer-drag panning (click-and-drag on empty area to scroll)
  const dragRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  function onPointerDown(e: React.PointerEvent) {
    // Only start panning when clicking on empty area (not on event blocks).
    // Event blocks call stopPropagation, so reaching here means background.
    const el = scrollRef.current;
    if (!el) return;
    setPanning(true);
    dragRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!panning || !dragRef.current || !scrollRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    scrollRef.current.scrollLeft = dragRef.current.sl - dx;
    scrollRef.current.scrollTop = dragRef.current.st - dy;
  }
  function onPointerUp(e: React.PointerEvent) {
    setPanning(false);
    dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  const scrollByDays = (n: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: n * COL_PX, behavior: "smooth" });
  };

  return (
    <div className="flex h-full flex-col bg-canvas">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-hairline-soft bg-canvas px-3 py-1.5">
        <button onClick={() => scrollByDays(-1)} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-card hover:text-ink" title="上一天">
          <ChevronLeft size={14} />
        </button>
        <button onClick={() => scrollByDays(1)} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-card hover:text-ink" title="下一天">
          <ChevronRight size={14} />
        </button>
        <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-muted-soft">
          <Hand size={10} strokeWidth={2} />
          拖曳平移 · Shift+滾輪左右 · ⌘/Ctrl+滾輪縮放
        </span>
        <div className="ml-auto flex items-center gap-1 rounded-md border border-hairline bg-canvas">
          <button
            onClick={() => setHourPx((h) => clamp(h - 12, HOUR_PX_MIN, HOUR_PX_MAX))}
            className="flex h-7 w-7 items-center justify-center text-muted hover:bg-surface-card hover:text-ink"
            title="縮小時間軸"
          >
            <ZoomOut size={12} />
          </button>
          <span className="px-1 font-mono text-[10px] text-muted-soft">{Math.round((hourPx / HOUR_PX_DEFAULT) * 100)}%</span>
          <button
            onClick={() => setHourPx((h) => clamp(h + 12, HOUR_PX_MIN, HOUR_PX_MAX))}
            className="flex h-7 w-7 items-center justify-center text-muted hover:bg-surface-card hover:text-ink"
            title="放大時間軸"
          >
            <ZoomIn size={12} />
          </button>
        </div>
      </div>

      {/* Sticky header (date row + all-day) — scrolls horizontally with the grid */}
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          className={`h-full overflow-auto ${panning ? "cursor-grabbing" : "cursor-grab"}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div style={{ width: totalGridWidth }}>
            {/* Sticky stack: date header + all-day lane share one sticky group */}
            <div className="sticky top-0 z-30 bg-canvas">
            {/* Date header */}
            <div className="flex border-b border-hairline bg-canvas">
              <div style={{ width: TIME_GUTTER_PX }} className="flex-shrink-0 border-r border-hairline" />
              {days.map((d) => {
                const isCurrent = d.id === selectedDayId;
                const labelCls = `text-[10px] uppercase tracking-wide ${isCurrent ? "text-ink" : "text-muted-soft"}`;
                return (
                  <div
                    key={d.id}
                    style={{ width: COL_PX }}
                    className="flex flex-shrink-0 flex-col items-center justify-center border-r border-hairline-soft py-1.5"
                  >
                    <p className={labelCls}>DAY {d.dayIndex}</p>
                    <p className={labelCls}>週{d.weekday}</p>
                    <p className={`text-title-md leading-tight ${isCurrent ? "text-ink" : "text-body"}`}>
                      {new Date(d.date).getDate()}
                      {isCurrent && (
                        <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-brand-accent align-middle" />
                      )}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* All-day lane */}
            <div className="flex border-b border-hairline bg-surface-soft">
              <div
                style={{ width: TIME_GUTTER_PX }}
                className="flex flex-shrink-0 items-center justify-end border-r border-hairline pr-1.5 text-[10px] text-muted-soft"
              >
                整日
              </div>
              {days.map((d) => {
                const allDay = d.items.filter((i) => i.isAllDay);
                return (
                  <div
                    key={d.id}
                    style={{ width: COL_PX }}
                    className="relative h-7 flex-shrink-0 border-r border-hairline-soft"
                  >
                    {allDay.map((item) => {
                      const place = getPlace(item.placeId);
                      if (!place) return null;
                      return (
                        <button
                          key={item.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectItem(item.id);
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="absolute inset-0.5 flex items-center gap-1 rounded-sm bg-badge-emerald/20 px-1.5 text-[10px] text-ink hover:bg-badge-emerald/30"
                        >
                          <PlaceIconBare iconKey={place.iconKey} size={10} />
                          <span className="truncate">{place.name}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            </div>{/* /sticky stack */}

            {/* Time grid */}
            <div className="flex">
              <div
                style={{ width: TIME_GUTTER_PX }}
                className="sticky left-0 z-20 flex-shrink-0 border-r border-hairline bg-canvas"
              >
                {HOURS.map((h) => (
                  <div
                    key={h}
                    style={{ height: hourPx }}
                    className="relative -mt-2 pr-1.5 text-right font-mono text-[10px] text-muted-soft"
                  >
                    {h.toString().padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {days.map((d) => (
                <DayColumn
                  key={d.id}
                  day={d}
                  hourPx={hourPx}
                  selectedItemId={selectedItemId}
                  onSelectItem={onSelectItem}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DayColumn({
  day,
  hourPx,
  selectedItemId,
  onSelectItem,
}: {
  day: MockDay;
  hourPx: number;
  selectedItemId?: string;
  onSelectItem: (id: string) => void;
}) {
  const totalHeight = HOURS.length * hourPx;
  const transports = useMemo(() => day.transports, [day.transports]);

  return (
    <div
      className="relative flex-shrink-0 border-r border-hairline-soft"
      style={{ width: COL_PX, height: totalHeight }}
    >
      {HOURS.map((h, i) => (
        <div
          key={h}
          style={{ top: i * hourPx, height: hourPx }}
          className="absolute left-0 right-0 border-t border-hairline-soft"
        />
      ))}
      {HOURS.map((h, i) => (
        <div
          key={`half-${h}`}
          style={{ top: i * hourPx + hourPx / 2 }}
          className="absolute left-0 right-0 border-t border-dashed border-hairline-soft opacity-40"
        />
      ))}

      {day.items
        .filter((i) => !i.isAllDay)
        .map((item) => {
          const start = parseTime(item.startTime);
          const end = parseTime(item.endTime);
          const top = (start - START_HOUR) * hourPx;
          const height = (end - start) * hourPx;
          const place = getPlace(item.placeId);
          const style = kindStyle[item.kind];
          if (!place || top < 0) return null;
          const selected = selectedItemId === item.id;
          return (
            <button
              key={item.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectItem(item.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ top, height: Math.max(height - 2, 22) }}
              className={`absolute left-1 right-1 flex flex-col gap-0.5 overflow-hidden rounded-md border p-1 text-left transition-shadow ${style.bg} ${
                selected
                  ? "border-ink shadow-soft-elevation"
                  : "border-transparent hover:border-ink/30"
              }`}
            >
              <div className="flex items-center gap-1">
                <span className={`block h-3 w-0.5 flex-shrink-0 ${style.bar}`} />
                <PlaceIconBare iconKey={place.iconKey} size={10} className="flex-shrink-0" />
                <span className="font-mono text-[10px] text-muted leading-none">
                  {item.startTime}
                </span>
                {item.isTimeLocked && <Lock size={9} strokeWidth={2} className="text-muted-soft" />}
                {item.hasTicket && <Ticket size={9} strokeWidth={2} className="text-warning" />}
              </div>
              <p className={`truncate text-[11px] font-medium leading-tight ${style.text}`}>
                {place.name}
              </p>
              {height >= hourPx * 1.2 && (
                <p className="truncate text-[10px] text-muted">⭐ {place.rating} · {place.category}</p>
              )}
            </button>
          );
        })}

      {transports.map((t) => {
        const fromItem = day.items.find((i) => i.id === t.fromItemId);
        const toItem = day.items.find((i) => i.id === t.toItemId);
        if (!fromItem || !toItem) return null;
        const startMin = parseTimeMinutes(fromItem.endTime);
        const endMin = parseTimeMinutes(toItem.startTime);
        if (endMin <= startMin) return null;
        const top = ((startMin - START_HOUR * 60) / 60) * hourPx;
        const height = ((endMin - startMin) / 60) * hourPx;
        const TIcon = t.mode === "WALKING" ? Footprints : t.mode === "TRANSIT" ? TrainFront : Car;
        return (
          <div
            key={`${t.fromItemId}-${t.toItemId}`}
            style={{ top, height: Math.max(height, 4) }}
            className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center"
            title={`${modeLabel(t.mode)} · ${fmtDuration(t.durationSec)} · ${fmtDistance(t.distanceM)}`}
          >
            <div className="h-full w-1 rounded-full bg-gradient-to-b from-brand-accent/35 to-brand-accent/10" />
            {height >= 16 && (
              <span className="absolute flex items-center gap-0.5 rounded-sm bg-canvas/85 px-0.5 text-[9px] text-muted-soft">
                <TIcon size={8} strokeWidth={2} />
                {Math.round(t.durationSec / 60)}m
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + m / 60;
}
function parseTimeMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
