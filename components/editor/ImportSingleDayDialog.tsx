"use client";

import { useEffect, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Code2,
  FileJson,
  Loader2,
  MessageCircleMore,
  Sparkles,
  X,
} from "lucide-react";
import { TRIP_IMPORT_SCHEMA_DOC } from "@/lib/services/trip-import-types";
import {
  importSingleDayFromJsonAction,
  importSingleDayFromNlAction,
  type SingleDayImportActionResult,
} from "@/app/(actions)/trip-import-actions";
import { useToast } from "@/components/ui/Toast";

// Phase 14m commit 3 — single-day variant of TripImportDialog. Imports payload
// into ONE Day (not a whole new trip). On conflict (target day non-empty)
// the active plan is auto-cloned and the import lands in the clone.
type Tab = "json" | "nl";

export function ImportSingleDayDialog({
  tripId,
  planId,
  dayId,
  dayDate,
  dayIndex,
  existingItemCount,
  onClose,
  onImported,
}: {
  tripId: string;
  planId: string;
  dayId: string;
  dayDate: string; // YYYY-MM-DD
  dayIndex: number;
  existingItemCount: number;
  onClose: () => void;
  onImported: (newPlanId: string | null) => void;
}) {
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>("json");
  const [jsonText, setJsonText] = useState("");
  const [nlText, setNlText] = useState("");
  const [importing, startImport] = useTransition();
  const [result, setResult] = useState<SingleDayImportActionResult | null>(null);
  const [schemaCopied, setSchemaCopied] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function copySchemaDoc() {
    void navigator.clipboard.writeText(TRIP_IMPORT_SCHEMA_DOC).then(() => {
      setSchemaCopied(true);
      setTimeout(() => setSchemaCopied(false), 2500);
    });
  }

  function runJsonImport() {
    if (importing) return;
    if (!jsonText.trim()) return;
    setResult(null);
    startImport(async () => {
      const r = await importSingleDayFromJsonAction(tripId, planId, dayId, jsonText);
      setResult(r);
      handleResult(r);
    });
  }

  function runNlImport() {
    if (importing) return;
    if (!nlText.trim()) return;
    setResult(null);
    startImport(async () => {
      const r = await importSingleDayFromNlAction(tripId, planId, dayId, nlText);
      setResult(r);
      handleResult(r);
    });
  }

  function handleResult(r: SingleDayImportActionResult) {
    if (r.ok) {
      const msg = r.result.planForked
        ? `原方案保留；行程匯入到新方案（${r.result.itemsCreated} 個項目、${r.result.transportsCreated} 段交通）`
        : `已匯入：${r.result.itemsCreated} 個項目、${r.result.transportsCreated} 段交通`;
      addToast({ kind: "success", message: msg, durationMs: 5000 });
      onImported(r.result.newPlanId);
      onClose();
    } else {
      addToast({
        kind: "error",
        message: `${r.error}${r.details ? "：" + r.details.slice(0, 100) : ""}`,
        durationMs: 6000,
      });
    }
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-[min(8vh,4rem)] backdrop-blur-sm"
    >
      <div
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-hairline bg-canvas shadow-soft-elevation"
        style={{ maxHeight: "calc(100vh - min(16vh, 8rem))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline-soft px-5 py-3">
          <div className="min-w-0">
            <p className="text-caption-uppercase text-muted-soft">Single-Day Import</p>
            <h2 className="truncate text-title-md text-ink">
              貼入 DAY {dayIndex} 的行程（{dayDate}）
            </h2>
            <p className="mt-0.5 text-caption text-muted">
              JSON 中只取第一天；trip 區塊會被忽略（以當前 trip 為準）。
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-card hover:text-ink"
            title="關閉"
          >
            <X size={14} />
          </button>
        </div>

        {existingItemCount > 0 && (
          <div className="flex items-start gap-2 border-b border-hairline-soft bg-warning/5 px-5 py-2 text-[11px] text-warning">
            <AlertTriangle size={12} strokeWidth={1.8} className="mt-0.5 flex-shrink-0" />
            <p>
              此日在當前方案已有 {existingItemCount} 個項目。
              匯入時會<strong>自動建立新方案</strong>來保留原方案內容供比對。
            </p>
          </div>
        )}

        <div className="flex flex-shrink-0 border-b border-hairline-soft bg-canvas">
          <TabBtn active={tab === "json"} onClick={() => setTab("json")}>
            <FileJson size={12} strokeWidth={1.8} />
            JSON 格式
          </TabBtn>
          <TabBtn active={tab === "nl"} onClick={() => setTab("nl")}>
            <MessageCircleMore size={12} strokeWidth={1.8} />
            自然語言
          </TabBtn>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {tab === "json" && (
            <>
              <div className="rounded-md border border-hairline-soft bg-surface-soft p-3">
                <p className="mb-2 text-caption text-muted">
                  使用方式同新建 trip：把 schema 貼給 LLM，產出 JSON 後貼回這裡。
                  <strong className="text-ink"> 系統會自動只取 days[0] 的 items + transports，</strong>
                  其它資訊忽略。
                </p>
                <button
                  type="button"
                  onClick={copySchemaDoc}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-canvas px-3 text-[11px] hover:border-ink"
                >
                  {schemaCopied ? (
                    <>
                      <CheckCircle2 size={11} strokeWidth={1.8} className="text-success" />
                      已複製到剪貼簿
                    </>
                  ) : (
                    <>
                      <Clipboard size={11} strokeWidth={1.8} />
                      複製 Schema 給網路 LLM
                    </>
                  )}
                </button>
              </div>

              <label className="block">
                <span className="mb-1 block text-caption text-muted">貼上 JSON</span>
                <textarea
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  rows={14}
                  spellCheck={false}
                  placeholder={'貼上 LLM 回覆的整段 ```json ... ``` 程式碼區塊（含 fence 或不含都可以）'}
                  className="w-full rounded-md border border-hairline bg-canvas p-3 font-mono text-[11px] focus:border-ink focus:outline-none"
                />
              </label>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-soft">
                  {jsonText.length > 0 && `${jsonText.length.toLocaleString()} 字元`}
                </span>
                <button
                  type="button"
                  onClick={runJsonImport}
                  disabled={importing || !jsonText.trim()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-button text-on-primary hover:bg-primary-active disabled:opacity-60"
                >
                  {importing ? <Loader2 size={12} className="animate-spin" /> : <Code2 size={12} strokeWidth={1.8} />}
                  匯入單日
                </button>
              </div>
            </>
          )}

          {tab === "nl" && (
            <>
              <div className="rounded-md border border-hairline-soft bg-surface-soft p-3 text-caption text-muted">
                直接描述當天行程，內建 LLM 會解析。會花一次 LLM 配額。
              </div>

              <label className="block">
                <span className="mb-1 block text-caption text-muted">行程描述</span>
                <textarea
                  value={nlText}
                  onChange={(e) => setNlText(e.target.value)}
                  rows={14}
                  placeholder={`例：早上去淺草寺看雷門，午餐在淺草今半吃壽喜燒，下午搭銀座線到新宿逛街...`}
                  className="w-full rounded-md border border-hairline bg-canvas p-3 text-body-sm focus:border-ink focus:outline-none"
                />
              </label>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-soft">使用 /settings 設定的預設 LLM</span>
                <button
                  type="button"
                  onClick={runNlImport}
                  disabled={importing || !nlText.trim()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-button text-on-primary hover:bg-primary-active disabled:opacity-60"
                >
                  {importing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} strokeWidth={1.8} />}
                  AI 解析並匯入
                </button>
              </div>
            </>
          )}

          {result && !result.ok && (
            <div className="rounded-md border border-error/40 bg-error/5 p-3 text-[11px] text-error">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle size={12} strokeWidth={1.8} />
                {result.error}
              </p>
              {result.details && (
                <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-all rounded bg-surface-card p-2 font-mono text-[10px] text-ink">
                  {result.details}
                </pre>
              )}
            </div>
          )}

          {result && result.ok && result.result.warnings.length > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-[11px] text-warning">
              <p className="font-medium">匯入完成，但有以下警告：</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted">
                {result.result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-caption ${
        active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
