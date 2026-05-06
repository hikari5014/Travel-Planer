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
  previewSrc,
}: {
  config: ExportConfig;
  onChange: (next: ExportConfig) => void;
  totalCost: number;
  tripId?: string;
  previewSrc?: string;
}) {
  // Phase 14n — PDF generation removed. Browser print on the iframe handles
  // both screen view and "Save as PDF" via the native print dialog.

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
          onClick={() => {
            const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="手冊預覽"]');
            if (iframe?.contentWindow) {
              iframe.contentWindow.focus();
              iframe.contentWindow.print();
            } else if (previewSrc) {
              window.open(previewSrc, "_blank");
            }
          }}
          disabled={!tripId}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-button text-on-primary hover:bg-primary-active disabled:opacity-60"
        >
          <Printer size={14} strokeWidth={2} />
          列印 / 儲存為 PDF
        </button>
        {previewSrc && (
          <a
            href={previewSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-hairline bg-canvas py-2 text-button text-ink hover:border-ink"
          >
            <ExternalLink size={14} strokeWidth={1.8} />
            在新分頁開啟手冊
          </a>
        )}
        {tripId && <HandbookShareLink tripId={tripId} previewSrc={previewSrc} />}
        <p className="pt-1 text-center text-[10px] text-muted-soft">
          手冊以紙張比例顯示 · 列印對話框可選「儲存為 PDF」
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
function HandbookShareLink({ tripId, previewSrc }: { tripId: string; previewSrc?: string }) {
  const [copied, setCopied] = useState(false);
  // Phase 14n — share the mobile (no query) URL by default; previewSrc carries
  // the paper-sized config and is what the user is currently looking at.
  const mobileUrl = typeof window !== "undefined" ? `${window.location.origin}/h/${tripId}` : `/h/${tripId}`;
  const printUrl = typeof window !== "undefined" && previewSrc
    ? `${window.location.origin}${previewSrc}`
    : previewSrc ?? mobileUrl;
  const url = mobileUrl;
  return (
    <div className="rounded-md border border-dashed border-hairline-soft bg-surface-soft p-2 text-[11px]">
      <div className="mb-1 flex items-center gap-1.5 text-muted">
        <Smartphone size={12} strokeWidth={1.8} />
        <span>手冊分享連結（公開）</span>
      </div>
      <p className="mb-1 text-[10px] text-muted-soft">手機版（自適應）</p>
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
      {previewSrc && (
        <div className="mt-2 border-t border-hairline-soft pt-2">
          <p className="mb-1 text-[10px] text-muted-soft">紙張版（與目前預覽相同）</p>
          <p className="mb-1.5 truncate font-mono text-[10px] text-ink">{printUrl}</p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(printUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch { /* noop */ }
              }}
              className="flex flex-1 items-center justify-center gap-1 rounded border border-hairline bg-canvas py-1.5 text-[11px] text-ink hover:border-ink"
            >
              <Copy size={11} strokeWidth={1.8} /> 複製紙張版
            </button>
            <a
              href={previewSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1 rounded border border-hairline bg-canvas py-1.5 text-[11px] text-ink hover:border-ink"
            >
              <ExternalLink size={11} strokeWidth={1.8} /> 開新分頁
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
