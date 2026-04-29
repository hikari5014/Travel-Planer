"use client";

import { useTransition } from "react";
import Link from "next/link";
import { SpikeMark } from "@/components/brand/SpikeMark";
import type { MockPlan } from "@/lib/mock-schedule";
import { createBlankPlanAction, duplicatePlanAction } from "@/app/(actions)/plan-actions";

export type EditorView = "list" | "grid";

export function EditorHeader({
  tripId,
  tripTitle,
  plans,
  currentPlanId,
  comparePlanIds,
  view,
  onViewChange,
  onPlanChange,
  onComparePlansChange,
}: {
  tripId: string;
  tripTitle: string;
  plans: MockPlan[];
  currentPlanId: string;
  /** When length > 1, list view renders the side-by-side comparison */
  comparePlanIds: string[];
  view: EditorView;
  onViewChange: (v: EditorView) => void;
  onPlanChange: (planId: string) => void;
  onComparePlansChange: (ids: string[]) => void;
}) {
  // Shift+click on a plan toggles it in/out of the comparison set.
  // Plain click switches the current plan and resets comparison.
  function handlePlanClick(e: React.MouseEvent, planId: string) {
    if (e.shiftKey) {
      // Toggle membership; ensure current plan stays selected
      const set = new Set(comparePlanIds.length > 0 ? comparePlanIds : [currentPlanId]);
      if (set.has(planId)) {
        if (set.size > 1) set.delete(planId);
      } else {
        if (set.size >= 3) {
          // cap at 3 columns
          return;
        }
        set.add(planId);
      }
      const next = plans.filter((p) => set.has(p.id)).map((p) => p.id);
      onComparePlansChange(next);
      return;
    }
    onPlanChange(planId);
    onComparePlansChange([]);
  }
  const inCompareMode = comparePlanIds.length > 1;
  const [, startTransition] = useTransition();
  function handleDuplicate() {
    startTransition(async () => {
      await duplicatePlanAction(tripId, currentPlanId);
    });
  }
  function handleNewBlank() {
    const name = prompt("新方案名稱", `方案 ${plans.length + 1}`);
    if (!name) return;
    startTransition(async () => {
      await createBlankPlanAction(tripId, name.trim() || undefined);
    });
  }
  return (
    <header className="sticky top-0 z-40 border-b border-hairline-soft bg-canvas/95 backdrop-blur">
      <div className="flex h-14 items-center gap-md px-lg">
        {/* Left: brand + breadcrumb */}
        <Link href="/" className="flex items-center gap-xs text-muted hover:text-ink">
          <SpikeMark size={14} />
          <span className="text-caption">旅遊規劃Z</span>
        </Link>
        <span className="text-muted-soft">/</span>
        <Link href="/" className="text-caption text-muted hover:text-ink">
          我的旅程
        </Link>
        <span className="text-muted-soft">/</span>
        <span className="truncate text-title-sm text-ink">{tripTitle}</span>

        {/* Plan switcher (Shift+click to multi-select for inline compare) */}
        <div
          className="ml-md flex items-center gap-xs rounded-pill bg-surface-soft p-0.5"
          title="點擊切換方案 · Shift+點擊可同時對比多個（最多 3 個）"
        >
          {plans.map((p) => {
            const isActive = p.id === currentPlanId && !inCompareMode;
            const isInCompare = inCompareMode && comparePlanIds.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={(e) => handlePlanClick(e, p.id)}
                className={`rounded-pill px-3 py-1 text-caption transition-colors ${
                  isActive
                    ? "bg-canvas text-ink shadow-soft-elevation"
                    : isInCompare
                      ? "bg-canvas text-ink shadow-soft-elevation ring-1 ring-brand-accent"
                      : "text-muted hover:text-ink"
                }`}
              >
                {isInCompare && <span className="mr-1 text-brand-accent">●</span>}
                {p.name}
              </button>
            );
          })}
          <button
            onClick={handleNewBlank}
            disabled={plans.length >= 3}
            className="ml-1 rounded-pill px-2 py-1 text-caption text-muted-soft hover:bg-canvas hover:text-ink disabled:opacity-40"
            title={plans.length >= 3 ? "上限 3 個方案" : "新增空白方案"}
          >
            ＋
          </button>
          <button
            onClick={handleDuplicate}
            disabled={plans.length >= 3}
            className="rounded-pill px-2 py-1 text-[11px] text-muted-soft hover:bg-canvas hover:text-ink disabled:opacity-40"
            title={plans.length >= 3 ? "上限 3 個方案" : "複製目前方案"}
          >
            ⧉
          </button>
        </div>
        {inCompareMode && (
          <span className="inline-flex items-center gap-1 rounded-pill bg-brand-accent/10 px-2 py-0.5 text-[11px] text-brand-accent">
            對比模式 · {comparePlanIds.length} 個方案
            <button
              onClick={() => onComparePlansChange([])}
              className="ml-1 hover:text-ink"
              title="退出對比"
            >
              ×
            </button>
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* View toggle */}
        <div className="flex items-center gap-px rounded-md border border-hairline bg-canvas p-0.5">
          <button
            onClick={() => onViewChange("list")}
            className={`flex items-center gap-1 rounded-sm px-2.5 py-1 text-caption transition-colors ${
              view === "list" ? "bg-surface-card text-ink" : "text-muted hover:text-ink"
            }`}
          >
            <ListIcon /> 列表
          </button>
          <button
            onClick={() => onViewChange("grid")}
            className={`flex items-center gap-1 rounded-sm px-2.5 py-1 text-caption transition-colors ${
              view === "grid" ? "bg-surface-card text-ink" : "text-muted hover:text-ink"
            }`}
          >
            <GridIcon /> 週視圖
          </button>
        </div>

        {/* Actions */}
        <Link
          href={`/trips/${tripId}/expenses`}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-caption text-ink hover:border-ink"
        >
          <ReceiptIcon /> 費用
        </Link>
        <Link
          href={`/trips/${tripId}/compare`}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-caption text-ink hover:border-ink"
        >
          <CompareIcon /> 對比方案
        </Link>
        <Link
          href={`/trips/${tripId}/export`}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-caption text-ink hover:border-ink"
        >
          <DownloadIcon /> 匯出 PDF
        </Link>
        <Link
          href={`/trips/${tripId}/ai`}
          className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-caption text-on-primary hover:bg-primary-active"
        >
          <SparkleIcon /> AI 行前建議
        </Link>
      </div>
    </header>
  );
}

function ListIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 3v18" />
    </svg>
  );
}
function CompareIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 6h6v12H3zM15 6h6v12h-6zM9 12h6" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}
function SparkleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2 L13.5 9 L20 10 L13.5 11 L12 18 L10.5 11 L4 10 L10.5 9 Z" />
    </svg>
  );
}
function ReceiptIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l3-2 3 2 3-2 3 2 4-2V2L17 4l-3-2-3 2-3-2-2 0z" />
      <path d="M8 8h8M8 12h8M8 16h6" />
    </svg>
  );
}
