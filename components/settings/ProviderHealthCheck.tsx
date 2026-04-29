"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Plug, AlertTriangle } from "lucide-react";
import { pingDefaultProviderAction } from "@/app/(actions)/ai-actions";

// Owner-only "test the default LLM provider" button. Sends a 1-token-ish
// ping prompt that asks for {"ok": true} and verifies the round-trip works.
// Surface for AI Studio key issues, model name typos, base URL misconfig.

export function ProviderHealthCheck({ disabled }: { disabled?: boolean }) {
  const [pending, startTest] = useTransition();
  const [result, setResult] = useState<
    | { ok: true; model: string; providerKind: string; latencyMs: number }
    | { ok: false; error: string }
    | null
  >(null);

  function run() {
    setResult(null);
    startTest(async () => {
      const r = await pingDefaultProviderAction();
      setResult(r);
    });
  }

  return (
    <div className="space-y-2">
      <button
        onClick={run}
        disabled={disabled || pending}
        className="inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-button text-ink hover:border-ink disabled:opacity-50"
      >
        {pending ? (
          <>
            <Loader2 size={12} className="animate-spin" />
            測試中…
          </>
        ) : (
          <>
            <Plug size={12} strokeWidth={1.8} />
            測試預設 Provider 連線
          </>
        )}
      </button>
      {result?.ok && (
        <div className="rounded-md border border-success/30 bg-success/5 p-2 text-caption text-success">
          <p className="flex items-center gap-1">
            <Check size={12} strokeWidth={2.4} />
            連線成功 · {result.providerKind} / {result.model} · {result.latencyMs}ms
          </p>
        </div>
      )}
      {result && !result.ok && (
        <div className="space-y-1 rounded-md border border-error/30 bg-error/5 p-2 text-caption text-error">
          <p className="flex items-start gap-1">
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
            <span className="font-mono text-[11px]">{result.error}</span>
          </p>
          <p className="text-[11px] text-ink">{hintFor(result.error)}</p>
        </div>
      )}
    </div>
  );
}

function hintFor(err: string): string {
  const e = err.toLowerCase();
  if (e.includes("尚未設定預設")) return "💡 請先在下方加入一個 provider，並在「預設 Provider」下拉選擇它。";
  if (e.includes("gemini 400") || e.includes("invalid api key")) {
    return "💡 Google 的 key 無效或被刪除。到 aistudio.google.com/apikey 重新產生。";
  }
  if (e.includes("gemini 403")) {
    return "💡 Google API 被拒。常見：免費額度地區限制 / Cloud 專案沒啟用 Generative Language API。";
  }
  if (e.includes("gemini 429") || e.includes("resource_exhausted")) {
    return "💡 Google 免費額度的 RPM (每分鐘請求) 超過。等 30 秒再試，或升級到付費。";
  }
  if (e.includes("gemini 404")) {
    return "💡 Model 名稱錯誤。試試 gemini-2.5-flash / gemini-2.5-flash-lite / gemini-2.5-pro。";
  }
  if (e.includes("openai 401") || e.includes("invalid_api_key")) {
    return "💡 OpenAI key 無效。到 platform.openai.com/api-keys 確認或重產。";
  }
  if (e.includes("anthropic 401")) {
    return "💡 Anthropic key 無效。到 console.anthropic.com/settings/keys 確認。";
  }
  if (e.includes("拒絕") || e.includes("safety")) {
    return "💡 Provider 的 safety filter 擋下請求。我們已對 Gemini 全開 BLOCK_NONE，這應該很少見。";
  }
  return "💡 看 Console 訊息細節。常見原因：key 過期、model 名稱拼錯、Base URL 寫錯。";
}
