"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Footprints, TrainFront, Car, Lock, Ticket, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Hand, Plus } from "lucide-react";
import { fmtDistance, fmtDuration, getPlace, modeLabel, type MockDay } from "@/lib/mock-schedule";
import { PlaceSearchDialog } from "@/components/editor/PlaceSearchDialog";
import { splitTransportAndInsertPlaceAction } from "@/app/(actions)/schedule-actions";
import { useDayOptimistic } from "@/components/editor/use-day-optimistic";
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
  FLIGHT: { bg: "bg-brand-accent/12", bar: "bg-brand-accent", text: "text-ink" },
  TRAIN: { bg: "bg-badge-violet/12", bar: "bg-badge-violet", text: "text-ink" },
  CAR_RENTAL: { bg: "bg-warning/15", bar: "bg-warning", text: "text-ink" },
  TRANSPORT_STOP: { bg: "bg-surface-card", bar: "bg-muted", text: "text-muted" },
};
const FALLBACK_KIND_STYLE = { bg: "bg-surface-card", bar: "bg-muted", text: "text-muted" };

export function WeekGridView({
  days,
  tripId,
  selectedItemId,
  selectedDayId,
  onSelectItem,
  onFocusItem,
  onUpdateItemTimes,
  onMoveItemToDay,
  hasGoogleKey,
}: {
  days: MockDay[];
  // Phase 12d — required for click-on-transit and drag-placeholder insert flows.
  tripId?: string;
  selectedItemId?: string;
  selectedDayId?: string;
  onSelectItem: (id: string) => void;
  // Double-click handler — used by EditorShell to fly the map to that pin.
  onFocusItem?: (id: string) => void;
  onUpdateItemTimes?: (itemId: string, startTime: string, endTime: string) => void;
  onMoveItemToDay?: (itemId: string, targetDayId: string) => void;
  // Forwarded to PlaceSearchDialog for the insert flow.
  hasGoogleKey?: boolean;
}) {
  // Phase 12d — modal state for the click-on-transit / drag-placeholder
  // insert flow. Hosted at the WeekGridView level so it overlays everything.
  const [insertContext, setInsertContext] = useState<{
    tripId: string;
    transportId: string;
    dayId: string;
    atTime: string; // HH:MM
  } | null>(null);
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

              {days.map((d, i) => (
                <OptimisticDayColumn
                  key={d.id}
                  day={d}
                  tripId={tripId}
                  hourPx={hourPx}
                  selectedItemId={selectedItemId}
                  onSelectItem={onSelectItem}
                  onFocusItem={onFocusItem}
                  daysList={days}
                  dayIndex={i}
                  fallbackUpdateItemTimes={onUpdateItemTimes}
                  fallbackMoveItemToDay={onMoveItemToDay}
                  onTransportClick={
                    tripId
                      ? (transportId, atTime) =>
                          setInsertContext({
                            tripId,
                            transportId,
                            dayId: d.id,
                            atTime,
                          })
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      {insertContext && (
        <PlaceSearchDialog
          tripId={insertContext.tripId}
          dayId={insertContext.dayId}
          hasGoogleKey={hasGoogleKey}
          onClose={() => setInsertContext(null)}
          onPickOverride={async (place, kind) => {
            await splitTransportAndInsertPlaceAction({
              tripId: insertContext.tripId,
              transportId: insertContext.transportId,
              googlePlace: place,
              kind: kind as
                | "ATTRACTION"
                | "MEAL"
                | "LODGING"
                | "FREE"
                | "TRANSPORT_STOP"
                | "FLIGHT"
                | "CAR_RENTAL"
                | "TRAIN",
              atTime: insertContext.atTime,
            });
          }}
        />
      )}
    </div>
  );
}

// Phase 12f — wrap DayColumn with the optimistic store. When tripId is
// supplied, gestures dispatch into a per-day batch (debounced 600ms) instead
// of firing the legacy per-action callbacks. When tripId is missing (e.g. the
// dashboard preview), we fall through to the legacy callbacks unchanged.
function OptimisticDayColumn({
  day,
  tripId,
  hourPx,
  selectedItemId,
  onSelectItem,
  onFocusItem,
  daysList,
  dayIndex,
  fallbackUpdateItemTimes,
  fallbackMoveItemToDay,
  onTransportClick,
}: {
  day: MockDay;
  tripId?: string;
  hourPx: number;
  selectedItemId?: string;
  onSelectItem: (id: string) => void;
  onFocusItem?: (id: string) => void;
  daysList: MockDay[];
  dayIndex: number;
  fallbackUpdateItemTimes?: (itemId: string, startTime: string, endTime: string) => void;
  fallbackMoveItemToDay?: (itemId: string, targetDayId: string) => void;
  onTransportClick?: (transportId: string, atTime: string) => void;
}) {
  const opt = useDayOptimistic(tripId ?? "", day.id, day.version ?? 0);
  const useOptimistic = !!tripId;
  return (
    <DayColumn
      day={day}
      hourPx={hourPx}
      selectedItemId={selectedItemId}
      onSelectItem={onSelectItem}
      onFocusItem={onFocusItem}
      daysList={daysList}
      dayIndex={dayIndex}
      onUpdateItemTimes={
        useOptimistic
          ? (itemId, startTime, endTime) =>
              opt.dispatchOp({ kind: "updateTimes", itemId, startTime, endTime })
          : fallbackUpdateItemTimes
      }
      onMoveItemToDay={
        useOptimistic
          ? (itemId, targetDayId) =>
              opt.dispatchOp({ kind: "moveToDay", itemId, targetDayId })
          : fallbackMoveItemToDay
      }
      onTransportClick={onTransportClick}
      pendingCount={opt.pendingCount}
    />
  );
}

function DayColumn({
  day,
  hourPx,
  selectedItemId,
  onSelectItem,
  onFocusItem,
  daysList,
  dayIndex,
  onUpdateItemTimes,
  onMoveItemToDay,
  onTransportClick,
  pendingCount,
}: {
  day: MockDay;
  hourPx: number;
  selectedItemId?: string;
  onSelectItem: (id: string) => void;
  onFocusItem?: (id: string) => void;
  daysList: MockDay[];
  dayIndex: number;
  onUpdateItemTimes?: (itemId: string, startTime: string, endTime: string) => void;
  onMoveItemToDay?: (itemId: string, targetDayId: string) => void;
  // Phase 12d — fired when user clicks on a transit block; the WeekGridView
  // root opens PlaceSearchDialog at the resolved time to insert a place.
  onTransportClick?: (transportId: string, atTime: string) => void;
  // Phase 12f — when > 0, render a small "saving..." pip in the header.
  pendingCount?: number;
}) {
  const totalHeight = HOURS.length * hourPx;
  const transports = useMemo(() => day.transports, [day.transports]);
  void pendingCount; // Phase 12f — pip indicator deferred; data still flushes correctly.
  // Detect overlapping timed items so we can soft-warn (red dashed border)
  // — Q7 in plan.md decisions: warn but don't block.
  const conflictIds = useMemo(() => {
    const out = new Set<string>();
    const timed = day.items
      .filter((i) => !i.isAllDay)
      .map((i) => ({ id: i.id, s: parseTimeMinutes(i.startTime), e: parseTimeMinutes(i.endTime) }));
    for (let i = 0; i < timed.length; i++) {
      for (let j = i + 1; j < timed.length; j++) {
        if (timed[i].s < timed[j].e && timed[j].s < timed[i].e) {
          out.add(timed[i].id);
          out.add(timed[j].id);
        }
      }
    }
    return out;
  }, [day.items]);

  // ─ Drag / resize state ──────────────────────────────────────────────────
  // For the duration of a drag we render the affected block at a preview
  // offset (vertical) without committing to DB; on pointer-up we call the
  // server action with the resolved start/end (and target day).
  const [drag, setDrag] = useState<{
    itemId: string;
    mode: "move" | "resize";
    startMin: number;        // original startMin
    endMin: number;          // original endMin
    deltaMin: number;        // for move/resize (in 5-min steps)
    deltaCol: number;        // for move only
    pointerStartX: number;
    pointerStartY: number;
  } | null>(null);

  // Snap to 5-minute increments
  const snapMinutes = (m: number) => Math.round(m / 5) * 5;

  function startMove(e: React.PointerEvent, itemId: string, sMin: number, eMin: number) {
    if (!onUpdateItemTimes) return;
    e.stopPropagation();
    e.preventDefault();
    setDrag({
      itemId,
      mode: "move",
      startMin: sMin,
      endMin: eMin,
      deltaMin: 0,
      deltaCol: 0,
      pointerStartX: e.clientX,
      pointerStartY: e.clientY,
    });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function startResize(e: React.PointerEvent, itemId: string, sMin: number, eMin: number) {
    if (!onUpdateItemTimes) return;
    e.stopPropagation();
    e.preventDefault();
    setDrag({
      itemId,
      mode: "resize",
      startMin: sMin,
      endMin: eMin,
      deltaMin: 0,
      deltaCol: 0,
      pointerStartX: e.clientX,
      pointerStartY: e.clientY,
    });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    e.stopPropagation();
    const dy = e.clientY - drag.pointerStartY;
    const minutes = snapMinutes((dy / hourPx) * 60);
    if (drag.mode === "resize") {
      setDrag({ ...drag, deltaMin: minutes });
    } else {
      const dx = e.clientX - drag.pointerStartX;
      const deltaCol = Math.round(dx / COL_PX);
      setDrag({ ...drag, deltaMin: minutes, deltaCol });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!drag) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    const { itemId, mode, startMin, endMin, deltaMin, deltaCol } = drag;
    setDrag(null);

    if (mode === "resize") {
      const newEnd = Math.max(startMin + 15, endMin + deltaMin);
      if (newEnd === endMin) return;
      onUpdateItemTimes?.(itemId, fmtMinutes(startMin), fmtMinutes(newEnd));
      return;
    }
    // move
    const newStart = Math.max(0, startMin + deltaMin);
    const newEnd = newStart + (endMin - startMin);
    const targetIdx = Math.max(0, Math.min(daysList.length - 1, dayIndex + deltaCol));
    const targetDay = daysList[targetIdx];
    const movedDay = targetDay && targetDay.id !== day.id;
    if (!movedDay && newStart === startMin) return;
    if (movedDay && onMoveItemToDay && targetDay) {
      onMoveItemToDay(itemId, targetDay.id);
      // Also update the time in the new day
      if (newStart !== startMin) onUpdateItemTimes?.(itemId, fmtMinutes(newStart), fmtMinutes(newEnd));
    } else {
      onUpdateItemTimes?.(itemId, fmtMinutes(newStart), fmtMinutes(newEnd));
    }
  }

  return (
    <div
      className="relative flex-shrink-0 border-r border-hairline-soft"
      style={{ width: COL_PX, height: totalHeight }}
      onPointerMove={drag ? onPointerMove : undefined}
      onPointerUp={drag ? onPointerUp : undefined}
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
          const sMin = start * 60;
          const eMin = end * 60;
          const place = getPlace(item.placeId);
          const style = kindStyle[item.kind] ?? FALLBACK_KIND_STYLE;
          if (!place || start < START_HOUR) return null;
          const selected = selectedItemId === item.id;
          const isDragging = drag?.itemId === item.id;
          // Apply drag preview offsets
          const previewStart = isDragging
            ? drag.mode === "move"
              ? sMin + drag.deltaMin
              : sMin
            : sMin;
          const previewEnd = isDragging
            ? drag.mode === "resize"
              ? eMin + drag.deltaMin
              : eMin + (drag.mode === "move" ? drag.deltaMin : 0)
            : eMin;
          const previewCol = isDragging && drag.mode === "move" ? drag.deltaCol : 0;
          const top = (previewStart / 60 - START_HOUR) * hourPx;
          const height = ((previewEnd - previewStart) / 60) * hourPx;
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                if (isDragging) return;
                e.stopPropagation();
                onSelectItem(item.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onFocusItem?.(item.id);
              }}
              onPointerDown={(e) => startMove(e, item.id, sMin, eMin)}
              style={{
                top,
                height: Math.max(height - 2, 22),
                transform: previewCol ? `translateX(${previewCol * COL_PX}px)` : undefined,
                zIndex: isDragging ? 20 : undefined,
              }}
              className={`absolute left-1 right-1 flex flex-col gap-0.5 overflow-hidden rounded-md border p-1 text-left transition-shadow ${style.bg} ${
                conflictIds.has(item.id)
                  ? "border-error border-dashed shadow-[0_0_0_1px_rgba(239,68,68,0.25)]"
                  : selected
                    ? "border-ink shadow-soft-elevation"
                    : "border-hairline hover:border-ink/40"
              } ${isDragging ? "opacity-80 ring-1 ring-ink/40" : ""} ${onUpdateItemTimes ? "cursor-grab active:cursor-grabbing" : ""}`}
              title={conflictIds.has(item.id) ? "⚠️ 此區間與其他項目重疊" : undefined}
            >
              <div className="flex items-center gap-1">
                <span className={`block h-3 w-0.5 flex-shrink-0 ${style.bar}`} />
                <PlaceIconBare iconKey={place.iconKey} size={10} className="flex-shrink-0" />
                <span className="font-mono text-[10px] text-muted leading-none">
                  {fmtMinutes(previewStart)}
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
              {/* Resize handle (bottom edge) */}
              {onUpdateItemTimes && (
                <div
                  onPointerDown={(e) => startResize(e, item.id, sMin, eMin)}
                  className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize hover:bg-ink/30"
                  title="拖曳調整時長"
                />
              )}
            </div>
          );
        })}

      {transports.map((t) => {
        const fromItem = day.items.find((i) => i.id === t.fromItemId);
        const toItem = day.items.find((i) => i.id === t.toItemId);
        if (!fromItem || !toItem) return null;
        const startMin = parseTimeMinutes(fromItem.endTime);
        const endMin = parseTimeMinutes(toItem.startTime);
        const top = ((startMin - START_HOUR * 60) / 60) * hourPx;
        // Phase 12d — free transit (isFree or 0 sec) → 0 height visual
        // (places sit flush, dashed line marks the seam). Locked transit
        // gets a colored bar proportional to durationSec.
        const isFree = t.isFree === true || t.durationSec <= 0;
        const height = isFree ? 0 : ((endMin - startMin) / 60) * hourPx;
        const TIcon = t.mode === "WALKING" ? Footprints : t.mode === "TRANSIT" ? TrainFront : Car;
        return (
          <TransportSlot
            key={`${t.fromItemId}-${t.toItemId}`}
            top={top}
            height={height}
            isFree={isFree}
            mode={t.mode}
            durationSec={t.durationSec}
            distanceM={t.distanceM}
            displayColor={t.displayColor ?? null}
            transportId={t.id ?? null}
            startMin={startMin}
            hourPx={hourPx}
            onTransportClick={onTransportClick}
            Icon={TIcon}
          />
        );
      })}
    </div>
  );
}

// Phase 12d — transport visual: locked transit = colored vertical bar with
// hover ghost line + click-to-insert-place; free transit = dashed 0-height
// seam (also clickable to insert).
function TransportSlot({
  top,
  height,
  isFree,
  mode,
  durationSec,
  distanceM,
  displayColor,
  transportId,
  startMin,
  hourPx,
  onTransportClick,
  Icon,
}: {
  top: number;
  height: number;
  isFree: boolean;
  mode: string;
  durationSec: number;
  distanceM: number;
  displayColor: string | null;
  transportId: string | null;
  startMin: number;
  hourPx: number;
  onTransportClick?: (transportId: string, atTime: string) => void;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const clickable = !!(onTransportClick && transportId);

  function timeFromY(clientY: number): string {
    if (!wrapRef.current) return "00:00";
    const rect = wrapRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const minOffset = (y / hourPx) * 60;
    const total = startMin + Math.round(minOffset / 5) * 5;
    return fmtMinutes(total);
  }

  function handleClick(e: React.MouseEvent) {
    if (!clickable) return;
    e.stopPropagation();
    onTransportClick!(transportId!, timeFromY(e.clientY));
  }

  // Free segment: render a thin dashed clickable strip exactly at the seam.
  if (isFree) {
    return (
      <div
        ref={wrapRef}
        onMouseMove={(e) => clickable && setHoverY(e.clientY - (wrapRef.current?.getBoundingClientRect().top ?? 0))}
        onMouseLeave={() => setHoverY(null)}
        onClick={handleClick}
        style={{ top: top - 2, height: 4 }}
        className={`absolute left-1 right-1 ${clickable ? "cursor-copy" : ""}`}
        title={clickable ? "點擊插入景點 · 此段尚未設定移動方式" : "尚未設定移動方式"}
      >
        <div className="border-t border-dashed border-muted-soft" />
      </div>
    );
  }

  const bg = displayColor ?? "#3b82f6"; // brand-accent fallback
  return (
    <div
      ref={wrapRef}
      onMouseMove={(e) => clickable && setHoverY(e.clientY - (wrapRef.current?.getBoundingClientRect().top ?? 0))}
      onMouseLeave={() => setHoverY(null)}
      onClick={handleClick}
      style={{ top, height: Math.max(height, 4) }}
      className={`absolute left-1 right-1 flex items-center justify-center ${clickable ? "cursor-copy" : ""}`}
      title={`${modeLabel(mode as Parameters<typeof modeLabel>[0])} · ${fmtDuration(durationSec)} · ${fmtDistance(distanceM)}${clickable ? "（點擊插入景點）" : ""}`}
    >
      <div
        className="h-full rounded-full opacity-60"
        style={{ width: 3, background: bg }}
      />
      {height >= 16 && (
        <span className="pointer-events-none absolute flex items-center gap-0.5 rounded-sm bg-canvas/85 px-0.5 text-[9px] text-muted-soft">
          <Icon size={8} strokeWidth={2} />
          {Math.round(durationSec / 60)}m
        </span>
      )}
      {clickable && hoverY != null && (
        <div
          className="pointer-events-none absolute left-0 right-0 flex items-center justify-end gap-1"
          style={{ top: hoverY - 8 }}
        >
          <div className="h-px flex-1 border-t border-dashed border-ink/40" />
          <span className="rounded-pill bg-ink px-1.5 py-0.5 text-[9px] font-medium text-on-primary">
            <Plus size={9} className="mr-0.5 inline" strokeWidth={2.5} />
            插入景點
          </span>
        </div>
      )}
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
function fmtMinutes(min: number): string {
  const m = ((Math.round(min) % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
