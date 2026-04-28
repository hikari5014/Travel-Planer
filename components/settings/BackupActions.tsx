"use client";

import { useRef, useState } from "react";
import { Download, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";

export function BackupActions() {
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    window.location.href = "/api/backup";
  }

  async function handleImport(file: File) {
    if (!confirm("匯入會清空目前所有資料並用 JSON 取代。確定繼續？")) return;
    setImporting(true);
    setMessage(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(json),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      setMessage({
        kind: "ok",
        text: `匯入完成 · ${Object.entries(data.counts ?? {})
          .map(([k, v]) => `${k}=${v}`)
          .join(" · ")}`,
      });
      // Reload after a moment so dashboard shows imported data.
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : "匯入失敗" });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleExport}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-hairline bg-canvas px-3 text-button text-ink hover:border-ink"
        >
          <Download size={14} strokeWidth={1.8} />
          匯出全部資料 (JSON)
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-hairline bg-canvas px-3 text-button text-ink hover:border-ink disabled:opacity-60"
        >
          <Upload size={14} strokeWidth={1.8} />
          {importing ? "匯入中…" : "從 JSON 匯入"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImport(f);
            e.target.value = "";
          }}
        />
      </div>

      {message && (
        <div
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-caption ${
            message.kind === "ok"
              ? "border-success/30 bg-success/5 text-success"
              : "border-error/30 bg-error/5 text-error"
          }`}
        >
          {message.kind === "ok" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          <span>{message.text}</span>
        </div>
      )}

      <p className="text-[11px] text-muted-soft">
        匯出格式包含 schema version 標記。將來欄位變動時可寫遷移腳本維持向後相容。
        加密欄位（API keys）以密文 round-trip — 同一 <code className="font-mono">APP_ENC_KEY</code> 才能解開。
      </p>
    </div>
  );
}
