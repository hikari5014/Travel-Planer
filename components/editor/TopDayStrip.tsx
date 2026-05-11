"use client";

import { useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import type { MockDay } from "@/lib/mock-schedule";
import { PriceWithLocal } from "@/components/common/PriceWithLocal";
import { CurrencyControl } from "@/components/editor/CurrencyControl";
import { useCurrencyContext } from "@/lib/currency-context";
import type { Money } from "@/lib/currency";

export function TopDayStrip({
  days,
  currentDayId,
  onDayChange,
  totalCost,
  totalDistanceKm,
  totalItems,
  totalTickets,
  onAddDay,
}: {
  days: MockDay[];
  currentDayId: string;
  onDayChange: (id: string) => void;
  // Phase B3 — Money-tagged total cost; currency is encoded in the value.
  totalCost: Money;
  totalDistanceKm: number;
  totalItems: number;
  totalTickets: number;
  // EditorShell wires this to appendDayAction(tripId).
  onAddDay?: () => void | Promise<void>;
}) {
  const ctx = useCurrencyContext();
  const [isAdding, startAdd] = useTransition();
  return (
    <div className="border-b border-hairline-soft bg-surface-soft">
      <div className="flex items-stretch gap-md px-md py-2">
        {/* Days strip — horizontal scroll if many; faint dividers between pills. */}
        <div className="flex flex-1 items-stretch gap-2 overflow-x-auto">
          <span className="self-center px-2 text-caption-uppercase text-muted-soft">DAYS</span>
          {days.map((d, idx) => {
            const active = d.id === currentDayId;
            const itemCount = d.items.filter((i) => !i.isAllDay).length;
            const labelCls = `text-[10px] uppercase tracking-wide leading-tight ${
              active ? "text-muted" : "text-muted-soft"
            }`;
            return (
              <div key={d.id} className="flex items-center gap-2">
                {idx > 0 && (
                  <span aria-hidden className="h-7 w-px bg-hairline" />
                )}
              <button
                onClick={() => onDayChange(d.id)}
                className={`group flex flex-col items-start whitespace-nowrap rounded-md border px-3 py-1 text-caption transition-colors ${
                  active
                    ? "border-ink bg-canvas text-ink shadow-soft-elevation"
                    : "border-transparent text-body hover:border-hairline hover:bg-canvas/60 hover:text-ink"
                }`}
              >
                <span className={labelCls}>DAY {d.dayIndex}</span>
                <span className="flex items-center gap-1.5 leading-tight">
                  <span className={active ? "text-ink" : "text-body"}>
                    {formatDate(d.date)}
                    <span className={`ml-1 ${active ? "text-muted" : "text-muted-soft"}`}>週{d.weekday}</span>
                  </span>
                  {itemCount > 0 && (
                    <span className={`rounded-pill bg-success/15 px-1.5 py-px text-[10px] font-medium ${
                      active ? "text-ink" : "text-muted"
                    }`}>
                      {itemCount}
                    </span>
                  )}
                </span>
              </button>
              </div>
            );
          })}
          <button
            disabled={!onAddDay || isAdding}
            onClick={() => onAddDay && startAdd(async () => { await onAddDay(); })}
            className="ml-2 flex items-center gap-1 self-center rounded-md border border-dashed border-hairline px-2.5 py-1.5 text-caption text-muted hover:border-primary hover:text-primary disabled:opacity-50"
            title="新增一天"
          >
            {isAdding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} strokeWidth={2.2} />}
          </button>
        </div>

        {/* Right: summary + currency status */}
        <div className="flex flex-shrink-0 items-stretch gap-3 border-l border-hairline-soft pl-md">
          <Summary label="景點" value={String(totalItems)} />
          <Summary label="距離" value={`${totalDistanceKm}km`} />
          <Summary label="票卷" value={String(totalTickets)} />
          <div className="flex flex-col justify-center">
            <span className="text-[10px] uppercase tracking-wide text-muted-soft">本方案累計</span>
            <PriceWithLocal value={totalCost} size="lg" align="left" />
          </div>
          {ctx ? (
            <CurrencyControl
              primary={ctx.primary}
              local={ctx.local}
              rates={ctx.rates}
              fetchedAt={ctx.fetchedAt}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-start justify-center">
      <span className="text-[10px] uppercase tracking-wide text-muted-soft">{label}</span>
      <span className="font-mono text-body-sm text-ink leading-tight">{value}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
