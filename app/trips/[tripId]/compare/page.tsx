import Link from "next/link";
import { notFound } from "next/navigation";
import { SpikeMark } from "@/components/brand/SpikeMark";
import type { CurrencyCode } from "@/lib/currency";
import { loadCompareTrip } from "@/lib/services/editor-loader";
import { CompareView } from "@/components/compare/CompareView";

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
            <span className="text-caption">旅遊規劃Z</span>
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
        <div className="mb-md">
          <p className="text-caption-uppercase text-muted-soft">COMPARE PLANS</p>
          <h1 className="display-md mt-xxs text-ink">並列{data.plans.length}個方案，做出選擇</h1>
          <p className="mt-xs text-body-md text-muted">
            {data.tripTitle} · {data.startDate.slice(5)}–{data.endDate.slice(5)} · {data.totalDays} 天 · {data.plans.length} 個方案
          </p>
        </div>

        <CompareView
          plans={data.plans}
          days={data.days}
          totalDays={data.totalDays}
          baseCurrency={data.baseCurrency as CurrencyCode}
        />

        <p className="mt-md text-center text-caption text-muted-soft">
          資料即時來自 SQLite · 範圍切換採線性換算（Phase 6 後可接每日花費 buckets）
        </p>
      </main>
    </div>
  );
}
