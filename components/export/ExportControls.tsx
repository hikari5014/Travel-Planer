"use client";

import { useState, useTransition } from "react";
import {
  Download,
  Printer,
  RotateCw,
  FileText as FileTextIcon,
  Loader2,
  Smartphone,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import {
  defaultExportConfig,
  estimatePageCount,
  sectionLabels,
  type ColorMode,
  type ExportConfig,
  type FontScale,
  type Orientation,
  type PaperSize,
  type SectionKey,
} from "@/lib/export-config";

export function ExportControls({
  config,
  onChange,
  totalCost,
  tripId,
}: {
  config: ExportConfig;
  onChange: (next: ExportConfig) => void;
  totalCost: number;
  tripId?: string;
}) {
  const [isExporting, startExport] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDownload() {
    if (!tripId) return;
    setError(null);
    startExport(async () => {
      try {
        const res = await fetch("/api/export/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId, config }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        const blob = await res.blob();
        const cd = res.headers.get("Content-Disposition") || "";
        const m = cd.match(/filename\*=UTF-8''([^;]+)/);
        const filename = m ? decodeURIComponent(m[1]) : "trip.pdf";
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    });
  }

  const pages = estimatePageCount(config);

  return (
    <div className="flex h-full w-[340px] flex-shrink-0 flex-col border-r border-hairline bg-surface-soft">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-soft">EXPORT</p>
          <h2 className="text-title-sm text-ink">PDF 匯出設定</h2>
        </div>
        <button
          onClick={() => onChange(defaultExportConfig)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink"
          title="重設"
        >
          <RotateCw size={12} strokeWidth={1.8} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Paper size */}
        <Group label="紙張大小">
          <Segmented<PaperSize>
            value={config.paper}
            options={[
              { value: "A4", label: "A4" },
              { value: "A5", label: "A5" },
              { value: "Letter", label: "Letter" },
            ]}
            onChange={(v) => onChange({ ...config, paper: v })}
          />
        </Group>

        <Group label="方向">
          <Segmented<Orientation>
            value={config.orientation}
            options={[
              { value: "portrait", label: "直式" },
              { value: "landscape", label: "橫式" },
            ]}
            onChange={(v) => onChange({ ...config, orientation: v })}
          />
        </Group>

        <Group label="字級">
          <Segmented<FontScale>
            value={config.fontScale}
            options={[
              { value: "small", label: "小" },
              { value: "normal", label: "標準" },
              { value: "large", label: "大" },
            ]}
            onChange={(v) => onChange({ ...config, fontScale: v })}
          />
        </Group>

        <Group label="配色">
          <Segmented<ColorMode>
            value={config.color}
            options={[
              { value: "color", label: "彩色" },
              { value: "mono", label: "單色（省墨）" },
            ]}
            onChange={(v) => onChange({ ...config, color: v })}
          />
        </Group>

        <Group label="包含章節">
          <ul className="space-y-1.5">
            {(Object.keys(sectionLabels) as SectionKey[]).map((key) => {
              const meta = sectionLabels[key];
              const checked = config.sections[key];
              return (
                <li key={key}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-md border border-hairline-soft bg-canvas p-2 hover:border-hairline">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        onChange({
                          ...config,
                          sections: { ...config.sections, [key]: e.target.checked },
                        })
                      }
                      className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-ink"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-caption text-ink leading-tight">{meta.label}</p>
                      <p className="text-[11px] text-muted">{meta.description}</p>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        </Group>

        {/* Summary card */}
        <div className="rounded-md border border-hairline bg-canvas p-3">
          <div className="flex items-center gap-2 text-caption text-muted">
            <FileTextIcon size={14} strokeWidth={1.8} />
            <span>預估輸出</span>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-2 text-caption">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-soft">頁數</p>
              <p className="font-mono text-title-sm text-ink">{pages} 頁</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-soft">紙張</p>
              <p className="text-body-sm text-ink">
                {config.paper} · {config.orientation === "portrait" ? "直式" : "橫式"}
              </p>
            </div>
          </div>
          <div className="mt-2 border-t border-hairline-soft pt-2 text-caption text-muted">
            內容覆蓋 NT$ {(totalCost / 1000).toFixed(1)}k 試算 · 含 14 個景點 · 6 張票卷
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="space-y-2 border-t border-hairline bg-canvas p-3">
        <button
          onClick={handleDownload}
          disabled={!tripId || isExporting}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-button text-on-primary hover:bg-primary-active disabled:opacity-60"
        >
          {isExporting ? (
            <>
              <Loader2 size={14} strokeWidth={2} className="animate-spin" />
              產生中…
            </>
          ) : (
            <>
              <Download size={14} strokeWidth={2} />
              下載 PDF
            </>
          )}
        </button>
        <button
          onClick={() => window.print()}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-hairline bg-canvas py-2 text-button text-ink hover:border-ink"
        >
          <Printer size={14} strokeWidth={1.8} />
          列印預覽
        </button>
        {tripId && <HandbookShareLink tripId={tripId} />}
        {error && (
          <p className="pt-1 text-center text-[10px] text-error">匯出失敗：{error}</p>
        )}
        <p className="pt-1 text-center text-[10px] text-muted-soft">
          已接 @react-pdf/renderer · 內建 Noto Sans TC（手機網頁版亦同步顯示）
        </p>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-px rounded-md border border-hairline bg-canvas p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 rounded-sm px-2 py-1 text-caption transition-colors ${
            opt.value === value
              ? "bg-surface-card text-ink"
              : "text-muted hover:text-ink"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Phase 14k — public mobile handbook share link. Click "複製連結" to copy
// `<origin>/h/<tripId>` to clipboard; "在新分頁開啟" hops to it directly.
function HandbookShareLink({ tripId }: { tripId: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/h/${tripId}` : `/h/${tripId}`;
  return (
    <div className="rounded-md border border-dashed border-hairline-soft bg-surface-soft p-2 text-[11px]">
      <div className="mb-1 flex items-center gap-1.5 text-muted">
        <Smartphone size={12} strokeWidth={1.8} />
        <span>手機網頁版手冊（公開分享連結）</span>
      </div>
      <p className="mb-2 truncate font-mono text-[10px] text-ink">{url}</p>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              /* clipboard API may be unavailable; fall through silently */
            }
          }}
          className="flex flex-1 items-center justify-center gap-1 rounded border border-hairline bg-canvas py-1.5 text-[11px] text-ink hover:border-ink"
        >
          {copied ? (
            <>
              <Check size={11} strokeWidth={2} /> 已複製
            </>
          ) : (
            <>
              <Copy size={11} strokeWidth={1.8} /> 複製連結
            </>
          )}
        </button>
        <a
          href={`/h/${tripId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-1 rounded border border-hairline bg-canvas py-1.5 text-[11px] text-ink hover:border-ink"
        >
          <ExternalLink size={11} strokeWidth={1.8} /> 開新分頁
        </a>
      </div>
    </div>
  );
}
