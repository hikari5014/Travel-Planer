"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Star, MapPin, Clock, GripVertical, X, Sparkles, ExternalLink, Edit3 } from "lucide-react";
import { getPlace, type MockScheduleItem } from "@/lib/mock-schedule";
import { PlaceIconChip } from "@/lib/place-icon";
import { PriceWithLocal } from "@/components/common/PriceWithLocal";

const CARD_WIDTH = 320;
const VIEWPORT_PADDING = 8;

// Viewport-anchored draggable place detail card.
// Rendered via Portal into <body> with `position: fixed` so it floats above
// every panel (map, list, compare grid) and isn't clipped by overflow.
export function FloatingPlaceCard({
  item,
  onClose,
  initialAnchor,
}: {
  item: MockScheduleItem;
  onClose: () => void;
  /**
   * Initial top-right offset in viewport pixels.
   * Defaults to top:96 / right:24, hugging the right edge near the editor header.
   */
  initialAnchor?: { top: number; right: number };
}) {
  const place = getPlace(item.placeId);
  const cardRef = useRef<HTMLDivElement>(null);

  // Internal position is stored as { top, left } in viewport coords for clean
  // clamping during drag. Initialised from the right-anchored default.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const dragStart = useRef<{ pointerX: number; pointerY: number; top: number; left: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Initialise position once mounted (window is available).
  useEffect(() => {
    setMounted(true);
    const top = initialAnchor?.top ?? 96;
    const right = initialAnchor?.right ?? 24;
    const left = window.innerWidth - CARD_WIDTH - right;
    setPos({ top, left });
  }, [initialAnchor]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Re-clamp on resize so the card never escapes the viewport.
  useEffect(() => {
    if (!pos) return;
    function onResize() {
      setPos((p) => (p ? clampToViewport(p, cardRef.current) : p));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pos]);

  if (!place || !mounted || !pos) return null;

  function handlePointerDown(e: React.PointerEvent) {
    setDragging(true);
    if (!pos) return;
    dragStart.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      top: pos.top,
      left: pos.left,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.pointerX;
    const dy = e.clientY - dragStart.current.pointerY;
    const next = clampToViewport(
      {
        top: dragStart.current.top + dy,
        left: dragStart.current.left + dx,
      },
      cardRef.current,
    );
    setPos(next);
  }
  function handlePointerUp(e: React.PointerEvent) {
    setDragging(false);
    dragStart.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  const card = (
    <div
      ref={cardRef}
      style={{ top: pos.top, left: pos.left, width: CARD_WIDTH, position: "fixed" }}
      className={`z-50 flex flex-col overflow-hidden rounded-lg border border-hairline bg-canvas shadow-pop ${
        dragging ? "shadow-lg" : ""
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Drag handle bar */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`flex items-center justify-between border-b border-hairline-soft bg-surface-soft px-2 py-1 ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <div className="flex items-center gap-1 text-muted-soft">
          <GripVertical size={12} strokeWidth={1.8} />
          <span className="text-[10px] uppercase tracking-wide">景點詳情 · 可拖曳</span>
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-canvas hover:text-ink"
          aria-label="關閉"
        >
          <X size={12} strokeWidth={2} />
        </button>
      </div>

      {/* Hero: icon chip */}
      <div className="flex items-center gap-3 border-b border-hairline-soft p-3">
        <PlaceIconChip iconKey={place.iconKey} size={22} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide text-muted">{place.category}</p>
          <h3 className="truncate text-title-sm text-ink">{place.name}</h3>
        </div>
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-center gap-3 text-caption text-muted">
          <span className="flex items-center gap-1">
            <Star size={12} fill="#fb923c" stroke="#fb923c" />
            <span className="font-medium text-ink">{place.rating}</span>
            <span className="text-muted-soft">({place.ratingCount.toLocaleString()})</span>
          </span>
          <span className="flex items-center gap-1 truncate">
            <MapPin size={12} strokeWidth={1.8} />
            <span className="truncate">{place.address}</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-md border border-hairline-soft bg-surface-soft p-2">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-soft">時段</p>
            <p className="font-mono text-body-sm text-ink">
              {item.startTime}–{item.endTime}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-soft">建議停留</p>
            <p className="text-body-sm text-ink flex items-center gap-1">
              <Clock size={12} strokeWidth={1.8} className="text-muted" />
              {fmtMinutes(item.durationMin)}
            </p>
          </div>
        </div>

        <div className="rounded-md bg-surface-card p-2">
          <p className="text-[10px] uppercase tracking-wide text-muted">REVIEWS</p>
          <p className="mt-0.5 text-caption leading-relaxed text-body">"{place.reviewSnippet}"</p>
        </div>

        {item.hasTicket && (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-2">
            <div className="flex items-center justify-between">
              <p className="text-caption text-ink">🎫 已登記票卷</p>
              <PriceWithLocal amount={2400} size="sm" align="right" />
            </div>
            {item.note && <p className="mt-0.5 text-caption text-muted">{item.note}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          <button className="flex items-center justify-center gap-1 rounded-md border border-hairline bg-canvas py-1.5 text-caption text-ink hover:border-ink">
            <Edit3 size={12} strokeWidth={1.8} /> 編輯時段
          </button>
          <button className="flex items-center justify-center gap-1 rounded-md border border-hairline bg-canvas py-1.5 text-caption text-ink hover:border-ink">
            <ExternalLink size={12} strokeWidth={1.8} /> Google Maps
          </button>
          <button className="col-span-2 flex items-center justify-center gap-1 rounded-md border border-dashed border-brand-accent bg-brand-accent/5 py-1.5 text-caption text-brand-accent hover:bg-brand-accent/10">
            <Sparkles size={12} fill="currentColor" /> 請 AI 重新估算停留時間
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(card, document.body);
}

function clampToViewport(
  pos: { top: number; left: number },
  el: HTMLElement | null,
): { top: number; left: number } {
  const w = typeof window === "undefined" ? 1024 : window.innerWidth;
  const h = typeof window === "undefined" ? 768 : window.innerHeight;
  const cardW = el?.offsetWidth ?? CARD_WIDTH;
  const cardH = el?.offsetHeight ?? 400;
  return {
    top: Math.min(Math.max(VIEWPORT_PADDING, pos.top), Math.max(VIEWPORT_PADDING, h - cardH - VIEWPORT_PADDING)),
    left: Math.min(Math.max(VIEWPORT_PADDING, pos.left), Math.max(VIEWPORT_PADDING, w - cardW - VIEWPORT_PADDING)),
  };
}

function fmtMinutes(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`;
  }
  return `${min} 分`;
}
