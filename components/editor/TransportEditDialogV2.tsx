"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Bike,
  Car,
  CarTaxiFront,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Footprints,
  Leaf,
  Loader2,
  Plane,
  RotateCcw,
  TrainFront,
  // FLIGHT mode used inside the picker — see ModeFilterChips below
  // (re-imported here for the chip + panel)
  Wallet,
  X,
} from "lucide-react";
import {
  applyRouteOptionAction,
  compareRouteOptionsAction,
  resetTransportAction,
  updateTransportAction,
  type CompareRouteOptionsResult,
} from "@/app/(actions)/transport-actions";
import type { MockTransport } from "@/lib/mock-schedule";
import type {
  RouteOption,
  RouteOptionMode,
} from "@/lib/services/route-options-service";
import { RouteOptionCard } from "@/components/editor/RouteOptionCard";
import { FlightInfoPanel } from "@/components/editor/FlightInfoPanel";
import { TransitGoogleMapsPanel } from "@/components/editor/TransitGoogleMapsPanel";
import type { ParsedTransit } from "@/lib/services/transit-rule-parser";

// Phase 11 — Maps-style point-to-point picker.
//
// 取代 v1 TransportEditDialog 的「先選 mode → 看單一結果」流程。打開時
// 自動並行查 4 mode + alternatives + 推導 TAXI，整合排序後渲染為垂直
// 卡片清單。FLIGHT 段不進這個 dialog（在外層判斷後跳到 v1 飛行表單）。

const MODE_FILTERS: Array<{ mode: RouteOptionMode | "ALL"; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; color: string }> = [
  { mode: "ALL", label: "全部", icon: Clock, color: "text-ink" },
  { mode: "WALKING", label: "步行", icon: Footprints, color: "text-success" },
  { mode: "TRANSIT", label: "大眾", icon: TrainFront, color: "text-brand-accent" },
  { mode: "DRIVING", label: "駕車", icon: Car, color: "text-warning" },
  { mode: "BICYCLING", label: "腳踏車", icon: Bike, color: "text-warning" },
  { mode: "TAXI", label: "計程車", icon: CarTaxiFront, color: "text-warning" },
  { mode: "FLIGHT", label: "飛機", icon: Plane, color: "text-brand-accent" },
];

type SortKey = "recommend" | "fastest" | "cheapest" | "comfort" | "co2";

const SORT_ICONS: Array<{ key: SortKey; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }> = [
  { key: "recommend", label: "推薦", icon: Leaf },
  { key: "fastest", label: "最快", icon: Clock },
  { key: "cheapest", label: "最便宜", icon: Wallet },
  { key: "comfort", label: "最舒適", icon: Footprints },
];

export function TransportEditDialogV2({
  tripId,
  transport,
  fromName,
  toName,
  fromLat,
  fromLng,
  toLat,
  toLng,
  googleMapsKey,
  initialMode,
  onClose,
}: {
  tripId: string;
  transport: MockTransport;
  fromName: string;
  toName: string;
  fromLat?: number | null;
  fromLng?: number | null;
  toLat?: number | null;
  toLng?: number | null;
  googleMapsKey?: string | null;
  // 強制初始 mode（路由器偵測到 airport→airport 時傳 "FLIGHT" 進來）
  initialMode?: RouteOptionMode;
  onClose: () => void;
}) {
  const transportId = transport.id;

  // Phase 11.2 — hydrate from cached RouteOption[] in transport.routeOptionsJson
  // so reopening the dialog doesn't burn a new round of Routes API calls.
  // User can click "重新查詢" to force-refresh.
  const cachedOptions = (() => {
    if (!transport.routeOptionsJson) return null;
    try {
      const parsed = JSON.parse(transport.routeOptionsJson);
      return Array.isArray(parsed) ? (parsed as RouteOption[]) : null;
    } catch {
      return null;
    }
  })();

  // ─ Picker state ─
  const [results, setResults] = useState<RouteOption[] | null>(cachedOptions);
  const [modeErrors, setModeErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [applying, startApply] = useTransition();
  const [resetting, startReset] = useTransition();
  const [activeMode, setActiveMode] = useState<RouteOptionMode | "ALL">(
    initialMode ?? (transport.mode === "FLIGHT" ? "FLIGHT" : "ALL"),
  );
  const [sortKey, setSortKey] = useState<SortKey>("recommend");
  const [showOverride, setShowOverride] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
    transport.selectedOptionId ?? null,
  );

  // Manual override state
  const [overrideDistance, setOverrideDistance] = useState(
    (transport.distanceM / 1000).toFixed(1),
  );
  const [overrideDuration, setOverrideDuration] = useState(
    String(Math.round(transport.durationSec / 60)),
  );
  const [overrideCost, setOverrideCost] = useState(
    transport.estimatedCost != null ? String(transport.estimatedCost) : "",
  );
  const [overrideNotes, setOverrideNotes] = useState(transport.notes ?? "");

  // ─ Auto-fetch on mount, only when no cache + not FLIGHT mode ─
  useEffect(() => {
    if (!transportId) return;
    if (activeMode === "FLIGHT") return; // FLIGHT panel handles itself
    if (results !== null && results.length > 0) return; // cache hit
    setError(null);
    startLoad(async () => {
      const r: CompareRouteOptionsResult = await compareRouteOptionsAction(transportId);
      if (r.ok) {
        setResults(r.options);
        setModeErrors(r.modeErrors);
      } else {
        setError(r.error);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transportId, activeMode]);

  function handleRefetch() {
    if (!transportId) return;
    setError(null);
    setResults(null);
    startLoad(async () => {
      const r: CompareRouteOptionsResult = await compareRouteOptionsAction(transportId);
      if (r.ok) {
        setResults(r.options);
        setModeErrors(r.modeErrors);
      } else {
        setError(r.error);
      }
    });
  }

  // ─ ESC closes ─
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!transportId) return null;

  // ─ Filtering + sorting ─
  const filtered = (results ?? []).filter((o) =>
    activeMode === "ALL" ? true : o.mode === activeMode,
  );
  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "fastest") return a.durationSec - b.durationSec;
    if (sortKey === "cheapest") return (a.fareAmount ?? Infinity) - (b.fareAmount ?? Infinity);
    if (sortKey === "comfort") return b.comfortScore - a.comfortScore;
    if (sortKey === "co2") return (a.co2Grams ?? 0) - (b.co2Grams ?? 0);
    return b.recommendScore - a.recommendScore;
  });

  // ─ Handlers ─
  function handleApply(option: RouteOption) {
    if (!transportId || !results) return;
    setError(null);
    setSelectedOptionId(option.id);
    startApply(async () => {
      const r = await applyRouteOptionAction({
        tripId,
        transportId: transportId!,
        option,
        allOptions: results,
      });
      if (r.ok) onClose();
      else setError(r.error ?? "套用失敗");
    });
  }

  function handleSaveOverride() {
    if (!transportId) return;
    setError(null);
    const distM = Math.round(parseFloat(overrideDistance || "0") * 1000);
    const durSec = Math.round(parseFloat(overrideDuration || "0") * 60);
    const costNum = overrideCost === "" ? null : parseFloat(overrideCost);
    startApply(async () => {
      try {
        await updateTransportAction(tripId, transportId!, {
          distanceMeters: distM,
          durationSec: durSec,
          estimatedCost: costNum,
          notes: overrideNotes.trim() || null,
        });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "儲存失敗");
      }
    });
  }

  function handleApplyParsed(parsed: ParsedTransit) {
    if (parsed.durationMinutes != null) {
      setOverrideDuration(String(parsed.durationMinutes));
    }
    if (parsed.fareAmount != null) {
      setOverrideCost(String(parsed.fareAmount));
    }
    const noteParts: string[] = [];
    if (parsed.routeName) noteParts.push(parsed.routeName);
    if (parsed.departureTime && parsed.arrivalTime) {
      noteParts.push(`${parsed.departureTime} → ${parsed.arrivalTime}`);
    }
    if (parsed.notes) noteParts.push(parsed.notes);
    if (noteParts.length > 0) {
      setOverrideNotes(noteParts.join("｜"));
    }
    setShowOverride(true);
  }

  function handleReset() {
    if (!transportId) return;
    setError(null);
    startReset(async () => {
      try {
        await resetTransportAction(tripId, transportId!);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "重設失敗");
      }
    });
  }

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-[min(8vh,4rem)] backdrop-blur-sm"
    >
      <div
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-lg border border-hairline bg-canvas shadow-soft-elevation"
        style={{ maxHeight: "calc(100vh - min(16vh, 8rem))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — from / to + close */}
        <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-hairline-soft px-4 py-3">
          <div className="min-w-0">
            <p className="text-caption-uppercase text-muted-soft">SEGMENT</p>
            <h2 className="truncate text-title-md text-ink">
              {fromName} <span className="text-muted-soft">→</span> {toName}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-card hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>

        {/* Mode filter chips */}
        <div className="flex flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-hairline-soft px-3 py-2">
          {MODE_FILTERS.map((f) => {
            const active = activeMode === f.mode;
            const FIcon = f.icon;
            return (
              <button
                key={f.mode}
                onClick={() => setActiveMode(f.mode)}
                className={`inline-flex flex-shrink-0 items-center gap-1 rounded-pill border px-2.5 py-1 text-[11px] transition-colors ${
                  active
                    ? "border-ink bg-ink text-on-primary"
                    : "border-hairline bg-canvas text-muted hover:border-ink"
                }`}
              >
                <FIcon size={11} strokeWidth={1.8} />
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Sort control */}
        <div className="flex flex-shrink-0 items-center gap-1 border-b border-hairline-soft px-3 py-1.5 text-[10px] text-muted">
          <span className="mr-1">排序：</span>
          {SORT_ICONS.map((s) => {
            const active = sortKey === s.key;
            const SIcon = s.icon;
            return (
              <button
                key={s.key}
                onClick={() => setSortKey(s.key)}
                className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 ${
                  active ? "bg-ink/10 text-ink" : "hover:text-ink"
                }`}
              >
                <SIcon size={10} strokeWidth={1.8} />
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Body — scrollable list / flight panel */}
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {activeMode === "FLIGHT" ? (
            <FlightInfoPanel
              tripId={tripId}
              transport={transport}
              onClose={onClose}
              onSwitchToGround={() => setActiveMode("ALL")}
            />
          ) : (
            <>
              {loading && !results && (
                <div className="flex items-center gap-2 p-4 text-caption text-muted">
                  <Loader2 size={14} className="animate-spin" />
                  Routes API 查詢中（TRANSIT 失敗時自動降級到 Legacy）…
                </div>
              )}
              {error && (
                <div className="flex items-start gap-2 rounded-md border border-error/30 bg-error/5 p-3 text-[11px] text-error">
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {/* Phase 11.7 — surface per-mode failures so user sees ROOT cause */}
              {Object.keys(modeErrors).length > 0 && results && (
                <details className="rounded-md border border-warning/30 bg-warning/5 p-2 text-[11px]">
                  <summary className="cursor-pointer text-warning">
                    ⚠️ {Object.keys(modeErrors).length} 個模式查詢失敗，點開看原因
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {Object.entries(modeErrors).map(([mode, err]) => (
                      <li key={mode} className="text-ink">
                        <span className="font-mono text-[10px] text-muted">{mode}:</span>{" "}
                        <span className="break-all font-mono text-[10px]">{err}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {results && sorted.length === 0 && (
                <p className="rounded-md border border-dashed border-hairline-soft p-4 text-center text-caption text-muted-soft">
                  這個篩選沒有可用方案。試試切到「全部」，或這段地理上沒有對應路線。
                </p>
              )}
              {sorted.map((opt) => (
                <RouteOptionCard
                  key={opt.id}
                  option={opt}
                  isSelected={opt.id === selectedOptionId}
                  applying={applying && opt.id === selectedOptionId}
                  onSelect={() => handleApply(opt)}
                />
              ))}
              {activeMode === "TRANSIT" && (
                <TransitGoogleMapsPanel
                  googleMapsKey={googleMapsKey ?? null}
                  fromLat={fromLat ?? null}
                  fromLng={fromLng ?? null}
                  toLat={toLat ?? null}
                  toLng={toLng ?? null}
                  fromName={fromName}
                  toName={toName}
                  onApply={handleApplyParsed}
                />
              )}
            </>
          )}
        </div>

        {/* Manual override (collapsible) */}
        <div className="flex-shrink-0 border-t border-hairline-soft bg-surface-soft">
          <button
            type="button"
            onClick={() => setShowOverride((v) => !v)}
            className="flex w-full items-center justify-between gap-1 px-3 py-2 text-[11px] text-muted hover:text-ink"
          >
            <span>手動覆蓋（不使用上方推薦時填）</span>
            {showOverride ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          {showOverride && (
            <div className="space-y-2 px-3 pb-3">
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <label className="block">
                  <span className="text-muted-soft">距離 (km)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={overrideDistance}
                    onChange={(e) => setOverrideDistance(e.target.value)}
                    className="mt-0.5 h-8 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-muted-soft">時間 (分)</span>
                  <input
                    type="number"
                    step="1"
                    value={overrideDuration}
                    onChange={(e) => setOverrideDuration(e.target.value)}
                    className="mt-0.5 h-8 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-muted-soft">費用</span>
                  <input
                    type="number"
                    step="1"
                    placeholder="自動"
                    value={overrideCost}
                    onChange={(e) => setOverrideCost(e.target.value)}
                    className="mt-0.5 h-8 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none"
                  />
                </label>
              </div>
              <textarea
                value={overrideNotes}
                onChange={(e) => setOverrideNotes(e.target.value)}
                rows={2}
                placeholder="備註（提前 5 分出發、需轉乘…）"
                className="w-full rounded-md border border-hairline bg-canvas p-2 text-body-sm focus:border-ink focus:outline-none"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleSaveOverride}
                  disabled={applying}
                  className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-button text-on-primary hover:bg-primary-active disabled:opacity-60"
                >
                  {applying && <Loader2 size={11} className="animate-spin" />}
                  儲存手動覆蓋
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-t border-hairline-soft bg-surface-soft px-4 py-2">
          <button
            onClick={handleReset}
            disabled={resetting}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-[11px] text-muted hover:border-ink hover:text-ink disabled:opacity-60"
          >
            {resetting ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={11} />}
            重設為自動
          </button>
          <button
            onClick={handleRefetch}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-[11px] text-muted hover:border-ink hover:text-ink disabled:opacity-60"
            title="清掉快取重新向 Google Routes 查詢"
          >
            {loading ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={11} />}
            重新查詢
          </button>
          <a
            href={googleMapsDirUrl(fromName, toName)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-[11px] text-brand-accent hover:border-brand-accent"
          >
            <ExternalLink size={11} strokeWidth={1.8} />
            Google Maps
          </a>
          <button
            onClick={onClose}
            className="inline-flex h-8 items-center rounded-md px-3 text-[11px] text-muted hover:text-ink"
          >
            取消
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function googleMapsDirUrl(from: string, to: string): string {
  const params = new URLSearchParams({
    api: "1",
    origin: from,
    destination: to,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
