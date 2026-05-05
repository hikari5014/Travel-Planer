"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import type { ExportConfig } from "@/lib/export-config";

// Phase 14 — Live preview rendered straight from /api/export/pdf so the
// preview is byte-identical to what the user downloads. Replaces the prior
// 1020-line HTML mock that simulated a layout from `mockDays`. Single source
// of truth = TripPdfDocument.
//
// Flow:
//   1. Fetch /api/export/pdf with current { tripId, config } (debounced 600ms)
//   2. Get blob → object URL → iframe `src` (browser's native PDF viewer)
//   3. Cleanup old object URLs to avoid memory leaks
//
// Loading + error states handled inline.

export function PdfPreview({
  tripId,
  config,
}: {
  tripId?: string;
  config: ExportConfig;
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastUrlRef = useRef<string | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!tripId) {
      setError("尚未指定 tripId — 預覽無法生成");
      return;
    }
    const myReqId = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/export/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId, config }),
        });
        if (myReqId !== reqIdRef.current) return; // newer request superseded
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`PDF 生成失敗 (${res.status})${txt ? `：${txt.slice(0, 120)}` : ""}`);
        }
        const blob = await res.blob();
        if (myReqId !== reqIdRef.current) return;
        const url = URL.createObjectURL(blob);
        // Revoke the previous URL only after the new one is in place to
        // avoid the iframe flashing blank.
        const prev = lastUrlRef.current;
        lastUrlRef.current = url;
        setPdfUrl(url);
        if (prev) URL.revokeObjectURL(prev);
      } catch (e) {
        if (myReqId !== reqIdRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (myReqId === reqIdRef.current) setLoading(false);
      }
    }, 600); // debounce config changes

    return () => clearTimeout(handle);
  }, [tripId, config]);

  // Revoke any leftover URL on unmount
  useEffect(() => {
    return () => {
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    };
  }, []);

  return (
    <div className="relative h-full w-full bg-surface-soft">
      {pdfUrl ? (
        <iframe
          src={pdfUrl}
          title="PDF 預覽"
          className="h-full w-full border-0"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          {loading ? (
            <div className="flex items-center gap-2 text-caption text-muted">
              <Loader2 size={14} className="animate-spin" />
              生成 PDF 中…
            </div>
          ) : error ? (
            <div className="max-w-md rounded-md border border-error/30 bg-error/5 p-4 text-[12px] text-error">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle size={13} strokeWidth={1.8} />
                預覽錯誤
              </p>
              <p className="mt-1 break-all">{error}</p>
            </div>
          ) : (
            <p className="text-caption text-muted-soft">準備中…</p>
          )}
        </div>
      )}
      {pdfUrl && loading && (
        <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-pill bg-canvas/90 px-2 py-1 text-[10px] font-medium text-muted shadow-soft-elevation">
          <Loader2 size={10} className="animate-spin" />
          重新生成…
        </div>
      )}
    </div>
  );
}
