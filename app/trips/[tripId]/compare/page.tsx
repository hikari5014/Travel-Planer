import Link from "next/link";
import { notFound } from "next/navigation";
import { SpikeMark } from "@/components/brand/SpikeMark";
import { PriceWithLocal } from "@/components/common/PriceWithLocal";
import { formatCurrency } from "@/lib/currency";
import type { CurrencyCode } from "@/lib/currency";
import { loadCompareTrip, type ComparePlanRow } from "@/lib/services/editor-loader";

export default async function ComparePage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const data = await loadCompareTrip(tripId);
  if (!data) notFound();

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 border-b border-hairline-soft bg-canvas/95 backdrop-blur">
        <div className="flex h-14 items-center gap-md px-lg">
          <Link href="/" className="flex items-center gap-xs text-muted hover:text-ink">
            <SpikeMark size={14} />
            <span className="text-caption">旅遊規劃</span>
          </Link>
          <span className="text-muted-soft">/</span>
          <Link href={`/trips/${data.tripId}`} className="text-caption text-muted hover:text-ink">
            {data.tripTitle}
          </Link>
          <span className="text-muted-soft">/</span>
          <span className="text-title-sm text-ink">方案對比</span>

          <div className="ml-auto flex items-center gap-xs">
            <Link
              href={`/trips/${data.tripId}`}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-caption text-ink hover:border-ink"
            >
              ← 返回編輯
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-lg py-lg">
        <div className="mb-md flex items-end justify-between">
          <div>
            <p className="text-caption-uppercase text-muted-soft">COMPARE PLANS</p>
            <h1 className="display-md mt-xxs text-ink">並列{data.plans.length}個方案，做出選擇</h1>
            <p className="mt-xs text-body-md text-muted">
              {data.tripTitle} · {data.startDate.slice(5)}–{data.endDate.slice(5)} · {data.totalDays} 天 · {data.plans.length} 個方案
            </p>
          </div>
        </div>

        <CompareGrid plans={data.plans} baseCurrency={data.baseCurrency as CurrencyCode} />

        <p className="mt-md text-center text-caption text-muted-soft">
          資料即時來自 SQLite · 範圍 (整趟/單天/區間) 控制將於下版加入
        </p>
      </main>
    </div>
  );
}

function CompareGrid({ plans, baseCurrency }: { plans: ComparePlanRow[]; baseCurrency: CurrencyCode }) {
  return (
    <>
      <div className="mt-lg grid gap-md md:grid-cols-3">
        {plans.map((plan, idx) => (
          <PlanColumn key={plan.id} plan={plan} index={idx} baseCurrency={baseCurrency} />
        ))}
      </div>

      <section className="mt-xl">
        <h2 className="mb-md text-title-md text-ink">指標總覽</h2>
        <div className="overflow-hidden rounded-lg border border-hairline">
          <table className="w-full text-body-sm">
            <thead className="bg-surface-soft text-caption text-muted">
              <tr>
                <th className="px-md py-sm text-left">指標</th>
                {plans.map((p) => (
                  <th key={p.id} className="px-md py-sm text-right">{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft bg-canvas">
              <PriceRow label="總花費" amounts={plans.map((p) => p.totalCost)} highlightLowest baseCurrency={baseCurrency} />
              <TextRow label="總距離" values={plans.map((p) => `${p.totalDistanceKm} km`)} />
              <TextRow label="天數" values={plans.map((p) => `${p.totalDays} 天`)} />
              <TextRow label="節奏" values={plans.map((p) => p.pace)} />
              <PriceRow label="食" amounts={plans.map((p) => p.costBreakdown.food)} baseCurrency={baseCurrency} />
              <PriceRow label="住" amounts={plans.map((p) => p.costBreakdown.lodging)} baseCurrency={baseCurrency} />
              <PriceRow label="行" amounts={plans.map((p) => p.costBreakdown.transport)} baseCurrency={baseCurrency} />
              <PriceRow label="票卷" amounts={plans.map((p) => p.costBreakdown.ticket)} baseCurrency={baseCurrency} />
              <PriceRow label="其他" amounts={plans.map((p) => p.costBreakdown.misc)} baseCurrency={baseCurrency} />
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function PlanColumn({ plan, index, baseCurrency }: { plan: ComparePlanRow; index: number; baseCurrency: CurrencyCode }) {
  const accentBars = ["bg-brand-accent", "bg-badge-violet", "bg-badge-orange", "bg-badge-emerald"];
  const accentBarsSoft = ["bg-brand-accent/60", "bg-badge-violet/60", "bg-badge-orange/60", "bg-badge-emerald/60"];
  const accent = accentBars[index] ?? "bg-muted";
  const accentSoft = accentBarsSoft[index] ?? "bg-muted/60";

  return (
    <div
      className={`flex flex-col rounded-lg border bg-canvas ${
        plan.isDefault ? "border-ink shadow-soft-elevation" : "border-hairline"
      }`}
    >
      <div className="flex items-start gap-sm border-b border-hairline-soft p-md">
        <span className={`mt-1 h-3 w-1 rounded-full ${accent}`} />
        <div className="flex-1">
          <div className="flex items-center gap-xs">
            <h3 className="text-title-md text-ink">{plan.name}</h3>
            {plan.isDefault && (
              <span className="rounded-pill bg-surface-card px-2 py-0.5 text-caption text-ink">使用中</span>
            )}
          </div>
          <p className="mt-xxs text-caption text-muted">{plan.description || "—"}</p>
        </div>
      </div>

      <div className="border-b border-hairline-soft p-md">
        <p className="text-caption text-muted">範圍內試算</p>
        <div className="mt-xxs">
          <PriceWithLocal amount={plan.totalCost} size="xl" align="left" />
        </div>
        <div className="mt-sm flex flex-wrap items-center gap-xs text-caption text-muted">
          <span className="rounded-pill bg-surface-card px-2 py-0.5 text-ink">{plan.pace}</span>
          <span>·</span>
          <span>{plan.totalDistanceKm} km</span>
          <span>·</span>
          <span>{plan.totalDays} 天</span>
        </div>
      </div>

      <div className="border-b border-hairline-soft p-md">
        <p className="text-caption-uppercase text-muted-soft">每日強度</p>
        <div className="mt-xs flex h-14 items-end gap-1">
          {plan.dayIntensity.length === 0 && (
            <p className="text-caption text-muted-soft">尚未排定行程</p>
          )}
          {plan.dayIntensity.map((h, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-xs">
              <div
                className={`w-full rounded-sm ${accentSoft}`}
                style={{ height: `${Math.max(2, h * 8)}px` }}
              />
              <span className="font-mono text-[10px] text-muted-soft">D{i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 p-md">
        <p className="text-caption-uppercase text-muted-soft">費用分布</p>
        <div className="mt-xs flex h-2 overflow-hidden rounded-full">
          <CostSeg w={plan.costBreakdown.lodging / Math.max(1, plan.totalCost)} cls="bg-badge-emerald" />
          <CostSeg w={plan.costBreakdown.food / Math.max(1, plan.totalCost)} cls="bg-badge-pink" />
          <CostSeg w={plan.costBreakdown.transport / Math.max(1, plan.totalCost)} cls="bg-badge-orange" />
          <CostSeg w={plan.costBreakdown.ticket / Math.max(1, plan.totalCost)} cls="bg-warning" />
          <CostSeg w={plan.costBreakdown.misc / Math.max(1, plan.totalCost)} cls="bg-muted" />
        </div>
        <ul className="mt-sm space-y-1 text-caption text-muted">
          <BreakItem cls="bg-badge-emerald" label="住宿" amount={plan.costBreakdown.lodging} baseCurrency={baseCurrency} />
          <BreakItem cls="bg-badge-pink" label="餐飲" amount={plan.costBreakdown.food} baseCurrency={baseCurrency} />
          <BreakItem cls="bg-badge-orange" label="交通" amount={plan.costBreakdown.transport} baseCurrency={baseCurrency} />
          <BreakItem cls="bg-warning" label="票卷" amount={plan.costBreakdown.ticket} baseCurrency={baseCurrency} />
          <BreakItem cls="bg-muted" label="其他" amount={plan.costBreakdown.misc} baseCurrency={baseCurrency} />
        </ul>
      </div>
    </div>
  );
}

function CostSeg({ w, cls }: { w: number; cls: string }) {
  return <div style={{ width: `${w * 100}%` }} className={cls} />;
}

function BreakItem({ cls, label, amount, baseCurrency }: { cls: string; label: string; amount: number; baseCurrency: CurrencyCode }) {
  return (
    <li className="flex items-center gap-xs">
      <span className={`h-2 w-2 rounded-full ${cls}`} />
      <span className="flex-1">{label}</span>
      <span className="font-mono text-ink">{formatCurrency(amount, baseCurrency)}</span>
    </li>
  );
}

function TextRow({ label, values }: { label: string; values: string[] }) {
  return (
    <tr>
      <td className="px-md py-sm text-muted">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="px-md py-sm text-right font-mono text-ink">{v}</td>
      ))}
    </tr>
  );
}

function PriceRow({
  label,
  amounts,
  highlightLowest = false,
  baseCurrency,
}: {
  label: string;
  amounts: number[];
  highlightLowest?: boolean;
  baseCurrency: CurrencyCode;
}) {
  const min = highlightLowest ? Math.min(...amounts) : -1;
  return (
    <tr>
      <td className="px-md py-sm text-muted">{label}</td>
      {amounts.map((a, i) => {
        const isHi = highlightLowest && a === min;
        return (
          <td key={i} className="px-md py-sm">
            <div className={`flex flex-col items-end gap-px ${isHi ? "text-success" : "text-ink"}`}>
              <span className="font-mono">{formatCurrency(a, baseCurrency)}</span>
              {isHi && <span className="text-[10px]">↓ 最低</span>}
            </div>
          </td>
        );
      })}
    </tr>
  );
}
