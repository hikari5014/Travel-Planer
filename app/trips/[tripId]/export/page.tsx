"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { SpikeMark } from "@/components/brand/SpikeMark";
import { ExportControls } from "@/components/export/ExportControls";
import { PdfPreview } from "@/components/export/PdfPreview";
import { defaultExportConfig, type ExportConfig } from "@/lib/export-config";
import { mockTrips } from "@/lib/mock-trips";

export default function ExportPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = use(params);
  const trip = mockTrips.find((t) => t.id === tripId) ?? mockTrips[0];
  const [config, setConfig] = useState<ExportConfig>(defaultExportConfig);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <header className="flex h-14 items-center gap-4 border-b border-hairline-soft bg-canvas px-4">
        <Link href="/" className="flex items-center gap-2 text-muted hover:text-ink">
          <SpikeMark size={14} />
          <span className="text-caption">旅遊規劃</span>
        </Link>
        <span className="text-muted-soft">/</span>
        <Link href={`/trips/${trip.id}`} className="text-caption text-muted hover:text-ink">
          {trip.title}
        </Link>
        <span className="text-muted-soft">/</span>
        <span className="flex items-center gap-1 text-title-sm text-ink">
          <FileText size={14} strokeWidth={1.8} />
          匯出 PDF
        </span>
        <Link
          href={`/trips/${trip.id}`}
          className="ml-auto inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-caption text-ink hover:border-ink"
        >
          <ArrowLeft size={12} strokeWidth={2} />
          返回編輯
        </Link>
      </header>

      {/* Body: 2-pane controls + preview */}
      <div className="flex flex-1 overflow-hidden">
        <ExportControls config={config} onChange={setConfig} totalCost={78400} />
        <div className="flex-1 overflow-hidden">
          <PdfPreview config={config} />
        </div>
      </div>
    </div>
  );
}
