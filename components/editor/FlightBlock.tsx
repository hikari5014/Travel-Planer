"use client";

import { useState } from "react";
import {
  Plane,
  ChevronDown,
  ChevronUp,
  Star,
  GripVertical,
  MoreVertical,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getPlace, type MockScheduleItem, type MockTransport } from "@/lib/mock-schedule";

// Phase 14m commit 6 — FLIGHT pair + transport rendered as one expandable
// block in the schedule list. Replaces the previous 3-row layout (dep item
// row + transport row + arr item row).
//
// Total time span shown = depItem.startTime → arrItem.endTime, which after
// commit 6's data-model change covers (arrive at dep airport - checkInBuf)
// → (arr airport time + immigrationBuf), i.e. the full airport-to-airport
// footprint instead of just the in-air segment.

export function FlightBlock({
  depItem,
  arrItem,
  transport,
  selected,
  onSelect,
  onDelete,
}: {
  depItem: MockScheduleItem;
  arrItem: MockScheduleItem;
  transport: MockTransport;
  selected: boolean;
  onSelect: (anchorEl?: HTMLElement | null) => void;
  onDelete?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = (depItem.metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const bool = (v: unknown): boolean => v === true;

  const flightNumber = str(meta.flightNumber);
  const airline = str(meta.airline);
  const depAirport = str(meta.depAirport);
  const arrAirport = str(meta.arrAirport);
  const depTime = str(meta.depTime) ?? depItem.endTime;
  const arrTime = str(meta.arrTime) ?? arrItem.startTime;
  const checkInBuf = num(meta.checkInBufferMin);
  const immigrationBuf = num(meta.immigrationBufferMin);
  const flightDurationSec = transport.durationSec;
  const flightDurationLabel = formatDur(flightDurationSec);

  const depPlace = depItem.placeId ? getPlace(depItem.placeId) : undefined;
  const arrPlace = arrItem.placeId ? getPlace(arrItem.placeId) : undefined;

  const sortable = useSortable({ id: depItem.id });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={`group relative my-2 rounded-lg border bg-canvas transition-colors ${
        selected ? "border-ink shadow-soft-elevation" : "border-hairline hover:border-ink/40"
      } ${sortable.isDragging ? "z-10" : ""}`}
      onClick={(e) => onSelect(e.currentTarget)}
    >
      {/* Drag handle */}
      <button
        type="button"
        {...sortable.attributes}
        {...sortable.listeners}
        onClick={(e) => e.stopPropagation()}
        className="absolute left-1.5 top-3 cursor-grab text-muted-soft hover:text-muted active:cursor-grabbing"
        aria-label="拖曳整段飛航"
      >
        <GripVertical size={12} strokeWidth={1.6} />
      </button>

      {/* Header row */}
      <div className="flex items-start gap-3 px-7 py-2.5">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-brand-accent/10">
          <Plane size={16} strokeWidth={1.8} className="text-brand-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold text-ink">{flightNumber ?? "—"}</span>
            {airline && <span className="text-caption text-muted">· {airline}</span>}
            <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-soft">飛機</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 font-mono text-caption text-ink">
            <span className="font-semibold">{depAirport ?? "—"}</span>
            <span className="text-muted">{depTime}</span>
            <span className="text-muted-soft">──→</span>
            <span className="font-semibold">{arrAirport ?? "—"}</span>
            <span className="text-muted">{arrTime}</span>
            <span className="text-muted-soft">·</span>
            <span className="text-muted">{flightDurationLabel}</span>
          </div>
          <div className="mt-0.5 text-[10px] text-muted-soft">
            報到區間 {depItem.startTime}–{depItem.endTime}
            {checkInBuf ? ` (報到 ${checkInBuf}分)` : ""}
            {" · "}
            入境區間 {arrItem.startTime}–{arrItem.endTime}
            {immigrationBuf ? ` (入境 ${immigrationBuf}分)` : ""}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="flex items-center gap-0.5 rounded border border-hairline-soft bg-canvas px-1.5 py-0.5 text-[10px] text-muted hover:border-ink hover:text-ink"
            aria-label={expanded ? "收起" : "展開"}
          >
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {expanded ? "收起" : "詳細"}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm("刪除整段飛航行程？")) onDelete();
              }}
              className="rounded p-0.5 text-muted-soft opacity-0 hover:bg-error/10 hover:text-error group-hover:opacity-100"
              aria-label="刪除整段飛航"
              title="刪除整段飛航"
            >
              <MoreVertical size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-hairline-soft bg-surface-soft px-7 py-2.5 text-caption">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Detail label="出發機場">
              <span className="text-ink">{depPlace?.name ?? depAirport ?? "—"}</span>
              {depPlace && depPlace.rating > 0 && (
                <span className="ml-1 text-muted-soft">
                  <Star size={9} fill="#fb923c" stroke="#fb923c" className="inline" /> {depPlace.rating}
                </span>
              )}
              {str(meta.terminal) && <div className="text-[10px] text-muted-soft">航廈 {str(meta.terminal)}</div>}
            </Detail>
            <Detail label="抵達機場">
              <span className="text-ink">{arrPlace?.name ?? arrAirport ?? "—"}</span>
              {arrPlace && arrPlace.rating > 0 && (
                <span className="ml-1 text-muted-soft">
                  <Star size={9} fill="#fb923c" stroke="#fb923c" className="inline" /> {arrPlace.rating}
                </span>
              )}
              {str(meta.arrTerminal) && <div className="text-[10px] text-muted-soft">航廈 {str(meta.arrTerminal)}</div>}
            </Detail>
            {str(meta.seatNumber) && <Detail label="座位">{str(meta.seatNumber)}</Detail>}
            {str(meta.aircraftType) && <Detail label="機型">{str(meta.aircraftType)}</Detail>}
            {str(meta.bookingRef) && <Detail label="PNR">{str(meta.bookingRef)}</Detail>}
            {num(meta.ticketPrice) != null && (
              <Detail label="機票">
                {String(meta.ticketCurrency ?? "")} {num(meta.ticketPrice)!.toLocaleString()}
              </Detail>
            )}
            {str(meta.baggageAllowance) && <Detail label="行李">{str(meta.baggageAllowance)}</Detail>}
            {str(meta.mealNote) && <Detail label="餐食">{str(meta.mealNote)}</Detail>}
            {bool(meta.isInternational) && <Detail label="航班">國際</Detail>}
          </div>
          {depItem.note && (
            <p className="mt-2 border-t border-hairline-soft pt-2 text-ink">
              {depItem.note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-14 flex-shrink-0 text-[10px] text-muted-soft">{label}</span>
      <span className="flex-1 text-caption text-ink">{children}</span>
    </div>
  );
}

function formatDur(secs: number): string {
  const mins = Math.round(secs / 60);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h} 小時 ${m} 分` : `${h} 小時`;
  }
  return `${mins} 分`;
}
