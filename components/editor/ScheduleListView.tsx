"use client";

import { useState, useTransition } from "react";
import { Star, Lock, Ticket, Footprints, TrainFront, Car, ParkingCircle, MoreVertical, Plus, GripVertical, Trash2, Pencil, Sparkles, Wand2 } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { reorderItemsAction, deleteScheduleItemAction } from "@/app/(actions)/schedule-actions";
import { TransportEditDialog } from "@/components/editor/TransportEditDialog";
import { ParkingPicker } from "@/components/editor/ParkingPicker";

const kindBadge: Record<string, { label: string; cls: string }> = {
  ATTRACTION: { label: "景點", cls: "bg-badge-orange/15 text-ink" },
  MEAL: { label: "餐飲", cls: "bg-badge-pink/15 text-ink" },
  LODGING: { label: "住宿", cls: "bg-badge-emerald/15 text-ink" },
  FREE: { label: "自由", cls: "bg-surface-card text-muted" },
};

export function ScheduleListView({
  day,
  tripId,
  selectedItemId,
  onSelectItem,
  onFocusItem,
  onAddPlace,
}: {
  day: MockDay;
  tripId?: string; // when present, drag-reorder fires the server action
  selectedItemId?: string;
  onSelectItem: (id: string) => void;
  // Double-click — used by EditorShell to fly the map to that pin.
  onFocusItem?: (id: string) => void;
  onAddPlace?: () => void;
}) {
  const allDayItems = day.items.filter((i) => i.isAllDay);
  const timedItems = day.items.filter((i) => !i.isAllDay);

  const transportsByFrom = new Map<string, MockTransport>();
  for (const t of day.transports) transportsByFrom.set(t.fromItemId, t);

  // Optimistic local order — shadows server state while drop persists.
  const [orderedItems, setOrderedItems] = useState<MockScheduleItem[]>(timedItems);
  // Edit-transport dialog state
  const [editingTransport, setEditingTransport] = useState<{
    transport: MockTransport;
    fromName: string;
    toName: string;
  } | null>(null);
  // Parking picker state
  const [parkingFor, setParkingFor] = useState<{
    transportId: string;
    toName: string;
    currentName?: string | null;
  } | null>(null);
  // Sync local optimistic state whenever the server-provided items change in
  // any meaningful way (id list, ordering, OR per-item start/end/duration —
  // so a week-view drag-resize flows back into the list immediately).
  const itemIdsKey = timedItems
    .map((i) => `${i.id}:${i.startTime}-${i.endTime}:${i.durationMin}:${i.kind}:${i.hasTicket ? 1 : 0}`)
    .join("|");
  const [lastKey, setLastKey] = useState(itemIdsKey);
  if (lastKey !== itemIdsKey) {
    setOrderedItems(timedItems);
    setLastKey(itemIdsKey);
  }

  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedItems.findIndex((i) => i.id === active.id);
    const newIndex = orderedItems.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(orderedItems, oldIndex, newIndex);
    setOrderedItems(next);
    if (tripId) {
      startTransition(async () => {
        await reorderItemsAction(tripId, day.id, next.map((i) => i.id));
      });
    }
  }

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

      {/* Timed items — sortable */}
      <div className="relative">
        <div className="absolute left-[44px] top-1 bottom-1 w-px bg-hairline" />

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {orderedItems.map((item, idx) => {
              const next = orderedItems[idx + 1];
              const transport = transportsByFrom.get(item.id);
              return (
                <div key={item.id}>
                  <SortableScheduleCard
                    item={item}
                    selected={selectedItemId === item.id}
                    onSelect={() => onSelectItem(item.id)}
                    onFocus={onFocusItem ? () => onFocusItem(item.id) : undefined}
                    onDelete={tripId ? () => {
                      if (!confirm("刪除這個項目？")) return;
                      startTransition(async () => {
                        await deleteScheduleItemAction(tripId, item.id);
                      });
                    } : undefined}
                  />
                  {next && transport && (
                    <TransportRow
                      transport={transport}
                      nextStartTime={next.startTime}
                      onEdit={
                        tripId && transport.id
                          ? () => {
                              const fromPlace = item.placeId ? getPlace(item.placeId) : undefined;
                              const toPlace = next.placeId ? getPlace(next.placeId) : undefined;
                              setEditingTransport({
                                transport,
                                fromName: fromPlace?.name ?? "",
                                toName: toPlace?.name ?? "",
                              });
                            }
                          : undefined
                      }
                      onPickParking={
                        tripId && transport.id
                          ? () => {
                              const toPlace = next.placeId ? getPlace(next.placeId) : undefined;
                              setParkingFor({
                                transportId: transport.id!,
                                toName: toPlace?.name ?? "",
                                currentName: transport.parkingPlaceName,
                              });
                            }
                          : undefined
                      }
                    />
                  )}
                </div>
              );
            })}
          </SortableContext>
        </DndContext>

        {/* Add item */}
        <div className="ml-[64px] mt-sm">
          <button
            onClick={onAddPlace}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-hairline py-2 text-caption text-muted hover:border-primary hover:text-primary"
          >
            <Plus size={12} strokeWidth={2.2} /> 新增景點 / 餐廳 / 自由時間
          </button>
        </div>
      </div>

      {tripId && editingTransport && (
        <TransportEditDialog
          tripId={tripId}
          transport={editingTransport.transport}
          fromName={editingTransport.fromName}
          toName={editingTransport.toName}
          onClose={() => setEditingTransport(null)}
        />
      )}
      {tripId && parkingFor && (
        <ParkingPicker
          tripId={tripId}
          transportId={parkingFor.transportId}
          toName={parkingFor.toName}
          currentParkingName={parkingFor.currentName}
          onClose={() => setParkingFor(null)}
        />
      )}
    </div>
  );
}

function SortableScheduleCard({
  item,
  selected,
  onSelect,
  onFocus,
  onDelete,
}: {
  item: MockScheduleItem;
  selected: boolean;
  onSelect: () => void;
  // Double-click — used for "fly the map to this pin" (EditorShell wires it).
  onFocus?: () => void;
  onDelete?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  const place = getPlace(item.placeId);
  const badge = kindBadge[item.kind];
  if (!place) return null;
  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-2 py-1">
      <div className="flex w-[36px] flex-col items-end pt-2">
        <span className="font-mono text-caption text-ink leading-tight">{item.startTime}</span>
        <span className="font-mono text-[10px] text-muted-soft leading-tight">{item.endTime}</span>
        {item.isTimeLocked && <Lock size={10} strokeWidth={2} className="mt-0.5 text-muted-soft" />}
      </div>

      <div className="relative flex w-3 flex-shrink-0 items-start pt-2.5">
        <span
          className={`relative z-10 h-3 w-3 rounded-full border-2 ${
            selected ? "border-brand-accent bg-brand-accent" : "border-ink bg-canvas"
          }`}
        />
      </div>

      <div
        className={`group flex flex-1 cursor-pointer items-center gap-2 rounded-md border p-2 text-left transition-all ${
          selected
            ? "border-ink bg-canvas shadow-soft-elevation"
            : "border-hairline bg-canvas hover:border-ink/40"
        }`}
        onClick={onSelect}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onFocus?.();
        }}
        title={onFocus ? "雙擊跳到地圖位置" : undefined}
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="flex h-6 w-4 flex-shrink-0 cursor-grab items-center justify-center text-muted-soft hover:text-ink active:cursor-grabbing"
          aria-label="拖曳重排"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={12} />
        </button>

        <PlaceIconChip iconKey={place.iconKey} size={20} />

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
              <Star size={10} fill="#fb923c" stroke="#fb923c" />
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

        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-soft opacity-0 transition-opacity hover:bg-error/10 hover:text-error group-hover:opacity-100"
            aria-label="刪除"
          >
            <Trash2 size={11} />
          </button>
        )}
        <MoreVertical size={14} className="text-muted-soft" />
      </div>
    </div>
  );
}

function TransportRow({
  transport,
  nextStartTime,
  onEdit,
  onPickParking,
}: {
  transport: MockTransport;
  nextStartTime: string;
  onEdit?: () => void;
  onPickParking?: () => void;
}) {
  const isDriving = transport.mode === "DRIVING";
  const Icon =
    transport.mode === "WALKING"
      ? Footprints
      : transport.mode === "TRANSIT"
        ? TrainFront
        : transport.mode === "CUSTOM"
          ? Wand2
          : Car;
  return (
    <div
      className={`group ml-[64px] flex items-center gap-2 py-0.5 ${onEdit ? "cursor-pointer" : ""}`}
      onClick={onEdit}
    >
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-card text-muted">
        <Icon size={11} strokeWidth={1.8} />
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-1 text-[11px] text-muted">
        <span>{modeLabel(transport.mode)}</span>
        {transport.transitLine && (
          <>
            <span className="text-muted-soft">·</span>
            <span className="text-ink">{transport.transitLine}</span>
          </>
        )}
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
        {transport.manuallyEdited && (
          <span className="inline-flex items-center gap-0.5 rounded-pill bg-badge-violet/15 px-1.5 py-px text-[10px] text-ink">
            <Sparkles size={9} strokeWidth={2} /> 手動 / AI
          </span>
        )}
        {isDriving && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPickParking?.();
            }}
            disabled={!onPickParking}
            className="ml-1 inline-flex items-center gap-0.5 rounded-pill bg-warning/15 px-1.5 py-px text-[10px] text-ink hover:bg-warning/25 disabled:cursor-default disabled:opacity-60"
            title={transport.parkingPlaceName ? `已選：${transport.parkingPlaceName}` : "搜尋附近停車場"}
          >
            <ParkingCircle size={10} strokeWidth={2} />
            {transport.parkingPlaceName ? `🅿 ${transport.parkingPlaceName}` : "規劃停車場"}
          </button>
        )}
        {onEdit && (
          <span className="opacity-0 transition-opacity group-hover:opacity-100">
            <Pencil size={10} strokeWidth={2} className="text-muted" />
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
