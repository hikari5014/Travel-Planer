"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  importTripFromJsonAction,
  importTripFromNlAction,
  type ImportActionResult,
} from "@/app/(actions)/trip-import-actions";
import { useToast } from "@/components/ui/Toast";

// Phase 13 — external trip import. Two tabs:
//   1. JSON: user pastes JSON from an external LLM (Gemini / ChatGPT / Claude.ai).
//      "複製 Schema" copies the doc string the LLM should follow.
//   2. NL: user describes in plain Chinese; internal LLM produces the same JSON
//      under the hood.

type Tab = "json" | "nl";

export function TripImportDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>("json");
  const [jsonText, setJsonText] = useState("");
  const [nlText, setNlText] = useState("");
  const [importing, startImport] = useTransition();
  const [result, setResult] = useState<ImportActionResult | null>(null);
  const [schemaCopied, setSchemaCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
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
    if (!jsonText.trim()) return;
    setResult(null);
    startImport(async () => {
      const r = await importTripFromJsonAction(jsonText);
      setResult(r);
      handleResult(r);
    });
  }

  function runNlImport() {
    if (!nlText.trim()) return;
    setResult(null);
    startImport(async () => {
      const r = await importTripFromNlAction(nlText);
      setResult(r);
      handleResult(r);
    });
  }

  function handleResult(r: ImportActionResult) {
    if (r.ok) {
      addToast({
        kind: "success",
        message: `匯入完成：${r.result.itemsCreated} 個項目、${r.result.transportsCreated} 段交通`,
        durationMs: 5000,
      });
      // Navigate to the newly imported trip
      router.push(`/trips/${r.result.tripId}`);
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
        ref={dialogRef}
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-hairline bg-canvas shadow-soft-elevation"
        style={{ maxHeight: "calc(100vh - min(16vh, 8rem))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-hairline-soft px-5 py-3">
          <div className="min-w-0">
            <p className="text-caption-uppercase text-muted-soft">External Import</p>
            <h2 className="truncate text-title-md text-ink">從外部貼入行程</h2>
            <p className="mt-0.5 text-caption text-muted">
              讓 Gemini / ChatGPT / Claude.ai 等網路 LLM 幫你規劃，再貼回來自動部署
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

        {/* Tab bar */}
        <div className="flex flex-shrink-0 border-b border-hairline-soft bg-canvas">
          <TabBtn active={tab === "json"} onClick={() => setTab("json")}>
            <FileJson size={12} strokeWidth={1.8} />
            JSON 格式（推薦，免 LLM 配額）
          </TabBtn>
          <TabBtn active={tab === "nl"} onClick={() => setTab("nl")}>
            <MessageCircleMore size={12} strokeWidth={1.8} />
            自然語言（用內建 LLM 解析）
          </TabBtn>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {tab === "json" && (
            <>
              <div className="rounded-md border border-hairline-soft bg-surface-soft p-3">
                <p className="mb-2 text-caption text-muted">
                  <strong className="text-ink">使用方式</strong>：
                  到網路 LLM（Gemini / ChatGPT / Claude.ai 等）→ 把下方 schema 貼給它 → 用自然語言描述行程 → LLM 會回 JSON → 複製 JSON 貼回左下方框 → 按「匯入」。
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
                  placeholder='{ "schemaVersion": 1, "trip": { ... }, "days": [ ... ] }'
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
                  {importing ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Code2 size={12} strokeWidth={1.8} />
                  )}
                  匯入行程
                </button>
              </div>
            </>
          )}

          {tab === "nl" && (
            <>
              <div className="rounded-md border border-hairline-soft bg-surface-soft p-3 text-caption text-muted">
                直接描述你的行程，內建 LLM 會解析出結構化資料並建立行程。會花一次 LLM 配額。
              </div>

              <label className="block">
                <span className="mb-1 block text-caption text-muted">行程描述</span>
                <textarea
                  value={nlText}
                  onChange={(e) => setNlText(e.target.value)}
                  rows={14}
                  placeholder={`例：\n\n4/1-4/5 東京 5 日，從台北出發。\nDay 1 下午抵達後去淺草寺，晚上去築地吃壽司。\nDay 2 早上明治神宮、中午竹下通可麗餅、下午涉谷十字路口。\n...`}
                  className="w-full rounded-md border border-hairline bg-canvas p-3 text-body-sm focus:border-ink focus:outline-none"
                />
              </label>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-soft">
                  使用 /settings 設定的預設 LLM provider
                </span>
                <button
                  type="button"
                  onClick={runNlImport}
                  disabled={importing || !nlText.trim()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-button text-on-primary hover:bg-primary-active disabled:opacity-60"
                >
                  {importing ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Sparkles size={12} strokeWidth={1.8} />
                  )}
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
              <p className="font-medium">匯入成功，但有以下警告：</p>
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
        active
          ? "border-ink text-ink"
          : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

// Container — opens via #import-trip URL fragment so a TripImportTile
// <a href="#import-trip"> on the dashboard triggers it (same pattern as NewTripDialog).
export function TripImportDialogContainer() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function handleHash() {
      if (typeof window === "undefined") return;
      if (window.location.hash === "#import-trip") setOpen(true);
    }
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);
  if (!open) return null;
  return (
    <TripImportDialog
      onClose={() => {
        setOpen(false);
        if (typeof window !== "undefined" && window.location.hash === "#import-trip") {
          history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      }}
    />
  );
}
