import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Receipt, Ticket as TicketIcon } from "lucide-react";
import { SpikeMark } from "@/components/brand/SpikeMark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { getExpensesView, type ExpenseCategory } from "@/lib/services/expense-service";
import { PriceWithLocal } from "@/components/common/PriceWithLocal";
import { formatCurrency, convertToBase } from "@/lib/currency";
import type { CurrencyCode } from "@/lib/currency";

const CATEGORY_LABEL: Record<ExpenseCategory, { label: string; cls: string }> = {
  FOOD: { label: "食 Food", cls: "bg-badge-pink/15 text-ink" },
  LODGING: { label: "住 Lodging", cls: "bg-badge-emerald/15 text-ink" },
  TRANSPORT: { label: "行 Transport", cls: "bg-badge-orange/15 text-ink" },
  TICKET: { label: "票卷 Tickets", cls: "bg-warning/15 text-ink" },
  SHOPPING: { label: "購物 Shopping", cls: "bg-badge-violet/15 text-ink" },
  MISC: { label: "其他 Misc", cls: "bg-surface-card text-muted" },
  FLIGHT: { label: "機票 Flight", cls: "bg-brand-accent/15 text-ink" },
};

export default async function ExpensesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ planId?: string }>;
}) {
  const { tripId } = await params;
  const { planId } = await searchParams;
  const view = await getExpensesView(tripId, planId);
  if (!view) notFound();

  const total = view.grandTotal;
  const cat = view.totalsByCategory;

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
            {view.trip.title}
          </Link>
          <span className="text-muted-soft">/</span>
          <span className="flex items-center gap-1 text-title-sm text-ink">
            <Receipt size={14} strokeWidth={1.8} />
            費用總覽
          </span>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link
              href={`/trips/${tripId}`}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-caption text-ink hover:border-ink"
            >
              <ArrowLeft size={12} strokeWidth={2} /> 返回編輯
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-content space-y-8 px-lg py-xl">
        {/* Plan switcher */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-caption-uppercase text-muted-soft">EXPENSES</p>
            <h1 className="display-md mt-xxs text-ink">本方案花費明細</h1>
          </div>
          <div className="flex items-center gap-px rounded-pill bg-surface-soft p-0.5">
            {view.plans.map((p) => {
              const isCurrent = (planId ?? view.plans.find((x) => x.isDefault)?.id) === p.id;
              return (
                <Link
                  key={p.id}
                  href={`/trips/${tripId}/expenses?planId=${p.id}`}
                  className={`rounded-pill px-3 py-1 text-caption transition-colors ${
                    isCurrent
                      ? "bg-canvas text-ink shadow-soft-elevation"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {p.name}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Grand total */}
        <section className="rounded-lg border border-hairline bg-canvas p-lg">
          <p className="text-caption-uppercase text-muted-soft">本方案總計（換算 {view.trip.baseCurrency}）</p>
          <div className="mt-2">
            <PriceWithLocal value={view.grandTotalMoney} size="xl" />
          </div>
          <div className="mt-md grid grid-cols-2 gap-px overflow-hidden rounded-md border border-hairline-soft bg-hairline-soft md:grid-cols-6">
            {(Object.keys(cat) as ExpenseCategory[]).map((c) => (
              <div key={c} className="bg-canvas p-3">
                <p className={`inline-block rounded-pill px-2 py-px text-[10px] ${CATEGORY_LABEL[c].cls}`}>
                  {CATEGORY_LABEL[c].label}
                </p>
                <p className="mt-1 font-mono text-title-sm text-ink">
                  {formatCurrency(cat[c], view.trip.baseCurrency)}
                </p>
                <p className="font-mono text-[10px] text-muted-soft">
                  {total > 0 ? `${((cat[c] / total) * 100).toFixed(1)}%` : "—"}
                </p>
              </div>
            ))}
          </div>

          {/* Stacked bar */}
          {total > 0 && (
            <div className="mt-3 flex h-2 overflow-hidden rounded-full">
              <span style={{ width: `${(cat.LODGING / total) * 100}%` }} className="bg-badge-emerald" />
              <span style={{ width: `${(cat.FOOD / total) * 100}%` }} className="bg-badge-pink" />
              <span style={{ width: `${(cat.TRANSPORT / total) * 100}%` }} className="bg-badge-orange" />
              <span style={{ width: `${(cat.TICKET / total) * 100}%` }} className="bg-warning" />
              <span style={{ width: `${(cat.SHOPPING / total) * 100}%` }} className="bg-badge-violet" />
              <span style={{ width: `${(cat.MISC / total) * 100}%` }} className="bg-muted" />
            </div>
          )}
        </section>

        {/* Per-day */}
        {view.totalsByDay.length > 0 && (
          <section className="rounded-lg border border-hairline bg-canvas p-lg">
            <h2 className="mb-md text-title-md text-ink">每日花費</h2>
            <div className="space-y-2">
              {view.totalsByDay.map((d) => (
                <div key={d.dayIndex} className="flex items-center gap-3">
                  <span className="w-16 text-caption text-muted-soft">Day {d.dayIndex}</span>
                  <span className="w-20 font-mono text-caption text-muted">{d.date.slice(5)}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-soft">
                    <span
                      style={{ width: `${(d.amount / Math.max(1, total)) * 100}%` }}
                      className="block h-full bg-ink/80"
                    />
                  </div>
                  <span className="w-28 text-right font-mono text-body-sm text-ink">
                    {formatCurrency(d.amount, view.trip.baseCurrency)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Currency split */}
        {Object.keys(view.totalsByCurrency).length > 1 && (
          <section className="rounded-lg border border-hairline bg-canvas p-lg">
            <h2 className="mb-md text-title-md text-ink">原始幣別小計</h2>
            <ul className="space-y-1 text-body-sm">
              {Object.entries(view.totalsByCurrency).map(([cur, amount]) => (
                <li key={cur} className="flex items-center justify-between border-b border-hairline-soft pb-1.5">
                  <span className="font-mono">{cur}</span>
                  <span className="font-mono text-ink">{formatCurrency(amount, cur as CurrencyCode)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Detail rows */}
        <section className="rounded-lg border border-hairline bg-canvas">
          <div className="flex items-center justify-between border-b border-hairline-soft px-md py-sm">
            <h2 className="text-title-md text-ink">明細（{view.rows.length} 筆）</h2>
            <span className="text-caption text-muted-soft">依分類排序</span>
          </div>
          <table className="w-full text-body-sm">
            <thead className="bg-surface-soft text-caption text-muted-soft">
              <tr>
                <th className="px-md py-2 text-left">分類</th>
                <th className="px-md py-2 text-left">內容</th>
                <th className="px-md py-2 text-right">金額</th>
                <th className="px-md py-2 text-right">換算 {view.trip.baseCurrency}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {view.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-md py-10 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-1.5 text-muted-soft">
                      <Receipt size={20} strokeWidth={1.6} />
                      <p className="text-title-sm text-muted">尚無花費記錄</p>
                      <p className="text-caption">在編輯器中為景點 / 餐廳 / 票券加上價格，這裡會自動彙整。</p>
                    </div>
                  </td>
                </tr>
              )}
              {view.rows.map((r) => {
                const inBase = convertToBase(r.amount, r.currency, view.trip.baseCurrency, r.fxRateToBase, view.fxRates);
                return (
                  <tr key={r.id} className="hover:bg-surface-soft/50">
                    <td className="px-md py-2.5">
                      <span className={`rounded-pill px-2 py-0.5 text-[11px] ${CATEGORY_LABEL[r.category].cls}`}>
                        {CATEGORY_LABEL[r.category].label}
                      </span>
                    </td>
                    <td className="px-md py-2.5">
                      {r.ticket && (
                        <span className="inline-flex items-center gap-1 text-ink">
                          <TicketIcon size={12} strokeWidth={1.8} className="text-warning" />
                          {r.ticket.title}
                          {r.ticket.bookingRef && (
                            <span className="ml-1 font-mono text-[10px] text-muted">#{r.ticket.bookingRef}</span>
                          )}
                        </span>
                      )}
                      {!r.ticket && r.scheduleItem && (
                        <span className="text-ink">
                          {r.scheduleItem.placeName ?? "—"}
                          <span className="ml-1 text-[10px] text-muted-soft">Day {r.scheduleItem.dayIndex}</span>
                        </span>
                      )}
                      {!r.ticket && r.transport && (
                        <span className="text-ink">交通段（{r.transport.mode}）</span>
                      )}
                      {!r.ticket && !r.scheduleItem && !r.transport && (
                        <span className="text-muted">{r.note ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-md py-2.5 text-right font-mono">
                      {formatCurrency(r.amount, r.currency as CurrencyCode)}
                    </td>
                    <td className="px-md py-2.5 text-right font-mono text-muted">
                      {formatCurrency(inBase, view.trip.baseCurrency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
