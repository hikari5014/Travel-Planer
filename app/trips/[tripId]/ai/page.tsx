import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { SpikeMark } from "@/components/brand/SpikeMark";
import { prisma } from "@/lib/db";
import { getLatestSuggestions } from "@/lib/services/ai-service";
import { getSettingsView } from "@/lib/services/settings-service";
import { AIGenerateButtons } from "@/components/ai/AIGenerateButtons";

export default async function AIPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) notFound();

  const planId = trip.defaultPlanId;
  if (!planId) notFound();

  const [{ preTripNotes, packingChecklist, history }, settings] = await Promise.all([
    getLatestSuggestions(planId),
    getSettingsView(),
  ]);

  const provider = settings.llmProviders.find((p) => p.id === settings.defaultProviderId);
  const hasProvider = !!provider;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 border-b border-hairline-soft bg-canvas/95 backdrop-blur">
        <div className="flex h-14 items-center gap-4 px-lg">
          <Link href="/" className="flex items-center gap-2 text-muted hover:text-ink">
            <SpikeMark size={14} />
            <span className="text-caption">旅遊規劃Z</span>
          </Link>
          <span className="text-muted-soft">/</span>
          <Link href={`/trips/${tripId}`} className="text-caption text-muted hover:text-ink">
            {trip.title}
          </Link>
          <span className="text-muted-soft">/</span>
          <span className="flex items-center gap-1 text-title-sm text-ink">
            <Sparkles size={14} fill="currentColor" /> AI 行前建議
          </span>
          <Link
            href={`/trips/${tripId}`}
            className="ml-auto inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-caption text-ink hover:border-ink"
          >
            <ArrowLeft size={12} strokeWidth={2} /> 返回編輯
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-content space-y-8 px-lg py-xl">
        <div>
          <p className="text-caption-uppercase text-muted-soft">PRE-TRIP AI</p>
          <h1 className="display-md mt-xxs text-ink">行前注意事項與行李 checklist</h1>
          <p className="mt-xs text-body-md text-muted">
            AI 依目的地、季節、節奏與行程景點即時生成。重要欄位（插頭、文件、藥品、緊急聯絡）採中英對照。
          </p>
        </div>

        {!hasProvider && (
          <div className="rounded-md border border-warning/40 bg-warning/5 p-4 text-body-sm text-ink">
            <p className="font-medium">尚未設定 LLM Provider</p>
            <p className="mt-1 text-caption text-muted">
              請至 <Link href="/settings#llm" className="text-brand-accent hover:underline">設定</Link> 加入 OpenAI / Anthropic 的 API Key 後再嘗試生成。
            </p>
          </div>
        )}

        {hasProvider && (
          <AIGenerateButtons tripId={tripId} planId={planId} provider={provider!.label} />
        )}

        {/* Pre-trip notes */}
        <section className="rounded-lg border border-hairline bg-canvas p-lg">
          <h2 className="text-title-md text-ink">行前注意事項</h2>
          {!preTripNotes && <p className="mt-2 text-caption text-muted-soft">尚未生成。設定 provider 後按上方按鈕。</p>}
          {preTripNotes && (
            <div className="mt-4 space-y-4">
              <Block title="天氣 / Weather" body={preTripNotes.weatherSummary} />
              <Block title="貨幣 / Currency" body={preTripNotes.currencyTip} />
              <Block title="插座 / Plug" body={`${preTripNotes.plugType.zh}${preTripNotes.plugType.en ? ` · ${preTripNotes.plugType.en}` : ""}`} />
              <Block title="語言 / Language" body={preTripNotes.languageTip} />
              <BulletBlock title="健康 / Health" items={preTripNotes.healthAdvice} />
              <PairBlock title="文件 / Documents" items={preTripNotes.documents} />
              <PairBlock title="藥品 / Medications" items={preTripNotes.medications.map((m) => ({ zh: m.zh, en: m.en, note: m.note }))} />
              <BulletBlock title="當地禮節 / Customs" items={preTripNotes.localCustoms} />
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-widest text-muted">緊急聯絡 / Emergency</p>
                <div className="grid grid-cols-3 gap-3 text-caption">
                  {preTripNotes.emergencyContacts.map((c, i) => (
                    <div key={i} className="rounded-md border border-hairline-soft p-2">
                      <p className="text-muted-soft">{c.label_zh} {c.label_en && <span>· {c.label_en}</span>}</p>
                      <p className="font-mono text-ink">{c.number}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Packing checklist */}
        <section className="rounded-lg border border-hairline bg-canvas p-lg">
          <h2 className="text-title-md text-ink">行李 checklist</h2>
          {!packingChecklist && <p className="mt-2 text-caption text-muted-soft">尚未生成。</p>}
          {packingChecklist && (
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              {packingChecklist.categories.map((cat) => (
                <div key={cat.name_zh}>
                  <p className="mb-2 border-b border-hairline-soft pb-1 text-[11px] font-medium uppercase tracking-wide text-brand-accent">
                    {cat.name_zh}
                  </p>
                  <ul className="space-y-1 text-caption">
                    {cat.items.map((it, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-sm border border-muted-soft" />
                        <span className="flex-1">
                          <span className="text-ink">{it.zh}</span>
                          {it.en && <span className="ml-1 text-muted-soft">· {it.en}</span>}
                          {it.essential && <span className="ml-1 text-warning">★</span>}
                          {it.note && <span className="block text-[10px] text-muted-soft">— {it.note}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {history.length > 0 && (
          <section>
            <h2 className="mb-2 text-title-sm text-ink">生成歷史</h2>
            <ul className="space-y-1 text-caption text-muted-soft">
              {history.slice(0, 10).map((h) => (
                <li key={h.id} className="flex items-center justify-between border-b border-hairline-soft pb-1">
                  <span>
                    {h.kind === "PRE_TRIP_NOTES" ? "行前注意" : "行李 checklist"} ·
                    <span className="ml-1 font-mono">{h.providerId}</span> /
                    <span className="ml-1 font-mono">{h.model}</span>
                  </span>
                  <span className="font-mono">{new Date(h.generatedAt).toLocaleString("zh-TW")}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-l-2 border-brand-accent pl-3">
      <p className="text-[11px] uppercase tracking-widest text-muted">{title}</p>
      <p className="mt-1 text-body-sm leading-relaxed text-body">{body}</p>
    </div>
  );
}
function BulletBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-widest text-muted">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-body-sm text-body">
        {items.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    </div>
  );
}
function PairBlock({ title, items }: { title: string; items: Array<{ zh: string; en?: string; note?: string }> }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-widest text-muted">{title}</p>
      <ul className="mt-1 grid grid-cols-2 gap-1 text-caption text-body">
        {items.map((it, i) => (
          <li key={i} className="border-b border-hairline-soft py-1">
            <span className="text-ink">{it.zh}</span>
            {it.en && <span className="ml-1 text-muted-soft">· {it.en}</span>}
            {it.note && <span className="block text-[10px] text-muted-soft">— {it.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
