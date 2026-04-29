import { SpikeMark } from "@/components/brand/SpikeMark";

export function Footer() {
  return (
    <footer className="mt-section bg-surface-dark">
      <div className="mx-auto max-w-content px-lg py-16">
        <div className="flex items-center gap-xs text-on-dark">
          <SpikeMark size={16} />
          <span className="font-display text-title-md tracking-tight">旅遊規劃Z</span>
        </div>
        <p className="mt-md text-body-sm text-on-dark-soft">
          個人用旅遊行程規劃工具 · v0.1 · 本地端執行
        </p>
        <div className="mt-xl grid grid-cols-2 gap-xl text-body-sm text-on-dark-soft md:grid-cols-4">
          <div>
            <h4 className="text-caption-uppercase text-on-dark mb-sm">產品</h4>
            <ul className="space-y-xs">
              <li>旅程規劃</li>
              <li>多方案對比</li>
              <li>PDF 匯出</li>
              <li>AI 行前建議</li>
            </ul>
          </div>
          <div>
            <h4 className="text-caption-uppercase text-on-dark mb-sm">資料</h4>
            <ul className="space-y-xs">
              <li>本地 SQLite</li>
              <li>JSON 匯入/匯出</li>
              <li>API Key 加密</li>
            </ul>
          </div>
          <div>
            <h4 className="text-caption-uppercase text-on-dark mb-sm">整合</h4>
            <ul className="space-y-xs">
              <li>Google Maps</li>
              <li>OpenAI / Anthropic</li>
              <li>多 LLM Provider</li>
            </ul>
          </div>
          <div>
            <h4 className="text-caption-uppercase text-on-dark mb-sm">關於</h4>
            <ul className="space-y-xs">
              <li>個人專案</li>
              <li>未來上線多人版</li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
