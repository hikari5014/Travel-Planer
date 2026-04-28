"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";

// Two horizontal panes with a draggable divider.
// `initialLeftFraction` is the starting fraction (0-1) for the left pane.
// `min/max` clamps the divider in pixel terms.
export function ResizablePanes({
  left,
  right,
  initialLeftFraction = 0.4,
  minLeftPx = 280,
  minRightPx = 320,
  storageKey,
}: {
  left: ReactNode;
  right: ReactNode;
  initialLeftFraction?: number;
  minLeftPx?: number;
  minRightPx?: number;
  storageKey?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  // Load saved width from localStorage
  useEffect(() => {
    if (!storageKey) return;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const n = Number(saved);
      if (Number.isFinite(n) && n > 0) setLeftWidth(n);
    }
  }, [storageKey]);

  // Initialize from container width if not set
  useEffect(() => {
    if (leftWidth !== null) return;
    const el = containerRef.current;
    if (!el) return;
    setLeftWidth(el.clientWidth * initialLeftFraction);
  }, [leftWidth, initialLeftFraction]);

  // Persist
  useEffect(() => {
    if (!storageKey || leftWidth === null) return;
    localStorage.setItem(storageKey, String(Math.round(leftWidth)));
  }, [leftWidth, storageKey]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const next = Math.min(
        rect.width - minRightPx,
        Math.max(minLeftPx, e.clientX - rect.left),
      );
      setLeftWidth(next);
    },
    [dragging, minLeftPx, minRightPx],
  );
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    setDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      <div
        className="h-full overflow-y-auto"
        style={{ width: leftWidth ?? "40%", flexShrink: 0 }}
      >
        {left}
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`relative flex h-full w-1 flex-shrink-0 items-center justify-center bg-hairline-soft transition-colors hover:bg-primary/30 ${
          dragging ? "bg-primary/40 cursor-col-resize" : "cursor-col-resize"
        }`}
        title="拖曳調整左右寬度"
      >
        {/* Visible grip on hover */}
        <span className={`absolute flex h-10 w-3 items-center justify-center rounded bg-canvas border border-hairline opacity-0 transition-opacity ${dragging ? "opacity-100" : "hover:opacity-100"}`}>
          <GripVertical size={12} className="text-muted" />
        </span>
      </div>
      <div className="h-full flex-1 overflow-hidden">{right}</div>
    </div>
  );
}
