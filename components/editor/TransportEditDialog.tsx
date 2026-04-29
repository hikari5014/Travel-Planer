"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Car, TrainFront, Footprints, Wand2, X, RotateCcw, Sparkles, Loader2 } from "lucide-react";
import {
  resetTransportAction,
  updateTransportAction,
} from "@/app/(actions)/transport-actions";
import { aiSuggestTransportAction } from "@/app/(actions)/ai-actions";
import type { MockTransport, TransportMode } from "@/lib/mock-schedule";

// Edit one Transport segment. Lets the user override mode / distance / duration
// / cost / transit line / notes; once any change is saved, the transport is
// flagged manuallyEdited so recalcDayTransports preserves it. Reset to auto
// drops the override.

type Mode = TransportMode;

const MODES: { id: Mode; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; color: string }[] = [
  { id: "WALKING", label: "步行", icon: Footprints, color: "border-badge-emerald bg-badge-emerald/10" },
  { id: "DRIVING", label: "駕車", icon: Car, color: "border-badge-orange bg-badge-orange/10" },
  { id: "TRANSIT", label: "大眾運輸", icon: TrainFront, color: "border-brand-accent bg-brand-accent/10" },
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
          modeHint: mode,
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

  return (
    <Backdrop onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-hairline-soft px-4 py-3">
        <div>
          <p className="text-caption-uppercase text-muted-soft">EDIT TRANSPORT</p>
          <h2 className="text-title-md text-ink">移動段：{fromName} → {toName}</h2>
        </div>
        <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-card hover:text-ink">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-4 p-4">
        {/* Mode picker */}
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-wide text-muted">交通方式</p>
          <div className="grid grid-cols-4 gap-2">
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

      <div className="flex items-center justify-between gap-2 border-t border-hairline-soft bg-surface-soft px-4 py-3">
        <button
          onClick={reset}
          disabled={isResetting}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-button text-muted hover:border-ink hover:text-ink disabled:opacity-60"
        >
          <RotateCcw size={12} strokeWidth={1.8} />
          重設為自動
        </button>
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
  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border border-hairline bg-canvas shadow-soft-elevation"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
