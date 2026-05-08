"use client";

import {
  Plane,
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

  // Boarding-pass-style card. Top stub holds the airline / route / times;
  // a perforation (dashed line + cutouts) separates it from the detail
  // chips below — everything inside the same draggable card so the block
  // still moves as one unit.
  const detailChips: Array<{ label: string; value: React.ReactNode }> = [];
  if (str(meta.seatNumber)) detailChips.push({ label: "座位", value: <span className="font-mono text-title-md text-ink">{str(meta.seatNumber)}</span> });
  if (str(meta.bookingRef)) detailChips.push({ label: "PNR", value: <span className="font-mono text-body-sm tracking-wider text-ink">{str(meta.bookingRef)}</span> });
  if (str(meta.aircraftType)) detailChips.push({ label: "機型", value: <span className="font-mono text-body-sm text-ink">{str(meta.aircraftType)}</span> });
  if (num(meta.ticketPrice) != null) {
    detailChips.push({
      label: "機票",
      value: (
        <span className="font-mono text-body-sm text-ink">
          {String(meta.ticketCurrency ?? "")} {num(meta.ticketPrice)!.toLocaleString()}
        </span>
      ),
    });
  }
  if (str(meta.baggageAllowance)) detailChips.push({ label: "行李", value: <span className="text-body-sm text-ink">{str(meta.baggageAllowance)}</span> });
  if (str(meta.mealNote)) detailChips.push({ label: "餐食", value: <span className="text-body-sm text-ink">{str(meta.mealNote)}</span> });
  if (bool(meta.isInternational)) detailChips.push({ label: "航班", value: <span className="text-body-sm text-ink">國際</span> });

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={`group relative mx-2 my-3 overflow-hidden rounded-xl bg-canvas shadow-sm transition-all ${
        selected ? "ring-2 ring-brand-accent/60 shadow-soft-elevation" : "ring-1 ring-hairline hover:ring-ink/20"
      } ${sortable.isDragging ? "z-10" : ""}`}
      onClick={(e) => onSelect(e.currentTarget)}
    >
      {/* Boarding-pass top stub */}
      <div className="relative bg-gradient-to-br from-brand-accent/8 via-brand-accent/4 to-canvas">
        {/* Drag handle — sits in its own gutter on the far left */}
        <button
          type="button"
          {...sortable.attributes}
          {...sortable.listeners}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-2.5 top-3.5 z-10 cursor-grab text-muted-soft hover:text-muted active:cursor-grabbing"
          aria-label="拖曳整段飛航"
        >
          <GripVertical size={12} strokeWidth={1.6} />
        </button>

        {/* Top header strip — content lives past the drag-handle gutter (pl-10) */}
        <div className="flex items-center gap-2 border-b border-hairline-soft/60 pl-10 pr-5 py-3">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-brand-accent/15 text-brand-accent">
            <Plane size={13} strokeWidth={1.8} />
          </div>
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            {airline && <span className="truncate text-body-sm font-semibold text-ink">{airline}</span>}
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-soft">Boarding Pass</span>
          </div>
          <span className="rounded-pill bg-canvas/80 px-2.5 py-0.5 font-mono text-[11px] tracking-wider text-ink">
            {flightNumber ?? "—"}
          </span>
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

        {/* Big journey strip */}
        <div className="grid grid-cols-1 items-center gap-3 px-6 py-5 sm:grid-cols-[1fr_auto_1fr] sm:gap-4 sm:px-10">
          {/* Departure */}
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl font-semibold tracking-tight text-ink">{depAirport ?? "—"}</span>
              {depPlace && depPlace.rating > 0 && (
                <span className="text-[10px] text-muted-soft">
                  <Star size={9} fill="#fb923c" stroke="#fb923c" className="inline" /> {depPlace.rating}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-caption text-muted">{depPlace?.name ?? "—"}</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-ink">{depTime}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-soft">出發</p>
          </div>

          {/* Center connector */}
          <div className="flex flex-col items-center px-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-soft">{flightDurationLabel}</span>
            <div className="mt-1 flex items-center gap-1">
              <div className="h-px w-8 bg-gradient-to-r from-transparent to-brand-accent/50" />
              <Plane size={14} strokeWidth={1.8} className="rotate-90 text-brand-accent" />
              <div className="h-px w-8 bg-gradient-to-l from-transparent to-brand-accent/50" />
            </div>
            {bool(meta.isInternational) && (
              <span className="mt-1 rounded-pill bg-brand-accent/12 px-1.5 py-0 text-[9px] uppercase tracking-wider text-brand-accent">
                International
              </span>
            )}
          </div>

          {/* Arrival */}
          <div className="min-w-0 text-left sm:text-right">
            <div className="flex items-baseline gap-2 sm:justify-end">
              {arrPlace && arrPlace.rating > 0 && (
                <span className="text-[10px] text-muted-soft">
                  <Star size={9} fill="#fb923c" stroke="#fb923c" className="inline" /> {arrPlace.rating}
                </span>
              )}
              <span className="font-mono text-3xl font-semibold tracking-tight text-ink">{arrAirport ?? "—"}</span>
            </div>
            <p className="mt-0.5 truncate text-caption text-muted">{arrPlace?.name ?? "—"}</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-ink">{arrTime}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-soft">抵達</p>
          </div>
        </div>

        {/* Buffer strip */}
        <div className="grid grid-cols-1 gap-3 px-6 pb-5 text-caption sm:grid-cols-2 sm:px-10">
          <BufferTag
            label="報到時段"
            range={`${depItem.startTime}–${depItem.endTime}`}
            note={checkInBuf ? `提前 ${checkInBuf} 分到達機場` : "提前到達機場"}
            terminal={str(meta.terminal) ? `航廈 ${str(meta.terminal)}` : null}
          />
          <BufferTag
            label="入境時段"
            range={`${arrItem.startTime}–${arrItem.endTime}`}
            note={immigrationBuf ? `預估 ${immigrationBuf} 分通關` : "通關 + 領行李"}
            terminal={str(meta.arrTerminal) ? `航廈 ${str(meta.arrTerminal)}` : null}
            align="right"
          />
        </div>
      </div>

      {/* Perforation */}
      <div className="relative h-[1px]">
        <div className="absolute inset-x-10 top-0 border-t border-dashed border-hairline" />
        <span className="absolute -left-[7px] -top-[7px] h-[14px] w-[14px] rounded-full bg-surface-soft" />
        <span className="absolute -right-[7px] -top-[7px] h-[14px] w-[14px] rounded-full bg-surface-soft" />
      </div>

      {/* Detail chips */}
      {detailChips.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 px-10 py-4">
          {detailChips.map((chip, i) => (
            <div
              key={i}
              className="flex flex-col rounded-md border border-hairline-soft bg-surface-soft px-2.5 py-1.5"
            >
              <span className="text-[9px] uppercase tracking-wider text-muted-soft">{chip.label}</span>
              {chip.value}
            </div>
          ))}
        </div>
      )}

      {depItem.note && (
        <div className="border-t border-hairline-soft bg-surface-soft px-10 py-3 text-caption text-ink">
          <p className="text-[10px] uppercase tracking-wider text-muted-soft">備註</p>
          <p className="mt-0.5">{depItem.note}</p>
        </div>
      )}
    </div>
  );
}

function BufferTag({
  label,
  range,
  note,
  terminal,
  align = "left",
}: {
  label: string;
  range: string;
  note: string;
  terminal: string | null;
  align?: "left" | "right";
}) {
  return (
    <div className={`rounded-md border border-hairline-soft bg-canvas/60 px-2.5 py-1.5 ${align === "right" ? "text-right" : ""}`}>
      <div className={`flex items-center gap-1.5 ${align === "right" ? "justify-end" : ""}`}>
        <span className="text-[9px] uppercase tracking-wider text-muted-soft">{label}</span>
        {terminal && (
          <span className="rounded-pill bg-surface-soft px-1.5 text-[9px] text-muted">{terminal}</span>
        )}
      </div>
      <p className="mt-0.5 font-mono text-[12px] tabular-nums text-ink">{range}</p>
      <p className="text-[10px] text-muted-soft">{note}</p>
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
