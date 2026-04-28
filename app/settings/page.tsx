import Link from "next/link";
import { ArrowLeft, Download, Upload, RefreshCw, Trash2 } from "lucide-react";
import { SpikeMark } from "@/components/brand/SpikeMark";
import { getSettingsView } from "@/lib/services/settings-service";
import {
  addLLMProviderAction,
  removeLLMProviderAction,
  setFxRatesAction,
  setGoogleMapsKeyAction,
  updateSettingsAction,
} from "@/app/(actions)/settings-actions";
import { BackupActions } from "@/components/settings/BackupActions";

export default async function SettingsPage() {
  const s = await getSettingsView();

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 border-b border-hairline-soft bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-content items-center gap-4 px-lg">
          <Link href="/" className="flex items-center gap-2 text-muted hover:text-ink">
            <SpikeMark size={14} />
            <span className="text-caption">旅遊規劃</span>
          </Link>
          <span className="text-muted-soft">/</span>
          <span className="text-title-sm text-ink">設定</span>
          <Link
            href="/"
            className="ml-auto inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-caption text-ink hover:border-ink"
          >
            <ArrowLeft size={12} strokeWidth={2} />
            返回工作區
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-content space-y-8 px-lg py-xl">
        <Section
          title="幣別與匯率"
          description="主幣別 + 出行當地幣別。匯率將用於行程內每筆費用的雙幣別顯示。"
        >
          <form action={updateSettingsAction} className="grid grid-cols-2 gap-3">
            <Field label="主要幣別">
              <input name="baseCurrency" defaultValue={s.baseCurrency} maxLength={3}
                     className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm uppercase focus:border-ink focus:outline-none" />
            </Field>
            <Field label="當地幣別">
              <input name="localCurrency" defaultValue={s.localCurrency} maxLength={3}
                     className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm uppercase focus:border-ink focus:outline-none" />
            </Field>
            <div className="col-span-2">
              <SaveButton>儲存幣別</SaveButton>
            </div>
          </form>

          <details className="mt-4 rounded-md border border-hairline bg-surface-soft p-3">
            <summary className="cursor-pointer text-caption text-muted">
              <RefreshCw size={11} className="-mt-0.5 mr-1 inline" />
              編輯 / 重設匯率（Phase 2 接 exchangerate.host 自動更新）
            </summary>
            <form action={setFxRatesAction} className="mt-3 space-y-2">
              <textarea
                name="fxRatesJson"
                rows={5}
                defaultValue={JSON.stringify(s.fxRates, null, 2)}
                className="w-full rounded-md border border-hairline bg-canvas p-2 font-mono text-[11px] focus:border-ink focus:outline-none"
              />
              <SaveButton secondary>儲存匯率</SaveButton>
              {s.fxFetchedAt && (
                <p className="text-[11px] text-muted-soft">
                  最後更新：{new Date(s.fxFetchedAt).toLocaleString("zh-TW")}
                </p>
              )}
            </form>
          </details>
        </Section>

        <Section title="自駕油費試算" description="在地圖上選擇 DRIVING 段時用來估算油費。">
          <form action={updateSettingsAction} className="grid grid-cols-2 gap-3">
            <Field label="油價（每公升 NT$）">
              <input name="defaultFuelPricePerLiter" type="number" step="0.1" min="0"
                     defaultValue={s.defaultFuelPricePerLiter}
                     className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none" />
            </Field>
            <Field label="油耗（km / L）">
              <input name="defaultFuelEfficiencyKmPerL" type="number" step="0.1" min="0.1"
                     defaultValue={s.defaultFuelEfficiencyKmPerL}
                     className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none" />
            </Field>
            <div className="col-span-2">
              <SaveButton>儲存油費設定</SaveButton>
            </div>
          </form>
        </Section>

        <Section title="Google Maps Server Key" description="Phase 1a 接真地圖需要。AES-256-GCM 加密儲存。">
          <form action={setGoogleMapsKeyAction} className="space-y-3">
            <Field label="Server-side API Key">
              <input
                name="googleMapsKey"
                type="password"
                placeholder={s.hasGoogleMapsKey ? "已儲存（重新輸入即可覆蓋）" : "AIza..."}
                className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 font-mono text-body-sm focus:border-ink focus:outline-none"
              />
            </Field>
            <p className="text-[11px] text-muted-soft">
              {s.hasGoogleMapsKey
                ? "Key 已加密儲存於本地 SQLite。需要清空就送出空字串。"
                : "尚未設定 Server Key — Phase 1a 完成前可先空白。"}
            </p>
            <SaveButton>儲存</SaveButton>
          </form>
        </Section>

        <Section
          title="LLM Providers"
          description="AI 行前建議與滯留時間估算用。可加入多個 provider 隨時切換。"
        >
          <ul className="space-y-2">
            {s.llmProviders.length === 0 && (
              <li className="rounded-md border border-dashed border-hairline p-4 text-center text-caption text-muted-soft">
                尚未設定任何 LLM Provider。
              </li>
            )}
            {s.llmProviders.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-md border border-hairline bg-surface-soft p-3">
                <div className="min-w-0">
                  <p className="text-title-sm text-ink">
                    {p.label}
                    {p.id === s.defaultProviderId && (
                      <span className="ml-2 rounded-pill bg-success/15 px-2 py-0.5 text-[10px] text-success">預設</span>
                    )}
                  </p>
                  <p className="text-caption text-muted">
                    {p.kind} · {p.defaultModel} · <span className="font-mono">{p.apiKeyMask}</span>
                  </p>
                </div>
                <form action={async () => { "use server"; await removeLLMProviderAction(p.id); }}>
                  <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-error" aria-label="移除">
                    <Trash2 size={12} />
                  </button>
                </form>
              </li>
            ))}
          </ul>

          <details className="mt-4 rounded-md border border-hairline bg-canvas">
            <summary className="cursor-pointer px-3 py-2 text-caption text-ink">
              + 新增 Provider
            </summary>
            <form action={addLLMProviderAction} className="space-y-3 border-t border-hairline-soft p-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Label">
                  <input name="label" required maxLength={40} placeholder="OpenAI 主帳號"
                         className="h-9 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none" />
                </Field>
                <Field label="種類">
                  <select name="kind" required defaultValue="openai"
                          className="h-9 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none">
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google</option>
                    <option value="custom">自訂 OpenAI 相容</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="預設 Model">
                  <input name="defaultModel" required maxLength={80} placeholder="gpt-4o-mini / claude-sonnet-4-6 / gemini-2.5-pro"
                         className="h-9 w-full rounded-md border border-hairline bg-canvas px-3 font-mono text-body-sm focus:border-ink focus:outline-none" />
                </Field>
                <Field label="Base URL（自訂時填）">
                  <input name="baseUrl" placeholder="https://..."
                         className="h-9 w-full rounded-md border border-hairline bg-canvas px-3 font-mono text-body-sm focus:border-ink focus:outline-none" />
                </Field>
              </div>
              <Field label="API Key">
                <input name="rawApiKey" type="password" required placeholder="sk-..."
                       className="h-9 w-full rounded-md border border-hairline bg-canvas px-3 font-mono text-body-sm focus:border-ink focus:outline-none" />
              </Field>
              <SaveButton>新增</SaveButton>
            </form>
          </details>
        </Section>

        <Section
          title="資料備份（JSON）"
          description="把整個 SQLite 內容匯出成 JSON 備份；之後可以還原回來。Phase 0b 強制保留。"
          id="backup"
        >
          <BackupActions />
        </Section>

        <Section title="API 用量" description="Phase 4 起記錄並顯示。" id="usage">
          <p className="text-caption text-muted-soft">
            Phase 4 完成後會顯示本月 Google Maps 與 LLM 呼叫次數、token 消耗、估算費用。
          </p>
        </Section>
      </main>
    </div>
  );
}

function Section({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="rounded-lg border border-hairline bg-canvas p-lg">
      <div className="mb-md">
        <h2 className="text-title-md text-ink">{title}</h2>
        {description && <p className="mt-1 text-caption text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

function SaveButton({ children, secondary }: { children: React.ReactNode; secondary?: boolean }) {
  return (
    <button
      type="submit"
      className={`inline-flex h-9 items-center rounded-md px-4 text-button transition-colors ${
        secondary
          ? "border border-hairline bg-canvas text-ink hover:border-ink"
          : "bg-primary text-on-primary hover:bg-primary-active"
      }`}
    >
      {children}
    </button>
  );
}
