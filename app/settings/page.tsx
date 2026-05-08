import Link from "next/link";
import { ArrowLeft, Download, Upload, RefreshCw, Trash2, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { SpikeMark } from "@/components/brand/SpikeMark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ThemePicker } from "@/components/settings/ThemePicker";
import { getSettingsView } from "@/lib/services/settings-service";
import { getMonthlyUsage } from "@/lib/services/usage-service";
import { isCurrentUserAdmin } from "@/lib/auth/current-user";
import { isAdminPasswordSet } from "@/lib/auth/admin";
import { logoutAction } from "@/app/(actions)/auth-actions";
import {
  removeLLMProviderAction,
  setFxRatesAction,
  backfillExpenseFxRatesAction,
  setGoogleMapIdAction,
  setAviationStackKeyAction,
  setAeroDataBoxKeyAction,
  setGoogleMapsKeyAction,
  setMapboxKeyAction,
  setRecommendWeightsAction,
  setTaxiRegionRatesAction,
  setMapProviderAction,
  updateSettingsAction,
} from "@/app/(actions)/settings-actions";
import { BackupActions } from "@/components/settings/BackupActions";
import { RecoverOrphanData } from "@/components/settings/RecoverOrphanData";
import { MapProviderPicker } from "@/components/settings/MapProviderPicker";
import { ProviderHealthCheck } from "@/components/settings/ProviderHealthCheck";
import { AddProviderForm } from "@/components/settings/AddProviderForm";

export default async function SettingsPage() {
  const s = await getSettingsView();
  const usage = await getMonthlyUsage();
  const adminMode = await isCurrentUserAdmin();
  const adminConfigured = isAdminPasswordSet();

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 border-b border-hairline-soft bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-content items-center gap-4 px-lg">
          <Link href="/" className="flex items-center gap-2 text-muted hover:text-ink">
            <SpikeMark size={14} />
            <span className="text-caption">旅遊規劃Z</span>
          </Link>
          <span className="text-muted-soft">/</span>
          <span className="text-title-sm text-ink">設定</span>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/"
              className="inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-caption text-ink hover:border-ink"
            >
              <ArrowLeft size={12} strokeWidth={2} />
              返回工作區
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-content space-y-8 px-lg py-xl">
        <Section
          title="帳號身份"
          description="管理者帳號讓 API keys 與行程資料綁在固定的 user id，跨瀏覽器、跨 Vercel preview URL 都能看到自己的資料。其他人仍透過邀請連結加入。"
        >
          {adminMode ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-success/40 bg-success/5 p-3">
              <ShieldCheck size={16} className="text-success" strokeWidth={1.8} />
              <div className="flex-1">
                <p className="text-body-sm font-medium text-ink">目前為管理者身份</p>
                <p className="text-[11px] text-muted-soft">
                  user id：<code className="rounded bg-surface-card px-1 font-mono">admin</code>。Cookie 維持 30 天。
                </p>
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-[11px] text-muted hover:border-ink hover:text-ink"
                >
                  <LogOut size={11} strokeWidth={1.8} />
                  登出 admin
                </button>
              </form>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-hairline bg-surface-soft p-3">
              <KeyRound size={16} className="text-muted" strokeWidth={1.8} />
              <div className="flex-1">
                <p className="text-body-sm text-ink">目前為訪客身份</p>
                <p className="text-[11px] text-muted-soft">
                  {adminConfigured
                    ? "ADMIN_PASSWORD 已設定。登入後 API keys / 行程會綁在固定 admin id。"
                    : "尚未在 Vercel 設定 ADMIN_PASSWORD env var。設好後才能登入。"}
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-button text-on-primary hover:bg-primary-active"
              >
                <KeyRound size={11} strokeWidth={1.8} />
                登入管理者
              </Link>
            </div>
          )}
        </Section>

        <Section
          title="外觀"
          description="切換主題；點 Header 的太陽 / 月亮 / 螢幕圖示也能即時切換。"
        >
          <ThemePicker />
        </Section>

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
              編輯 / 重設匯率（自動來源：open.er-api.com）
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

          {/* Phase 14m fix — backfill snapshot for legacy expense rows */}
          <form action={backfillExpenseFxRatesAction} className="mt-3 rounded-md border border-dashed border-hairline-soft bg-surface-soft p-3">
            <p className="mb-2 text-caption text-muted">
              <strong className="text-ink">補齊舊費用換算</strong>
              ：把所有 fxRateToBase 為空的費用紀錄，依當前匯率回填。
              修舊費用顯示「¥3,000 換算 NT$ 3,000」這類錯誤後，建議跑一次。
            </p>
            <SaveButton secondary>套用當前匯率到所有舊費用</SaveButton>
          </form>
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

        <Section
          title="飛機緩衝預設值（分鐘）"
          description="新增 FLIGHT 行程時自動填入的 CHECK-IN（出發前提早抵達）與 IMMIGRATION（落地後通關提領）緩衝。已建立的航班可在卡片內個別覆蓋。"
        >
          <form action={updateSettingsAction} className="grid grid-cols-2 gap-3">
            <Field label="CHECK-IN · 國際線">
              <input name="defaultFlightCheckInBufferMinIntl" type="number" step="5" min="0" max="600"
                     defaultValue={s.defaultFlightCheckInBufferMinIntl}
                     className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none" />
            </Field>
            <Field label="CHECK-IN · 國內線">
              <input name="defaultFlightCheckInBufferMinDomestic" type="number" step="5" min="0" max="600"
                     defaultValue={s.defaultFlightCheckInBufferMinDomestic}
                     className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none" />
            </Field>
            <Field label="IMMIGRATION · 國際線">
              <input name="defaultFlightImmigrationBufferMinIntl" type="number" step="5" min="0" max="600"
                     defaultValue={s.defaultFlightImmigrationBufferMinIntl}
                     className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none" />
            </Field>
            <Field label="IMMIGRATION · 國內線">
              <input name="defaultFlightImmigrationBufferMinDomestic" type="number" step="5" min="0" max="600"
                     defaultValue={s.defaultFlightImmigrationBufferMinDomestic}
                     className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none" />
            </Field>
            <div className="col-span-2">
              <SaveButton>儲存飛機緩衝設定</SaveButton>
            </div>
          </form>
        </Section>

        <Section
          title="地圖供應商"
          description="編輯器右側地圖渲染來源。下面三選一，沒設定 key 的選項自動 fallback 至 OSM。"
        >
          <MapProviderPicker
            current={s.mapProvider}
            hasGoogleKey={s.hasGoogleMapsKey}
            hasMapboxKey={s.hasMapboxKey}
            setMapProviderAction={setMapProviderAction}
          />

          <details className="mt-4 rounded-md border border-hairline bg-surface-soft p-4">
            <summary className="cursor-pointer text-caption font-medium text-ink">
              📋 三家地圖比對表（價格 / 覆蓋 / 適用情境）
            </summary>
            <div className="mt-3 overflow-hidden rounded-md border border-hairline bg-canvas">
              <table className="w-full text-caption">
                <thead className="bg-surface-soft text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">指標</th>
                    <th className="px-3 py-2 text-left">Google Maps</th>
                    <th className="px-3 py-2 text-left">Mapbox</th>
                    <th className="px-3 py-2 text-left">OSM (MapLibre)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline-soft">
                  <ComparisonRow
                    label="費用"
                    cells={[
                      "$200/月 免費 credit\n≈28k 載圖",
                      "50k 載圖/月免費\n$0.6/1k 之後",
                      "完全免費\n（合理流量）",
                    ]}
                  />
                  <ComparisonRow
                    label="要綁信用卡"
                    cells={["✅ 必須", "❌ 不用", "❌ 不用"]}
                  />
                  <ComparisonRow
                    label="景點搜尋（Places）"
                    cells={["⭐ 全球第一\n日韓台覆蓋極佳", "西方 OK\n亞洲 POI 偏少", "靠 Nominatim\n陽春但夠用"]}
                  />
                  <ComparisonRow
                    label="大眾運輸路線"
                    cells={["⭐ 全球最完整\n含日台 JR/捷運", "❌ 幾乎沒有", "❌ 沒有"]}
                  />
                  <ComparisonRow
                    label="駕車路線"
                    cells={["⭐ 路況/塞車", "OK", "Nominatim/OSRM"]}
                  />
                  <ComparisonRow
                    label="樣式客製"
                    cells={["固定", "⭐ 完全可改", "可改 style.json"]}
                  />
                  <ComparisonRow
                    label="適用情境"
                    cells={[
                      "亞洲行程\n要查大眾運輸",
                      "歐美行程\n要漂亮地圖",
                      "0 成本 / 隱私",
                    ]}
                  />
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-muted-soft">
              建議：行程以 🇯🇵🇰🇷🇹🇼 為主 → Google；歐美 + 視覺優先 → Mapbox；個人/隱私/不想綁卡 → OSM。
            </p>
          </details>
        </Section>

        <Section title="Google Maps API Key" description="啟用 Google 地圖 + Places 搜尋 + Directions 路線。AES-256-GCM 加密儲存。">
          <form action={setGoogleMapsKeyAction} className="space-y-3">
            <Field label="API Key">
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
                : "前往 Google Cloud Console 啟用 Maps JavaScript / Places (New) / Directions 三個 API，產生 referer-restricted Key 貼上。"}
            </p>
            <SaveButton>儲存 Google Key</SaveButton>
          </form>

          <form action={setGoogleMapIdAction} className="mt-4 space-y-3 border-t border-hairline-soft pt-4">
            <Field label="Map ID（選填，啟用自訂 marker 樣式）">
              <input
                name="googleMapId"
                type="text"
                defaultValue={s.googleMapId ?? ""}
                placeholder="例如：8e0a97af9386fef"
                className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 font-mono text-body-sm focus:border-ink focus:outline-none"
              />
            </Field>
            <details className="rounded-md border border-warning/30 bg-warning/5 p-3">
              <summary className="cursor-pointer text-caption font-medium text-ink">
                ⚠️ 看到「糟糕！出了點狀況」錯誤？必看這段
              </summary>
              <div className="mt-2 space-y-2 text-[11px] text-muted leading-relaxed">
                <p>
                  Google 地圖載不出來最常見的兩個原因：
                </p>
                <ol className="ml-4 list-decimal space-y-1">
                  <li>
                    <span className="text-ink">Map ID 沒設或無效</span> — 自訂 marker（每站圓形圖示）必須搭配在 Cloud Console 建立的 Map ID。沒有 Map ID 系統會自動 fallback 到 Google 預設大頭針。
                  </li>
                  <li>
                    <span className="text-ink">Billing 沒啟用</span> — 即使在 $200 免費 credit 內，Cloud 專案還是要先綁信用卡啟用 billing。
                  </li>
                  <li>
                    <span className="text-ink">Key 限制不對</span> — 請在 Credentials 設「Application restrictions = HTTP referrers」，加入 <code className="rounded bg-canvas px-1">http://localhost:3000/*</code>。
                  </li>
                </ol>
                <p className="pt-1">
                  建立 Map ID：<a href="https://console.cloud.google.com/google/maps-apis/studio/maps" target="_blank" rel="noreferrer" className="underline hover:text-ink">Google Cloud Console → Map Management</a> → Create Map ID（type 選 JavaScript，Vector）→ 複製 ID 貼上方欄位。
                </p>
              </div>
            </details>
            <p className="text-[11px] text-muted-soft">
              {s.googleMapId
                ? `已設定：${s.googleMapId}（編輯器會啟用自訂 marker）`
                : "留空 → 編輯器使用 Google 預設大頭針 + label 編號（仍可正常運作）"}
            </p>
            <SaveButton secondary>儲存 Map ID</SaveButton>
          </form>
        </Section>

        <Section title="Mapbox Access Token" description="啟用 Mapbox 地圖樣式 + Search Box。Public token 限制至 localhost / 本網域使用。">
          <form action={setMapboxKeyAction} className="space-y-3">
            <Field label="Public Access Token">
              <input
                name="mapboxKey"
                type="password"
                placeholder={s.hasMapboxKey ? "已儲存（重新輸入即可覆蓋）" : "pk.eyJ1Ijoi..."}
                className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 font-mono text-body-sm focus:border-ink focus:outline-none"
              />
            </Field>
            <p className="text-[11px] text-muted-soft">
              {s.hasMapboxKey
                ? "Token 已加密儲存。需要清空就送出空字串。"
                : "至 mapbox.com 登入後在 Account → Tokens 建立 public token（pk.* 開頭），貼上即可。免費額度 50k/月，不需綁卡。"}
            </p>
            <SaveButton>儲存 Mapbox Token</SaveButton>
          </form>
        </Section>

        <Section
          title="AviationStack（航班查詢）"
          description="輸入航班號 + 日期 → 自動填寫航空公司 / 機場 / 起降時間。不設此 key 時系統會 fallback 到 AI 推估（不準）。"
        >
          <form action={setAviationStackKeyAction} className="space-y-3">
            <Field label="API Access Key">
              <input
                name="aviationStackKey"
                type="password"
                placeholder={s.hasAviationStackKey ? "已儲存（重新輸入即可覆蓋）" : "32 位元 hex key"}
                className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 font-mono text-body-sm focus:border-ink focus:outline-none"
              />
            </Field>
            <p className="text-[11px] text-muted-soft">
              {s.hasAviationStackKey
                ? "Key 已加密儲存。需要清空就送出空字串。"
                : "到 aviationstack.com 註冊（免費），在 dashboard 拿 access_key。免費方案每月 100 次查詢、不需綁卡，個人旅行規劃綽綽有餘。"}
            </p>
            <SaveButton>儲存 AviationStack Key</SaveButton>
          </form>
        </Section>

        <Section
          title="AeroDataBox（航班查詢備援）"
          description="AviationStack 沒有結果或配額用完時自動 fallback。免費方案約 500 次／月，欄位稍微比 AviationStack 多（航廈、登機門兩端都有）。"
        >
          <form action={setAeroDataBoxKeyAction} className="space-y-3">
            <Field label="RapidAPI Key">
              <input
                name="aeroDataBoxKey"
                type="password"
                placeholder={s.hasAeroDataBoxKey ? "已儲存（重新輸入即可覆蓋）" : "RapidAPI key"}
                className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 font-mono text-body-sm focus:border-ink focus:outline-none"
              />
            </Field>
            <p className="text-[11px] text-muted-soft">
              {s.hasAeroDataBoxKey
                ? "Key 已加密儲存。需要清空就送出空字串。"
                : "到 rapidapi.com/aerodatabox/api/aerodatabox 訂閱免費方案，在 RapidAPI dashboard 拿 X-RapidAPI-Key。免費方案 500 次／月、不需綁卡。"}
            </p>
            <SaveButton>儲存 AeroDataBox Key</SaveButton>
          </form>
        </Section>

        <Section
          title="點對點移動段查詢（Phase 11）"
          description="Maps-style 多模式比對。計程車費率可依出發地區自動套用，使用者可在此覆蓋。推薦排序權重（時間/成本/舒適/環保）也可調整。"
        >
          <form action={setTaxiRegionRatesAction} className="space-y-3">
            <Field label="計程車費率（JSON 物件，key=region code）">
              <textarea
                name="taxiRegionRates"
                rows={6}
                defaultValue={s.taxiRegionRatesJson ?? ""}
                placeholder={'{\n  "TW": { "baseFare": 85, "perKm": 25, "perMin": 5, "currency": "TWD" }\n}'}
                className="w-full rounded-md border border-hairline bg-canvas p-2 font-mono text-[11px] focus:border-ink focus:outline-none"
              />
            </Field>
            <p className="text-[11px] text-muted-soft">
              空白 = 用內建費率（TW / JP / KR / HK / TH / SG / MY / VN / PH / AU / US / EU）。
              建議先點開計程車段查看「資料來源」，覺得不準再覆蓋對應 region 的數字。
              格式：<code>{`{ "TW": { baseFare, perKm, perMin, currency } }`}</code>
            </p>
            <SaveButton>儲存計程車費率</SaveButton>
          </form>

          <form action={setRecommendWeightsAction} className="mt-6 space-y-3">
            <Field label="推薦排序權重（4 維 0..1，會 normalize）">
              <textarea
                name="recommendWeights"
                rows={3}
                defaultValue={s.recommendWeightsJson ?? ""}
                placeholder={'{ "time": 0.5, "cost": 0.3, "comfort": 0.2, "co2": 0 }'}
                className="w-full rounded-md border border-hairline bg-canvas p-2 font-mono text-[11px] focus:border-ink focus:outline-none"
              />
            </Field>
            <p className="text-[11px] text-muted-soft">
              空白 = 預設 <code>{`{ time: 0.5, cost: 0.3, comfort: 0.2, co2: 0 }`}</code>。
              四個欄位代表「重視程度」，picker 會以 weighted score 排序。
            </p>
            <SaveButton>儲存推薦權重</SaveButton>
          </form>
        </Section>

        <Section
          title="LLM Providers"
          description="AI 行前建議與滯留時間估算用。可加入多個 provider 隨時切換。"
        >
          {s.llmProviders.length > 0 && s.defaultProviderId && (
            <div className="mb-4">
              <ProviderHealthCheck />
            </div>
          )}
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
            <AddProviderForm />
          </details>
        </Section>

        <Section
          title="資料備份（JSON）"
          description="把整個資料庫內容匯出成 JSON 備份；之後可還原。對共享旅程的成員，匯出僅含你能存取的部份。"
          id="backup"
        >
          <BackupActions />
        </Section>

        <Section
          title="孤立資料復原"
          description="如果切換 Vercel deployment URL 後資料看起來消失了，這是因為 cookie domain 變了，DB 裡的舊資料被掛在另一個 user id 下。按下按鈕把它們認回到目前身份。"
          id="recover"
        >
          <RecoverOrphanData />
        </Section>

        <Section
          title="API 用量"
          description={`本月（${usage.monthRange.start.slice(0, 7)}）每筆 LLM / Google API 呼叫的彙總，用來追蹤花費。`}
          id="usage"
        >
          {s.monthlyBudgetUsd != null && usage.totalCostUsd >= s.monthlyBudgetUsd && (
            <div className="mb-3 rounded-md border border-error/40 bg-error/5 p-3 text-caption text-error">
              ⚠️ 已超過本月軟上限 (${s.monthlyBudgetUsd.toFixed(2)} USD) — 目前 ${usage.totalCostUsd.toFixed(4)} USD。請至下方調整或暫停 AI 操作。
            </div>
          )}
          {s.monthlyBudgetUsd != null && usage.totalCostUsd >= s.monthlyBudgetUsd * 0.8 && usage.totalCostUsd < s.monthlyBudgetUsd && (
            <div className="mb-3 rounded-md border border-warning/40 bg-warning/5 p-3 text-caption text-ink">
              ⚡ 已用 {Math.round((usage.totalCostUsd / s.monthlyBudgetUsd) * 100)}% 月軟上限 (${usage.totalCostUsd.toFixed(4)} / ${s.monthlyBudgetUsd.toFixed(2)} USD)。
            </div>
          )}
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-hairline bg-hairline">
            <div className="bg-canvas p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-soft">總呼叫</p>
              <p className="font-mono text-title-sm text-ink">{usage.totalCalls}</p>
            </div>
            <div className="bg-canvas p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-soft">本月估算 (USD)</p>
              <p className="font-mono text-title-sm text-ink">${usage.totalCostUsd.toFixed(4)}</p>
            </div>
            <div className="bg-canvas p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-soft">月軟上限</p>
              <p className="font-mono text-title-sm text-ink">
                {s.monthlyBudgetUsd ? `$${s.monthlyBudgetUsd.toFixed(2)}` : "—"}
              </p>
            </div>
          </div>

          {usage.byService.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-muted">依 service</p>
              <table className="w-full text-caption">
                <thead className="text-muted-soft">
                  <tr>
                    <th className="px-2 py-1 text-left">Service</th>
                    <th className="px-2 py-1 text-right">Calls</th>
                    <th className="px-2 py-1 text-right">Tokens</th>
                    <th className="px-2 py-1 text-right">USD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline-soft">
                  {usage.byService.map((sv) => (
                    <tr key={sv.service}>
                      <td className="px-2 py-1.5 text-[11px] text-ink">
                        <span className="font-medium">{serviceLabel(sv.service)}</span>
                        <span className="ml-1 font-mono text-[10px] text-muted-soft">{sv.service}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">{sv.calls}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{sv.tokens}</td>
                      <td className="px-2 py-1.5 text-right font-mono">${sv.costUsd.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-caption text-muted-soft">本月尚無 API 呼叫紀錄。</p>
          )}

          <form action={updateSettingsAction} className="mt-4 grid grid-cols-2 gap-3">
            <Field label="月軟上限 (USD)">
              <input
                name="monthlyBudgetUsd"
                type="number"
                step="0.01"
                min="0"
                defaultValue={s.monthlyBudgetUsd ?? ""}
                placeholder="例如 5.00"
                className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none"
              />
            </Field>
            <div className="flex items-end">
              <SaveButton secondary>儲存上限</SaveButton>
            </div>
          </form>
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

function ComparisonRow({ label, cells }: { label: string; cells: string[] }) {
  return (
    <tr>
      <td className="px-3 py-2 align-top font-medium text-ink">{label}</td>
      {cells.map((c, i) => (
        <td key={i} className="px-3 py-2 align-top text-muted whitespace-pre-line">
          {c}
        </td>
      ))}
    </tr>
  );
}

// Human-readable label for each ApiUsageLog.service enum string.
function serviceLabel(s: string): string {
  switch (s) {
    case "GOOGLE_PLACES_AUTOCOMPLETE": return "Google Places 自動完成";
    case "GOOGLE_PLACES_DETAILS":      return "Google Places 詳細資料";
    case "GOOGLE_PLACES_PHOTO":        return "Google Places 照片";
    case "GOOGLE_PLACES_NEARBY":       return "Google Places 附近搜尋";
    case "GOOGLE_DIRECTIONS":          return "Google Routes / 路線";
    case "GOOGLE_STATIC_MAPS":         return "Google Static Maps";
    case "LLM_CHAT":                   return "LLM Chat";
    case "LLM_GENERATE_OBJECT":        return "LLM 結構化輸出";
    case "AVIATIONSTACK_FLIGHT_LOOKUP":return "AviationStack 航班查詢";
    case "AERODATABOX_FLIGHT_LOOKUP":  return "AeroDataBox 航班查詢";
    default:                           return s;
  }
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
