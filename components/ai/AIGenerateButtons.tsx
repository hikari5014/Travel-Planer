"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { generatePreTripNotesAction, generatePackingChecklistAction } from "@/app/(actions)/ai-actions";

export function AIGenerateButtons({
  tripId,
  planId,
  provider,
}: {
  tripId: string;
  planId: string;
  provider: string;
}) {
  const [pendingNotes, startNotes] = useTransition();
  const [pendingPacking, startPacking] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function notes() {
    setError(null);
    startNotes(async () => {
      try {
        await generatePreTripNotesAction(tripId, planId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "生成失敗");
      }
    });
  }
  function packing() {
    setError(null);
    startPacking(async () => {
      try {
        await generatePackingChecklistAction(tripId, planId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "生成失敗");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={notes}
          disabled={pendingNotes || pendingPacking}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-button text-on-primary hover:bg-primary-active disabled:opacity-60"
        >
          {pendingNotes ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} fill="currentColor" />}
          產生行前注意事項
        </button>
        <button
          onClick={packing}
          disabled={pendingNotes || pendingPacking}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-hairline bg-canvas px-3 text-button text-ink hover:border-ink disabled:opacity-60"
        >
          {pendingPacking ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          產生行李 checklist
        </button>
        <span className="text-[11px] text-muted-soft">使用 provider: {provider}</span>
      </div>
      {error && (
        <p className="rounded-md border border-error/30 bg-error/5 px-3 py-2 text-caption text-error">{error}</p>
      )}
    </div>
  );
}
