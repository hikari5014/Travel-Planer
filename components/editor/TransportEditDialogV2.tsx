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
  RotateCcw,
  TrainFront,
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
import { TransitKakaoMapsPanel } from "@/components/editor/TransitKakaoMapsPanel";
import { TransitStepTimeline } from "@/components/editor/TransitStepTimeline";
import type { ParsedTransit } from "@/lib/services/transit-rule-parser";
import { parseTransitStepsJson, type TransitSteps } from "@/lib/services/transit-steps-types";
import { applyTransitStepsAction } from "@/app/(actions)/transit-paste-actions";
import { useToast } from "@/components/ui/Toast";

// Phase 11 — Maps-style point-to-point picker.
//
// 取代 v1 TransportEditDialog 的「先選 mode → 看單一結果」流程。打開時
// 自動並行查 4 mode + alternatives + 推導 TAXI，整合排序後渲染為垂直
// 卡片清單。FLIGHT 段不進這個 dialog（在外層判斷後跳到 v1 飛行表單）。

// Phase 14p — FLIGHT chip removed; flight legs are managed exclusively via
// AddFlightDialog (full boarding-pass form) so the picker stays focused on
// ground transport. The FlightInfoPanel form is still mounted when an
// already-FLIGHT transport opens this dialog (for back-compat editing).
const MODE_FILTERS: Array<{ mode: RouteOptionMode | "ALL"; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; color: string }> = [
  { mode: "ALL", label: "全部", icon: Clock, color: "text-ink" },
  { mode: "WALKING", label: "步行", icon: Footprints, color: "text-success" },
  { mode: "TRANSIT", label: "大眾", icon: TrainFront, color: "text-brand-accent" },
  { mode: "DRIVING", label: "駕車", icon: Car, color: "text-warning" },
  { mode: "BICYCLING", label: "腳踏車", icon: Bike, color: "text-warning" },
  { mode: "TAXI", label: "計程車", icon: CarTaxiFront, color: "text-warning" },
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
  kakaoMapsKey,
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
  kakaoMapsKey?: string | null;
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
  const { addToast } = useToast();
  const [results, setResults] = useState<RouteOption[] | null>(cachedOptions);
  const [modeErrors, setModeErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  // Phase 14p — hydrate transit steps from DB so reopening the dialog still
  // shows the previously-parsed Google Maps timeline. Updated optimistically
  // on a fresh paste; cleared when user explicitly hits 「重新查詢」.
  const [transitSteps, setTransitSteps] = useState<TransitSteps | null>(
    parseTransitStepsJson(transport.transitStepsJson ?? null),
  );
  // Phase 15 — Tab toggle for transit panel provider. Defaults to Google to
  // preserve existing behavior; Kakao disabled without a JS key.
  const [transitProvider, setTransitProvider] = useState<"google" | "kakao">("google");
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

  // Phase 14p — auto-fetch on mount removed. Cached results (transport.routeOptionsJson)
  // still display from the initial state; users explicitly hit the 「查詢路線」
  // button below to spend any Routes API quota.

  function handleRefetch() {
    if (!transportId) return;
    setError(null);
    setResults(null);
    // Phase 14p — explicit re-query also clears the parsed transit timeline so
    // the user knows they're starting from a clean slate.
    setTransitSteps(null);
    void applyTransitStepsAction(tripId, transportId, null).catch(() => {
      /* fire-and-forget; tolerable to leave stale until next paste */
    });
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
    if (applying) return;
    if (!transportId || !results) return;
    setSelectedOptionId(option.id);
    startApply(async () => {
      const r = await applyRouteOptionAction({
        tripId,
        transportId: transportId!,
        option,
        allOptions: results,
      });
      if (r.ok) onClose();
      else addToast({ kind: "error", message: r.error ?? "套用失敗" });
    });
  }

  function handleSaveOverride() {
    if (applying) return;
    if (!transportId) return;
    const distM = Math.round(parseFloat(overrideDistance || "0") * 1000);
    const durSec = Math.round(parseFloat(overrideDuration || "0") * 60);
    const costNum = overrideCost === "" ? null : parseFloat(overrideCost);
    // Phase 13 fix — saving under a specific mode tab locks mode in.
    // "ALL" tab keeps existing mode untouched. updateTransport always sets
    // manuallyEdited=true so the chosen mode survives recalc.
    const lockedMode =
      activeMode !== "ALL" && activeMode !== "FLIGHT"
        ? (activeMode as "DRIVING" | "WALKING" | "TRANSIT" | "BICYCLING" | "TAXI")
        : undefined;
    startApply(async () => {
      try {
        await updateTransportAction(tripId, transportId!, {
          ...(lockedMode ? { mode: lockedMode } : {}),
          distanceMeters: distM,
          durationSec: durSec,
          estimatedCost: costNum,
          notes: overrideNotes.trim() || null,
        });
        onClose();
      } catch (e) {
        addToast({ kind: "error", message: e instanceof Error ? e.message : "儲存失敗" });
      }
    });
  }

  function handleApplyParsed(parsed: ParsedTransit, steps: TransitSteps | null) {
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
    // Phase 14p — show the freshly-parsed timeline immediately + persist it.
    // The cached timeline survives close + reopen; only 「重新查詢」 clears it.
    setTransitSteps(steps);
    if (transportId) {
      void applyTransitStepsAction(tripId, transportId, steps).catch((err) => {
        console.warn("[transit-steps] persist failed:", err);
      });
    }
  }

  function handleReset() {
    if (resetting) return;
    if (!transportId) return;
    startReset(async () => {
      try {
        await resetTransportAction(tripId, transportId!);
        onClose();
      } catch (e) {
        addToast({ kind: "error", message: e instanceof Error ? e.message : "重設失敗" });
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
              {/* Phase 14p — manual fetch entrypoint. Shown when there are
                  no cached results and we're not currently loading. */}
              {!results && !loading && (
                <button
                  type="button"
                  onClick={handleRefetch}
                  disabled={!transportId}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-brand-accent/40 bg-brand-accent/5 px-3 py-3 text-button text-brand-accent hover:bg-brand-accent/10 disabled:opacity-50"
                >
                  <Clock size={14} strokeWidth={1.8} />
                  查詢路線
                </button>
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
                  tripId={tripId}
                  transportId={transportId}
                  drivingSegmentsJson={transport.drivingSegmentsJson ?? null}
                />
              ))}
              {activeMode === "TRANSIT" && (
                <>
                  {/* Phase 15 — provider tab toggle. Google default; Kakao
                      disabled until JS key is set in /settings. */}
                  <div className="inline-flex overflow-hidden rounded-pill border border-hairline text-[11px]">
                    <button
                      type="button"
                      onClick={() => setTransitProvider("google")}
                      className={`inline-flex items-center gap-1 px-3 py-1 transition-colors ${
                        transitProvider === "google"
                          ? "bg-ink text-on-primary"
                          : "bg-canvas text-muted hover:text-ink"
                      }`}
                    >
                      🌐 Google Maps
                    </button>
                    <button
                      type="button"
                      onClick={() => kakaoMapsKey && setTransitProvider("kakao")}
                      disabled={!kakaoMapsKey}
                      title={kakaoMapsKey ? undefined : "需要先在設定填入 Kakao JavaScript Key"}
                      className={`inline-flex items-center gap-1 border-l border-hairline px-3 py-1 transition-colors ${
                        transitProvider === "kakao"
                          ? "bg-ink text-on-primary"
                          : "bg-canvas text-muted hover:text-ink"
                      } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-muted`}
                    >
                      🇰🇷 Kakao Maps
                    </button>
                  </div>
                  {transitProvider === "google" ? (
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
                  ) : (
                    <TransitKakaoMapsPanel
                      kakaoMapsKey={kakaoMapsKey ?? null}
                      fromLat={fromLat ?? null}
                      fromLng={fromLng ?? null}
                      toLat={toLat ?? null}
                      toLng={toLng ?? null}
                      fromName={fromName}
                      toName={toName}
                      onApply={handleApplyParsed}
                    />
                  )}
                  {/* Phase 14p — persisted Google Maps step timeline. Survives
                      close/reopen until the user hits 「重新查詢」 or pastes
                      new text (which overwrites). */}
                  {transitSteps && transitSteps.steps.length > 0 && (
                    <div className="rounded-md border border-hairline bg-canvas p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-caption-uppercase text-muted-soft">已解析路線</p>
                        <span className="text-[10px] text-muted-soft">
                          再次貼入新文字會覆蓋
                        </span>
                      </div>
                      <TransitStepTimeline steps={transitSteps} />
                    </div>
                  )}
                </>
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
          {(() => {
            const url =
              transitProvider === "kakao"
                ? kakaoMapsDirUrl(fromName, toName, fromLat ?? null, fromLng ?? null, toLat ?? null, toLng ?? null)
                : googleMapsDirUrl(fromName, toName);
            const label = transitProvider === "kakao" ? "Kakao Map" : "Google Maps";
            if (!url) {
              return (
                <span
                  className="inline-flex h-8 cursor-not-allowed items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-[11px] text-muted-soft"
                  title="缺少經緯度資料 — 先把地點重新綁定到 Google Place 取得座標後即可開啟"
                >
                  <ExternalLink size={11} strokeWidth={1.8} />
                  {label}（需要座標）
                </span>
              );
            }
            return (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-[11px] text-brand-accent hover:border-brand-accent"
              >
                <ExternalLink size={11} strokeWidth={1.8} />
                {label}
              </a>
            );
          })()}
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

// Phase 15 — Kakao Map deep link for the footer button. Returns null when
// coords are missing — Kakao's search index is Korean-only, so a Chinese-
// name fallback URL would just produce a 0-result search page. Caller
// should render a disabled "需要座標" state instead.
function kakaoMapsDirUrl(
  from: string,
  to: string,
  fromLat: number | null,
  fromLng: number | null,
  toLat: number | null,
  toLng: number | null,
): string | null {
  if (fromLat != null && fromLng != null && toLat != null && toLng != null) {
    return `https://map.kakao.com/link/by/traffic/${encodeURIComponent(from || "출발")},${fromLat},${fromLng}/${encodeURIComponent(to || "도착")},${toLat},${toLng}`;
  }
  return null;
}
