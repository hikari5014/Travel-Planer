"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import {
  addLLMProviderAction,
  type AddProviderResult,
} from "@/app/(actions)/settings-actions";

// Form to add a new LLM provider with VISIBLE error handling.
// Server actions returning a result envelope means we can display Zod /
// crypto / DB errors inline instead of letting Next.js silently swallow them.

export function AddProviderForm() {
  const [state, formAction] = useActionState<AddProviderResult | null, FormData>(
    addLLMProviderAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Clear inputs after a successful save so the user knows it worked AND can
  // immediately add another. Errors keep the inputs (so they don't lose the
  // long pasted API key).
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 border-t border-hairline-soft p-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="顯示名稱（任意命名）">
          <input
            name="label"
            required
            maxLength={40}
            placeholder="例：Gemini 主力 / OpenAI 工作"
            className="h-9 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-muted-soft">
            純粹給你自己分辨用，不會影響連線。
          </p>
        </Field>
        <Field label="種類">
          <select
            name="kind"
            required
            defaultValue="openai"
            className="h-9 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none"
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="google">Google AI Studio (Gemini)</option>
            <option value="custom">自訂 OpenAI 相容</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="預設 Model">
          <input
            name="defaultModel"
            required
            maxLength={80}
            placeholder="gpt-4o-mini / claude-sonnet-4-5 / gemini-2.5-flash"
            className="h-9 w-full rounded-md border border-hairline bg-canvas px-3 font-mono text-body-sm focus:border-ink focus:outline-none"
          />
        </Field>
        <Field label="Base URL（自訂時填）">
          <input
            name="baseUrl"
            placeholder="（OpenAI/Anthropic/Google 留空即可）"
            className="h-9 w-full rounded-md border border-hairline bg-canvas px-3 font-mono text-body-sm focus:border-ink focus:outline-none"
          />
        </Field>
      </div>
      <Field label="API Key">
        <input
          name="rawApiKey"
          type="password"
          required
          placeholder="sk-... / AIza..."
          className="h-9 w-full rounded-md border border-hairline bg-canvas px-3 font-mono text-body-sm focus:border-ink focus:outline-none"
        />
      </Field>

      <details className="rounded-md border border-hairline-soft bg-surface-soft p-3">
        <summary className="cursor-pointer text-[11px] text-muted">
          📖 不同 provider 的設定提示
        </summary>
        <ul className="mt-2 space-y-2 text-[11px] leading-relaxed text-muted">
          <li>
            <span className="font-medium text-ink">OpenAI</span>：Key 為{" "}
            <code className="font-mono">sk-...</code>。 Model 推薦{" "}
            <code className="font-mono">gpt-4o-mini</code>（便宜）或{" "}
            <code className="font-mono">gpt-4o</code>（強）。
          </li>
          <li>
            <span className="font-medium text-ink">Anthropic</span>：Key 為{" "}
            <code className="font-mono">sk-ant-...</code>。 Model 推薦{" "}
            <code className="font-mono">claude-haiku-4-5</code>（便宜）或{" "}
            <code className="font-mono">claude-sonnet-4-5</code>（強）。
          </li>
          <li>
            <span className="font-medium text-ink">Google AI Studio</span>：到{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-ink"
            >
              aistudio.google.com/apikey
            </a>{" "}
            產生 <code className="font-mono">AIza...</code> key（免費額度給個人用很夠）。
            Model 推薦 <code className="font-mono">gemini-2.5-flash</code>（CP 值最高）、
            <code className="font-mono">gemini-2.5-flash-lite</code>（最便宜）、 或{" "}
            <code className="font-mono">gemini-2.5-pro</code>（最強）。
            <br />
            <span className="text-muted-soft">
              ⚠️ Google 的免費額度有 RPM 限制（每分鐘請求數），重新生成會有冷卻時間。
            </span>
          </li>
          <li>
            <span className="font-medium text-ink">自訂 OpenAI 相容</span>：例如 Groq /
            OpenRouter / Ollama，Base URL 填{" "}
            <code className="font-mono">https://api.groq.com/openai</code> 或{" "}
            <code className="font-mono">http://localhost:11434</code>。
          </li>
        </ul>
      </details>

      {state && !state.ok && (
        <div className="flex items-start gap-1.5 rounded-md border border-error/40 bg-error/5 p-2 text-caption text-error">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span className="font-mono text-[11px]">{state.error}</span>
        </div>
      )}
      {state?.ok && (
        <div className="flex items-center gap-1.5 rounded-md border border-success/30 bg-success/5 p-2 text-caption text-success">
          <Check size={12} strokeWidth={2.4} />
          已新增。可在上方列表看到，並按「測試預設 Provider 連線」確認。
        </div>
      )}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  // useFormStatus must live INSIDE the form. Pulls pending state from the
  // server action so the button shows a spinner during submission.
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-button text-on-primary hover:bg-primary-active disabled:opacity-60"
    >
      {pending && <Loader2 size={12} className="animate-spin" />}
      {pending ? "新增中…" : "新增"}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
