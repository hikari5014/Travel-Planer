"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { SpikeMark } from "@/components/brand/SpikeMark";
import { ExportControls } from "@/components/export/ExportControls";
import { PdfPreview } from "@/components/export/PdfPreview";
import { defaultExportConfig, type ExportConfig } from "@/lib/export-config";

// Client wrapper — owns the live ExportConfig state for the controls and
// preview. PDF generation hits /api/export/pdf with this same config.
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
          匯出 PDF
        </span>
        <Link
          href={`/trips/${tripId}`}
          className="ml-auto inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-caption text-ink hover:border-ink"
        >
          <ArrowLeft size={12} strokeWidth={2} />
          返回編輯
        </Link>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <ExportControls config={config} onChange={setConfig} totalCost={totalCost} tripId={tripId} />
        <div className="flex-1 overflow-hidden">
          <PdfPreview config={config} />
        </div>
      </div>
    </div>
  );
}
