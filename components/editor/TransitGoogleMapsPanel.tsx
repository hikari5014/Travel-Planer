"use client";

import { useEffect, useState, useTransition } from "react";
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import {
  parseTransitPasteRuleBasedAction,
  parseTransitPasteLlmAction,
} from "@/app/(actions)/transit-paste-actions";
import type { ParsedTransit } from "@/lib/services/transit-rule-parser";
import { filledFieldCount } from "@/lib/services/transit-rule-parser";

type ParserMode = "rule" | "llm";
const STORAGE_KEY = "transit-paste-parser-mode";

export function TransitGoogleMapsPanel({
  googleMapsKey,
  fromLat,
  fromLng,
  toLat,
  toLng,
  fromName,
  toName,
  onApply,
}: {
  googleMapsKey: string | null;
  fromLat: number | null;
  fromLng: number | null;
  toLat: number | null;
  toLng: number | null;
  fromName: string;
  toName: string;
  onApply: (parsed: ParsedTransit) => void;
}) {
  const [mode, setMode] = useState<ParserMode>("rule");
  const [pasted, setPasted] = useState("");
  const [parsing, startParse] = useTransition();
  const [parsed, setParsed] = useState<ParsedTransit | null>(null);
  const [ruleParsed, setRuleParsed] = useState<ParsedTransit | null>(null); // shadow result in LLM mode
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "rule" || saved === "llm") setMode(saved);
    } catch {
      // localStorage unavailable
    }
  }, []);

  function switchMode(next: ParserMode) {
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  const hasCoords =
    fromLat != null && fromLng != null && toLat != null && toLng != null;
  const canShowIframe = !!googleMapsKey && hasCoords;

  const iframeUrl = canShowIframe
    ? `https://www.google.com/maps/embed/v1/directions?${new URLSearchParams({
        key: googleMapsKey!,
        origin: `${fromLat},${fromLng}`,
        destination: `${toLat},${toLng}`,
        mode: "transit",
        language: "zh-TW",
      })}`
    : null;

  const deepLinkUrl = `https://www.google.com/maps/dir/?${new URLSearchParams({
    api: "1",
    origin: hasCoords ? `${fromLat},${fromLng}` : fromName,
    destination: hasCoords ? `${toLat},${toLng}` : toName,
    travelmode: "transit",
  })}`;

  function runParse() {
    if (!pasted.trim()) return;
    setError(null);
    setParsed(null);
    setRuleParsed(null);
    startParse(async () => {
      if (mode === "rule") {
        const r = await parseTransitPasteRuleBasedAction(pasted);
        setParsed(r);
      } else {
        // LLM-priority — kick off both in parallel for diff display
        const [llmR, ruleR] = await Promise.all([
          parseTransitPasteLlmAction(pasted),
          parseTransitPasteRuleBasedAction(pasted),
        ]);
        if (llmR.ok) {
          setParsed(llmR.parsed);
          setRuleParsed(ruleR);
        } else {
          // LLM failed → fall back to rule
          setParsed(ruleR);
          setError(`AI 解析失敗：${llmR.error}（已回退到規則解析）`);
        }
      }
    });
  }

  function runLlmFillIn() {
    if (!pasted.trim() || !parsed) return;
    setError(null);
    startParse(async () => {
      const llmR = await parseTransitPasteLlmAction(pasted);
      if (!llmR.ok) {
        setError(`AI 解析失敗：${llmR.error}`);
        return;
      }
      // Merge — keep existing rule values, fill nulls from LLM
      setParsed({
        durationMinutes: parsed.durationMinutes ?? llmR.parsed.durationMinutes,
        fareAmount: parsed.fareAmount ?? llmR.parsed.fareAmount,
        fareCurrency: parsed.fareCurrency ?? llmR.parsed.fareCurrency,
        routeName: parsed.routeName ?? llmR.parsed.routeName,
        departureTime: parsed.departureTime ?? llmR.parsed.departureTime,
        arrivalTime: parsed.arrivalTime ?? llmR.parsed.arrivalTime,
        transferCount: parsed.transferCount ?? llmR.parsed.transferCount,
        notes: parsed.notes ?? llmR.parsed.notes,
        _confidence: parsed._confidence,
      });
    });
  }

  const filled = parsed ? filledFieldCount(parsed) : 0;
  const showLlmFillButton = mode === "rule" && parsed != null && filled < 4;

  return (
    <div className="space-y-2 border-t border-hairline-soft bg-surface-soft px-3 py-3">
      <p className="text-caption-uppercase text-muted-soft">Google Maps 整合</p>

      {/* iframe */}
      {iframeUrl ? (
        <iframe
          title="Google Maps transit preview"
          src={iframeUrl}
          className="h-72 w-full rounded-md border border-hairline"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <div className="flex items-start gap-2 rounded-md border border-dashed border-hairline-soft bg-canvas p-3 text-[11px] text-muted">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span>
            {!googleMapsKey
              ? "未設定 Google Maps API key — 至 /settings 設定後可顯示路線預覽。"
              : "起點或終點缺少經緯度資料，無法顯示路線預覽。"}
          </span>
        </div>
      )}

      {/* Deep link */}
      <a
        href={deepLinkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-8 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-[11px] text-brand-accent hover:border-brand-accent"
      >
        <ExternalLink size={11} strokeWidth={1.8} />
        在 Google Maps 開啟
      </a>

      {/* Paste area */}
      <div className="space-y-2 rounded-md border border-hairline bg-canvas p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-caption text-muted">從 Google Maps 複製路線資訊</span>
          <div className="inline-flex overflow-hidden rounded-pill border border-hairline text-[10px]">
            <button
              type="button"
              onClick={() => switchMode("rule")}
              className={`inline-flex items-center gap-1 px-2 py-1 transition-colors ${
                mode === "rule" ? "bg-ink text-on-primary" : "bg-canvas text-muted hover:text-ink"
              }`}
            >
              <Zap size={10} strokeWidth={1.8} />
              Rule 優先
            </button>
            <button
              type="button"
              onClick={() => switchMode("llm")}
              className={`inline-flex items-center gap-1 px-2 py-1 transition-colors ${
                mode === "llm" ? "bg-ink text-on-primary" : "bg-canvas text-muted hover:text-ink"
              }`}
            >
              <Sparkles size={10} strokeWidth={1.8} />
              AI 優先
            </button>
          </div>
        </div>

        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={4}
          placeholder="把 Google Maps 路線結果整段選起來貼進這裡（含時間、票價、路線名）…"
          className="w-full rounded-md border border-hairline bg-surface-soft p-2 text-body-sm focus:border-ink focus:outline-none"
        />

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={runParse}
            disabled={parsing || !pasted.trim()}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-button text-on-primary hover:bg-primary-active disabled:opacity-60"
          >
            {parsing ? (
              <Loader2 size={11} className="animate-spin" />
            ) : mode === "rule" ? (
              <Zap size={11} strokeWidth={1.8} />
            ) : (
              <Sparkles size={11} strokeWidth={1.8} />
            )}
            自動解析
          </button>
          {pasted && (
            <button
              type="button"
              onClick={() => {
                setPasted("");
                setParsed(null);
                setRuleParsed(null);
                setError(null);
              }}
              className="text-[10px] text-muted hover:text-ink"
            >
              清除
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-error/30 bg-error/5 p-2 text-[11px] text-error">
            <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {parsed && (
          <ParsedFieldsPreview
            parsed={parsed}
            ruleShadow={ruleParsed}
            onApply={() => onApply(parsed)}
          />
        )}

        {showLlmFillButton && (
          <button
            type="button"
            onClick={runLlmFillIn}
            disabled={parsing}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-hairline bg-canvas px-2 text-[10px] text-muted hover:border-brand-accent hover:text-brand-accent disabled:opacity-60"
          >
            {parsing ? (
              <Loader2 size={10} className="animate-spin" />
            ) : (
              <Wand2 size={10} strokeWidth={1.8} />
            )}
            {filled <= 1 ? "用 AI 解析（規則無法擷取）" : "用 AI 補完缺少的欄位"}
          </button>
        )}
      </div>
    </div>
  );
}

function ParsedFieldsPreview({
  parsed,
  ruleShadow,
  onApply,
}: {
  parsed: ParsedTransit;
  ruleShadow: ParsedTransit | null;
  onApply: () => void;
}) {
  function row(label: string, llmVal: string, ruleVal: string | null) {
    const showShadow = ruleShadow != null && ruleVal != null && ruleVal !== llmVal;
    return (
      <div className="flex items-baseline gap-2">
        <span className="w-12 flex-shrink-0 text-muted-soft">{label}</span>
        <span className="font-mono text-ink">{llmVal || "—"}</span>
        {showShadow && (
          <span className="text-[9px] text-muted-soft">規則：{ruleVal}</span>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-1 rounded-md border border-hairline-soft bg-surface-soft p-2 text-[11px]">
      {row(
        "時間",
        parsed.durationMinutes != null ? `${parsed.durationMinutes} 分` : "",
        ruleShadow?.durationMinutes != null ? `${ruleShadow.durationMinutes} 分` : null,
      )}
      {row(
        "票價",
        parsed.fareAmount != null
          ? `${parsed.fareCurrency ?? ""} ${parsed.fareAmount}`.trim()
          : "",
        ruleShadow?.fareAmount != null
          ? `${ruleShadow.fareCurrency ?? ""} ${ruleShadow.fareAmount}`.trim()
          : null,
      )}
      {row("路線", parsed.routeName ?? "", ruleShadow?.routeName ?? null)}
      {row(
        "出發",
        parsed.departureTime ?? "",
        ruleShadow?.departureTime ?? null,
      )}
      {row(
        "抵達",
        parsed.arrivalTime ?? "",
        ruleShadow?.arrivalTime ?? null,
      )}
      {parsed.notes && (
        <div className="flex items-baseline gap-2">
          <span className="w-12 flex-shrink-0 text-muted-soft">備註</span>
          <span className="text-muted">{parsed.notes}</span>
        </div>
      )}
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={onApply}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-button text-on-primary hover:bg-primary-active"
        >
          套用到欄位
        </button>
      </div>
    </div>
  );
}
