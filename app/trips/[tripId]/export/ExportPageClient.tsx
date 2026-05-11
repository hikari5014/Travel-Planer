"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { SpikeMark } from "@/components/brand/SpikeMark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ExportControls } from "@/components/export/ExportControls";
import { defaultExportConfig, type ExportConfig, type SectionKey } from "@/lib/export-config";

// Phase 14n — replaces @react-pdf/renderer with a paper-sized HTML preview.
// The right pane is now an <iframe src="/h/{tripId}?paper=...&...">
// pointing at the PrintHandbookView. Browser print = PDF export.
export function ExportPageClient({
  tripId,
  tripTitle,
  totalCost,
}: {
  tripId: string;
  tripTitle: string;
  totalCost: number;
}) {
  const [config, setConfig] = useState<ExportConfig>(defaultExportConfig);

  const previewSrc = useMemo(() => {
    const enabledSections = (Object.keys(config.sections) as SectionKey[])
      .filter((k) => config.sections[k])
      .join(",");
    const params = new URLSearchParams({
      paper: config.paper,
      orient: config.orientation,
      font: config.fontScale,
      color: config.color,
      sections: enabledSections,
    });
    return `/h/${tripId}?${params.toString()}`;
  }, [tripId, config]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-14 items-center gap-4 border-b border-hairline-soft bg-canvas px-4">
        <Link href="/" className="flex items-center gap-2 text-muted hover:text-ink">
          <SpikeMark size={14} />
          <span className="text-caption">旅遊規劃Z</span>
        </Link>
        <span className="text-muted-soft">/</span>
        <Link href={`/trips/${tripId}`} className="text-caption text-muted hover:text-ink">
          {tripTitle}
        </Link>
        <span className="text-muted-soft">/</span>
        <span className="flex items-center gap-1 text-title-sm text-ink">
          <FileText size={14} strokeWidth={1.8} />
          匯出手冊
        </span>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link
            href={`/trips/${tripId}`}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-caption text-ink hover:border-ink"
          >
            <ArrowLeft size={12} strokeWidth={2} />
            返回編輯
          </Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <ExportControls config={config} onChange={setConfig} totalCost={totalCost} tripId={tripId} previewSrc={previewSrc} />
        <div className="flex-1 overflow-hidden bg-surface-soft">
          <iframe
            key={previewSrc}
            src={previewSrc}
            title="手冊預覽"
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>
  );
}
