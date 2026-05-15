"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
import type { TransitSteps } from "@/lib/services/transit-steps-types";
import { loadKakaoSdk } from "@/lib/kakao-sdk-loader";

// Phase 15 — Kakao Maps panel. Mirrors TransitGoogleMapsPanel but uses Kakao
// JS SDK (Kakao has no public embed iframe API; we inject the SDK script and
// render a Kakao Map into a div). Same paste-and-parse flow re-uses the
// existing rule + LLM parsers; the LLM prompt already handles Korean +
// emits 中韓對照 station names.

type ParserMode = "rule" | "llm";
const STORAGE_KEY = "transit-paste-parser-mode";

export function TransitKakaoMapsPanel({
  kakaoMapsKey,
  fromLat,
  fromLng,
  toLat,
  toLng,
  fromName,
  toName,
  onApply,
}: {
  kakaoMapsKey: string | null;
  fromLat: number | null;
  fromLng: number | null;
  toLat: number | null;
  toLng: number | null;
  fromName: string;
  toName: string;
  onApply: (parsed: ParsedTransit, steps: TransitSteps | null) => void;
}) {
  const [mode, setMode] = useState<ParserMode>("rule");
  const [pasted, setPasted] = useState("");
  const [parsing, startParse] = useTransition();
  const [parsed, setParsed] = useState<ParsedTransit | null>(null);
  const [ruleParsed, setRuleParsed] = useState<ParsedTransit | null>(null);
  const [parsedSteps, setParsedSteps] = useState<TransitSteps | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [sdkLoading, setSdkLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "rule" || saved === "llm") setMode(saved);
    } catch {
      /* ignore */
    }
  }, []);

  function switchMode(next: ParserMode) {
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  const hasCoords =
    fromLat != null && fromLng != null && toLat != null && toLng != null;
  const canShowMap = !!kakaoMapsKey && hasCoords;

  // ─ Kakao Map render ─
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!canShowMap || !kakaoMapsKey) return;
    let cancelled = false;
    setSdkError(null);
    setSdkLoading(true);
    loadKakaoSdk(kakaoMapsKey)
      .then(() => {
        if (cancelled || !mapContainerRef.current || !window.kakao?.maps) return;
        const { kakao } = window;
        const center = new kakao.maps.LatLng(
          (fromLat! + toLat!) / 2,
          (fromLng! + toLng!) / 2,
        );
        const map = new kakao.maps.Map(mapContainerRef.current, { center, level: 6 });
        const from = new kakao.maps.LatLng(fromLat!, fromLng!);
        const to = new kakao.maps.LatLng(toLat!, toLng!);
        new kakao.maps.Marker({ position: from, map });
        new kakao.maps.Marker({ position: to, map });
        const bounds = new kakao.maps.LatLngBounds();
        bounds.extend(from);
        bounds.extend(to);
        map.setBounds(bounds);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setSdkError(e.message);
      })
      .finally(() => {
        if (!cancelled) setSdkLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canShowMap, kakaoMapsKey, fromLat, fromLng, toLat, toLng]);

  // Deep link — Kakao only accepts {name},{lat},{lng} (or place ID).
  // When coords exist we can use the directions URL: Kakao positions the
  // route by coords and treats name as a display label, so Chinese names
  // like "釜山金海機場" still work.
  // When coords are missing we previously fell back to /link/search/{names}
  // but Kakao's search index is Korean-only — searching "釜山金海機場 松亭3代豬肉湯飯"
  // returns zero results. Better to disable the link entirely so the user
  // knows they need to bind the place first (via "重新綁定 Google 地點").
  const deepLinkUrl = hasCoords
    ? `https://map.kakao.com/link/by/traffic/${encodeURIComponent(fromName || "출발")},${fromLat},${fromLng}/${encodeURIComponent(toName || "도착")},${toLat},${toLng}`
    : null;

  function runParse() {
    if (!pasted.trim()) return;
    setError(null);
    setParsed(null);
    setRuleParsed(null);
    setParsedSteps(null);
    startParse(async () => {
      if (mode === "rule") {
        const r = await parseTransitPasteRuleBasedAction(pasted);
        setParsed(r);
      } else {
        const [llmR, ruleR] = await Promise.all([
          parseTransitPasteLlmAction(pasted),
          parseTransitPasteRuleBasedAction(pasted),
        ]);
        if (llmR.ok) {
          setParsed(llmR.parsed);
          setRuleParsed(ruleR);
          setParsedSteps(llmR.steps);
        } else {
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
      setParsedSteps(llmR.steps);
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
      <p className="text-caption-uppercase text-muted-soft">Kakao Maps 整合（韓國）</p>

      {/* Map */}
      {canShowMap ? (
        <div className="relative">
          <div
            ref={mapContainerRef}
            className="h-72 w-full rounded-md border border-hairline bg-canvas"
          />
          {sdkLoading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-canvas/40 backdrop-blur-sm">
              <Loader2 size={16} className="animate-spin text-muted" />
            </div>
          )}
          {sdkError && (
            <div className="absolute inset-x-2 top-2 flex items-start gap-1.5 rounded-md border border-error/40 bg-canvas p-2 text-[10px] text-error shadow-soft-elevation">
              <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
              <span>
                {sdkError}（請確認 developers.kakao.com 已註冊本網域）
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-md border border-dashed border-hairline-soft bg-canvas p-3 text-[11px] text-muted">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span>
            {!kakaoMapsKey
              ? "未設定 Kakao Maps JavaScript Key — 至 /settings 設定後可顯示地圖。"
              : "起點或終點缺少經緯度資料，無法顯示地圖。"}
          </span>
        </div>
      )}

      {/* Deep link — disabled when coords are missing (Kakao search index
          is Korean-only, so a Chinese-name fallback URL would return no
          results and confuse the user). */}
      {deepLinkUrl ? (
        <a
          href={deepLinkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-[11px] text-brand-accent hover:border-brand-accent"
        >
          <ExternalLink size={11} strokeWidth={1.8} />
          在 Kakao Map 開啟
        </a>
      ) : (
        <span
          className="inline-flex h-8 cursor-not-allowed items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-[11px] text-muted-soft"
          title="缺少經緯度資料 — 先把地點重新綁定到 Google Place 取得座標後即可開啟"
        >
          <ExternalLink size={11} strokeWidth={1.8} />
          在 Kakao Map 開啟（需要座標）
        </span>
      )}

      {/* Paste area */}
      <div className="space-y-2 rounded-md border border-hairline bg-canvas p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-caption text-muted">從 Kakao Map 複製路線資訊</span>
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
              AI 優先（中韓對照）
            </button>
          </div>
        </div>

        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={4}
          placeholder="把 Kakao Map 길찾기 結果整段選起來貼進這裡（含 시간 / 요금 / 노선名）…"
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
          <>
            <ParsedFieldsPreview
              parsed={parsed}
              ruleShadow={ruleParsed}
              onApply={() => onApply(parsed, parsedSteps)}
            />
            {parsedSteps && parsedSteps.steps.length > 0 && (
              <p className="text-[10px] text-success">
                ✓ 解析出 {parsedSteps.steps.length} 個步驟（套用後可在清單展開檢視）
              </p>
            )}
          </>
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
      {row("出發", parsed.departureTime ?? "", ruleShadow?.departureTime ?? null)}
      {row("抵達", parsed.arrivalTime ?? "", ruleShadow?.arrivalTime ?? null)}
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
