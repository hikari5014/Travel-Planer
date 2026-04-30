"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Bike,
  Car,
  Check,
  ExternalLink,
  Footprints,
  Loader2,
  Plane,
  RotateCcw,
  Sparkles,
  TrainFront,
  TrafficCone,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import {
  applyTransportModeAction,
  compareTransportModesAction,
  refreshTransportDirectionsAction,
  resetTransportAction,
  updateTransportAction,
} from "@/app/(actions)/transport-actions";
import { aiSuggestTransportAction } from "@/app/(actions)/ai-actions";
import type { MockTransport, TransportMode } from "@/lib/mock-schedule";
import type { ModesSummary } from "@/lib/services/directions-service";
import { TransitStepsList } from "@/components/editor/TransitStepsList";
import { KindMetadataForm } from "@/components/editor/KindMetadataForm";
import { applyFlightSuggestionToTransportAction, suggestFlightInfoAction } from "@/app/(actions)/flight-actions";

// Edit one Transport segment + manage Google Routes API integration:
//  · 4-mode side-by-side comparison (DRIVING / WALKING / TRANSIT / BICYCLING)
//  · transit step-by-step details (lines, stops, fare, headway)
//  · driving traffic level + warnings
//  · "refresh directions" + "AI 自動填入" + "reset to auto"

type Mode = TransportMode;

const MODES: { id: Mode; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; color: string }[] = [
  { id: "WALKING", label: "步行", icon: Footprints, color: "border-badge-emerald bg-badge-emerald/10" },
  { id: "DRIVING", label: "駕車", icon: Car, color: "border-badge-orange bg-badge-orange/10" },
  { id: "TRANSIT", label: "大眾運輸", icon: TrainFront, color: "border-brand-accent bg-brand-accent/10" },
  { id: "BICYCLING", label: "自行車", icon: Bike, color: "border-badge-orange bg-badge-orange/10" },
  { id: "FLIGHT", label: "飛機", icon: Plane, color: "border-brand-accent bg-brand-accent/10" },
  { id: "CUSTOM", label: "自訂", icon: Wand2, color: "border-badge-violet bg-badge-violet/10" },
];

export function TransportEditDialog({
  tripId,
  transport,
  fromName,
  toName,
  region,
  onClose,
}: {
  tripId: string;
  transport: MockTransport;
  fromName: string;
  toName: string;
  region?: string; // hint for AI ("京都 / 日本", "台北市") so suggestions are localized
  onClose: () => void;
}) {
  const transportId = transport.id;
  const [mode, setMode] = useState<Mode>(transport.mode);
  const [distanceKm, setDistanceKm] = useState((transport.distanceM / 1000).toFixed(1));
  const [durationMin, setDurationMin] = useState(String(Math.round(transport.durationSec / 60)));
  const [cost, setCost] = useState(transport.estimatedCost != null ? String(transport.estimatedCost) : "");
  const [transitLine, setTransitLine] = useState(transport.transitLine ?? "");
  const [originLabel, setOriginLabel] = useState(transport.originLabel ?? "");
  const [destinationLabel, setDestinationLabel] = useState(transport.destinationLabel ?? "");
  const [notes, setNotes] = useState(transport.notes ?? "");
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isAILoading, startAI] = useTransition();
  const [isResetting, startReset] = useTransition();
  // Phase 9d — compare-modes state
  const [modesSummary, setModesSummary] = useState<ModesSummary | null>(null);
  const [isComparing, startCompare] = useTransition();
  const [isRefreshing, startRefresh] = useTransition();
  const [isApplyingMode, startApplyMode] = useTransition();
  // Phase 10h — bumped when transit cache is refreshed so TransitStepsList re-fetches
  const [transitRefreshKey, setTransitRefreshKey] = useState(0);
  const [autoTransitTried, setAutoTransitTried] = useState(false);
  // Track what the cached encodedPolyline actually represents (initial guess
  // = transport.mode). Updated after successful auto-refresh to TRANSIT.
  const [cacheMode, setCacheMode] = useState<TransportMode>(transport.mode);
  const [transitFailed, setTransitFailed] = useState<string | null>(null);

  // Phase 10i — flight metadata draft (only populated when mode === FLIGHT)
  const [flightMeta, setFlightMeta] = useState<Record<string, unknown>>(
    (transport.metadata ?? {}) as Record<string, unknown>,
  );
  const [flightLookupPending, startFlightLookup] = useTransition();
  const [flightLookupError, setFlightLookupError] = useState<string | null>(null);
  const flightDate = new Date().toISOString().slice(0, 10);

  async function handleFlightLookup() {
    if (!transportId) return;
    const flightNumber = (flightMeta.flightNumber as string | null | undefined)?.trim();
    if (!flightNumber) {
      setFlightLookupError("請先填入航班號碼");
      return;
    }
    setFlightLookupError(null);
    startFlightLookup(async () => {
      const r = await suggestFlightInfoAction({ flightNumber, date: flightDate });
      if (!r.ok) {
        setFlightLookupError(r.error);
        return;
      }
      const ai = r.info;
      setFlightMeta((prev) => ({
        ...prev,
        airline: prev.airline ?? ai.airline ?? null,
        depAirport: prev.depAirport ?? ai.depAirport ?? null,
        arrAirport: prev.arrAirport ?? ai.arrAirport ?? null,
        depCity: prev.depCity ?? ai.depCity ?? null,
        arrCity: prev.arrCity ?? ai.arrCity ?? null,
        depTime: prev.depTime ?? ai.depTime ?? null,
        arrTime: prev.arrTime ?? ai.arrTime ?? null,
        terminal: prev.terminal ?? ai.terminal ?? null,
        isInternational: prev.isInternational ?? ai.isInternational ?? null,
      }));
      // Persist immediately + flip mode to FLIGHT + compute durationSec
      const persist = await applyFlightSuggestionToTransportAction({
        tripId,
        transportId,
        info: ai,
        date: flightDate,
      });
      if (!persist.ok) setFlightLookupError(persist.error ?? "套用失敗");
      else setMode("FLIGHT");
    });
  }

  // Auto-refresh transit details the first time the user picks TRANSIT
  // without a TRANSIT cache (Google-Maps-style behaviour).
  useEffect(() => {
    if (
      mode === "TRANSIT" &&
      !autoTransitTried &&
      transportId &&
      cacheMode !== "TRANSIT"
    ) {
      setAutoTransitTried(true);
      setTransitFailed(null);
      startRefresh(async () => {
        const res = await refreshTransportDirectionsAction(tripId, transportId, "TRANSIT");
        if (res.ok) {
          setCacheMode("TRANSIT");
          setTransitRefreshKey((k) => k + 1);
          setAiNotice("已自動查詢大眾運輸路線。");
        } else {
          setTransitFailed(res.error || "Google Routes 無 TRANSIT 路線");
        }
      });
    }
  }, [mode, autoTransitTried, transportId, cacheMode, tripId]);

  if (!transportId) {
    return (
      <Backdrop onClose={onClose}>
        <p className="text-body-sm text-muted">此移動段尚未存入資料庫，無法編輯。</p>
      </Backdrop>
    );
  }

  function save() {
    const distanceMeters = Math.round(parseFloat(distanceKm || "0") * 1000);
    const durationSec = Math.round(parseFloat(durationMin || "0") * 60);
    const costNum = cost === "" ? null : parseFloat(cost);
    setError(null);
    startSave(async () => {
      try {
        await updateTransportAction(tripId, transportId!, {
          mode,
          distanceMeters,
          durationSec,
          estimatedCost: costNum,
          transitLine: transitLine.trim() || null,
          originLabel: originLabel.trim() || null,
          destinationLabel: destinationLabel.trim() || null,
          notes: notes.trim() || null,
          // Phase 10i — flight metadata only meaningful when mode=FLIGHT;
          // store regardless so user can flip back without losing what they typed.
          metadataJson:
            mode === "FLIGHT" && Object.keys(flightMeta).length > 0
              ? JSON.stringify(flightMeta)
              : null,
        });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function reset() {
    setError(null);
    startReset(async () => {
      try {
        await resetTransportAction(tripId, transportId!);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function aiFill() {
    setError(null);
    setAiNotice(null);
    startAI(async () => {
      try {
        const result = await aiSuggestTransportAction({
          tripId,
          transportId: transportId!,
          fromName,
          toName,
          modeHint: mode === "FLIGHT" ? "CUSTOM" : mode,
          region,
        });
        if (result?.distanceMeters != null) setDistanceKm((result.distanceMeters / 1000).toFixed(1));
        if (result?.durationSec != null) setDurationMin(String(Math.round(result.durationSec / 60)));
        if (result?.estimatedCost != null) setCost(String(result.estimatedCost));
        if (result?.transitLine) setTransitLine(result.transitLine);
        if (result?.notes) setNotes(result.notes);
        if (result?.mode) setMode(result.mode);
        setAiNotice("AI 已填入，請檢查後按「儲存覆蓋」確認。");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  // ─ Phase 9d: Routes API compare + refresh ─────────────────────────────
  function compareModes() {
    setError(null);
    startCompare(async () => {
      const r = await compareTransportModesAction(transportId!);
      if (r.ok) {
        setModesSummary(r.modes);
      } else {
        setError(r.error);
      }
    });
  }

  function applyMode(m: "DRIVING" | "WALKING" | "TRANSIT" | "BICYCLING") {
    setError(null);
    startApplyMode(async () => {
      const r = await applyTransportModeAction(tripId, transportId!, m);
      if (r.ok) {
        setMode(m);
        // Pull values from the just-applied mode summary so the form
        // reflects the new chosen.
        const sum = modesSummary?.[m];
        if (sum?.ok) {
          if (sum.distanceMeters != null) setDistanceKm((sum.distanceMeters / 1000).toFixed(1));
          if (sum.durationSec != null) setDurationMin(String(Math.round(sum.durationSec / 60)));
          if (sum.fare?.amount != null) setCost(String(sum.fare.amount));
        }
        setAiNotice(`已套用「${MODES.find((mm) => mm.id === m)?.label ?? m}」模式 — 點「儲存覆蓋」鎖定。`);
      } else {
        setError(r.error);
      }
    });
  }

  function refreshDirections() {
    setError(null);
    if (mode === "CUSTOM" || mode === "FLIGHT") return;
    startRefresh(async () => {
      const r = await refreshTransportDirectionsAction(tripId, transportId!, mode);
      if (r.ok) {
        setAiNotice("已重新查詢路線。距離 / 時間 / 費用已更新（請重新整理才看得到地圖路線）");
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <Backdrop onClose={onClose}>
      <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-hairline-soft px-4 py-3">
        <div>
          <p className="text-caption-uppercase text-muted-soft">EDIT TRANSPORT</p>
          <h2 className="text-title-md text-ink">移動段：{fromName} → {toName}</h2>
        </div>
        <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-card hover:text-ink">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Mode picker */}
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-wide text-muted">交通方式</p>
          <div className="grid grid-cols-6 gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex flex-col items-center gap-1 rounded-md border p-2 text-caption transition-colors ${
                  m.id === mode ? `${m.color} ring-1 ring-ink/30` : "border-hairline bg-canvas hover:border-ink"
                }`}
              >
                <m.icon size={16} strokeWidth={1.8} />
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* ─ Phase 10i: FLIGHT — flight info form + AI auto-fill ─ */}
        {mode === "FLIGHT" && (
          <div className="space-y-3 rounded-md border border-brand-accent/30 bg-brand-accent/5 p-3">
            <div>
              <p className="flex items-center gap-1 text-caption font-medium text-ink">
                <Plane size={12} strokeWidth={2} className="text-brand-accent" />
                航班資訊
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                飛機段不查 Google Routes — 填入航班號 + AI 補完，或全部手動輸入。
              </p>
            </div>
            <button
              disabled={flightLookupPending}
              onClick={handleFlightLookup}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-brand-accent bg-canvas py-1.5 text-caption text-brand-accent hover:bg-brand-accent/10 disabled:opacity-60"
            >
              {flightLookupPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} fill="currentColor" />
              )}
              {flightLookupPending ? "查詢中…" : "請 AI 補完航班資訊"}
            </button>
            {flightLookupError && (
              <p className="rounded-md border border-error/30 bg-error/5 p-2 text-[11px] text-error">
                {flightLookupError}
              </p>
            )}
            <KindMetadataForm
              kind="FLIGHT"
              value={flightMeta}
              onChange={setFlightMeta}
              baseCurrency="TWD"
            />
          </div>
        )}

        {/* ─ Phase 9d: 4-mode compare via Google Routes API ─ */}
        {mode !== "FLIGHT" && (
        <div className="rounded-md border border-hairline bg-surface-soft p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-1 text-caption font-medium text-ink">
                <Zap size={12} strokeWidth={2} />
                Google Routes 路線對比
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                查詢駕車 / 步行 / 大眾運輸 / 自行車 4 種模式的真實時間與費用，可一鍵套用任一個。
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1">
              <button
                onClick={refreshDirections}
                disabled={isRefreshing || isComparing}
                title="重新查詢目前模式的最新路線（含路況）"
                className="inline-flex h-8 items-center gap-1 rounded-md border border-hairline bg-canvas px-2 text-[11px] text-ink hover:border-ink disabled:opacity-60"
              >
                {isRefreshing ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                刷新
              </button>
              <button
                onClick={compareModes}
                disabled={isComparing || isRefreshing}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-[11px] text-on-primary hover:bg-primary-active disabled:opacity-60"
              >
                {isComparing ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} strokeWidth={2} />}
                {isComparing ? "查詢中…" : "比對 4 種模式"}
              </button>
            </div>
          </div>

          {modesSummary && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {(["DRIVING", "WALKING", "TRANSIT", "BICYCLING"] as const).map((m) => {
                const sum = modesSummary[m];
                const meta = MODES.find((mm) => mm.id === m)!;
                const isCurrent = mode === m;
                return (
                  <button
                    key={m}
                    disabled={!sum.ok || isApplyingMode}
                    onClick={() => sum.ok && applyMode(m)}
                    className={`flex flex-col items-center gap-1 rounded-md border p-2 text-center transition-colors ${
                      !sum.ok
                        ? "cursor-not-allowed border-hairline-soft bg-surface-soft opacity-60"
                        : isCurrent
                          ? `${meta.color} ring-1 ring-ink/30`
                          : "border-hairline bg-canvas hover:border-ink"
                    }`}
                  >
                    <meta.icon size={14} strokeWidth={1.8} />
                    <span className="text-[10px] text-muted-soft">{meta.label}</span>
                    {sum.ok ? (
                      <>
                        <span className="font-mono text-body-sm text-ink leading-tight">
                          {Math.round((sum.durationSec ?? 0) / 60)} 分
                        </span>
                        <span className="font-mono text-[10px] text-muted">
                          {((sum.distanceMeters ?? 0) / 1000).toFixed(1)} km
                        </span>
                        {sum.fare?.amount != null && (
                          <span className="font-mono text-[10px] text-warning">
                            {sum.fare.currency} {Math.round(sum.fare.amount)}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="text-[9px] text-success">✓ 目前</span>
                        )}
                      </>
                    ) : (
                      <span className="text-[10px] text-error">無路線</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        )}

        {/* ─ Mode-specific detail panels ─ */}
        {mode === "TRANSIT" && transportId && cacheMode === "TRANSIT" && !transitFailed && (
          <TransitStepsList
            key={transitRefreshKey}
            transportId={transportId}
            fareCurrency={transport.fareCurrency}
            fareAmount={transport.fareAmount}
            totalDistanceM={transport.distanceM}
            totalDurationSec={transport.durationSec}
            transitLine={transport.transitLine}
          />
        )}
        {mode === "TRANSIT" && transitFailed && (
          <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
            <p className="flex items-center gap-1 text-caption font-medium text-ink">
              <AlertTriangle size={12} strokeWidth={2} className="text-warning" />
              此段無大眾運輸路線
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Google Routes 找不到從「{fromName}」到「{toName}」的可行 TRANSIT 路徑。常見原因：
              起點或終點離車站太遠（&gt;1 km）、距離過長無 inter-city 路線、或非營運時段。
              建議改用駕車 / 步行，或先把附近車站建為一個中繼景點再分段。
            </p>
            <p className="mt-1 font-mono text-[10px] text-error">{transitFailed}</p>
          </div>
        )}
        {mode === "TRANSIT" && !transitFailed && cacheMode !== "TRANSIT" && isRefreshing && (
          <div className="rounded-md border border-brand-accent/30 bg-brand-accent/5 p-3 text-caption text-brand-accent">
            <Loader2 size={12} className="mr-1 inline-block animate-spin" />
            正在向 Google Routes 查詢大眾運輸路線…
          </div>
        )}
        {mode === "DRIVING" && transport.trafficLevel && (
          <DrivingDetailHint trafficLevel={transport.trafficLevel} />
        )}

        {/* Origin / destination override labels */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="起點顯示文字（選填）">
            <input
              value={originLabel}
              onChange={(e) => setOriginLabel(e.target.value)}
              placeholder={fromName}
              className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none"
            />
          </Field>
          <Field label="終點顯示文字（選填）">
            <input
              value={destinationLabel}
              onChange={(e) => setDestinationLabel(e.target.value)}
              placeholder={toName}
              className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none"
            />
          </Field>
        </div>

        {/* Distance / duration / cost */}
        <div className="grid grid-cols-3 gap-3">
          <Field label="距離 (km)">
            <input
              type="number"
              step="0.1"
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none"
            />
          </Field>
          <Field label="時間 (分)">
            <input
              type="number"
              step="1"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none"
            />
          </Field>
          <Field label="費用">
            <input
              type="number"
              step="1"
              placeholder="自動"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none"
            />
          </Field>
        </div>

        {/* Transit line (only meaningful for TRANSIT) */}
        {mode === "TRANSIT" && (
          <Field label="路線 / 班次">
            <input
              value={transitLine}
              onChange={(e) => setTransitLine(e.target.value)}
              placeholder="例：JR 山手線 → 銀座線；台北捷運紅線 R5 → R10"
              className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none"
            />
          </Field>
        )}

        <Field label="備註">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="例：尖峰時段擁擠、需轉乘、提前 5 分鐘出發"
            className="w-full rounded-md border border-hairline bg-canvas p-2 text-body-sm focus:border-ink focus:outline-none"
          />
        </Field>

        {/* AI auto-fill */}
        <div className="rounded-md border border-dashed border-hairline bg-surface-soft p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1 text-caption font-medium text-ink">
                <Sparkles size={12} strokeWidth={2} />
                AI 自動規劃
              </p>
              <p className="mt-1 text-[11px] text-muted">
                透過 LLM 估算距離 / 時間 / 路線（含台日韓大眾運輸知識）。需先在設定加入 LLM Provider。
              </p>
            </div>
            <button
              onClick={aiFill}
              disabled={isAILoading}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-button text-on-primary hover:bg-primary-active disabled:opacity-60"
            >
              {isAILoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} strokeWidth={2} />}
              AI 填入
            </button>
          </div>
          {aiNotice && <p className="mt-2 text-[11px] text-success">{aiNotice}</p>}
        </div>

        {error && (
          <p className="rounded-md border border-error/30 bg-error/5 px-3 py-2 text-caption text-error">
            錯誤：{error}
          </p>
        )}

        {transport.manuallyEdited && (
          <p className="text-[11px] text-muted-soft">
            此移動段為手動覆蓋；重新排序景點時會嘗試保留覆蓋值。
          </p>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-t border-hairline-soft bg-surface-soft px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            disabled={isResetting}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-button text-muted hover:border-ink hover:text-ink disabled:opacity-60"
          >
            <RotateCcw size={12} strokeWidth={1.8} />
            重設為自動
          </button>
          <a
            href={googleMapsDirUrl(fromName, toName, mode)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-[11px] text-brand-accent hover:border-brand-accent"
            title="於 Google Maps 顯示這段路線"
          >
            <ExternalLink size={11} strokeWidth={1.8} />
            Google Maps
          </a>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md border border-hairline bg-canvas px-3 text-button text-ink hover:border-ink"
          >
            取消
          </button>
          <button
            onClick={save}
            disabled={isSaving}
            className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-button text-on-primary hover:bg-primary-active disabled:opacity-60"
          >
            {isSaving && <Loader2 size={12} className="animate-spin" />}
            儲存覆蓋
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

function DrivingDetailHint({ trafficLevel }: { trafficLevel: "light" | "moderate" | "heavy" }) {
  const meta = {
    light: { label: "順暢", color: "text-success", bg: "bg-success/5", border: "border-success/30" },
    moderate: { label: "中等壅塞", color: "text-warning", bg: "bg-warning/5", border: "border-warning/30" },
    heavy: { label: "嚴重壅塞", color: "text-error", bg: "bg-error/5", border: "border-error/30" },
  }[trafficLevel];
  return (
    <div className={`rounded-md border ${meta.border} ${meta.bg} p-3`}>
      <p className={`flex items-center gap-1 text-caption font-medium ${meta.color}`}>
        <TrafficCone size={12} strokeWidth={2} />
        即時路況：{meta.label}
      </p>
      <p className="mt-1 text-[11px] text-muted">
        依 Google Routes 在預定出發時間（依景點時段）的歷史平均路況推估。
      </p>
    </div>
  );
}

// Phase 10g — Google Maps directions deeplink. Uses place names as text query
// (not coords) so it works for custom places without lat/lng. Mode mapping
// follows Google Maps' travelmode param.
function googleMapsDirUrl(from: string, to: string, mode: TransportMode): string {
  const travelmode =
    mode === "WALKING" ? "walking" :
    mode === "BICYCLING" ? "bicycling" :
    mode === "TRANSIT" ? "transit" : "driving";
  const params = new URLSearchParams({
    api: "1",
    origin: from,
    destination: to,
    travelmode,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  if (typeof window === "undefined") return null;
  // Phase 10f — backdrop scrolls when content exceeds viewport; card itself
  // is flex-col with max-h so internal sticky header/footer stay visible.
  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-[min(8vh,4rem)] backdrop-blur-sm"
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-lg border border-hairline bg-canvas shadow-soft-elevation"
        style={{ maxHeight: "calc(100vh - min(16vh, 8rem))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
