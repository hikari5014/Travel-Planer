"use client";

import { useState } from "react";
import { CalendarRange, Calendar, CalendarDays, ChevronDown } from "lucide-react";
import type { MockDay } from "@/lib/mock-schedule";

export type CompareScope =
  | { kind: "trip" }
  | { kind: "day"; dayId: string }
  | { kind: "range"; startDayId: string; endDayId: string };

export function CompareScopeBar({
  days,
  scope,
  onChange,
}: {
  days: MockDay[];
  scope: CompareScope;
  onChange: (next: CompareScope) => void;
}) {
  const [openMenu, setOpenMenu] = useState<null | "trip" | "day" | "range">(null);

  function close() {
    setOpenMenu(null);
  }

  const summary = describeScope(scope, days);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-canvas px-2 py-1.5">
      {/* Scope kind tabs */}
      <div className="flex items-center gap-px rounded-md bg-surface-soft p-0.5">
        <ScopeTab
          active={scope.kind === "trip"}
          onClick={() => onChange({ kind: "trip" })}
          icon={<CalendarRange size={12} />}
        >
          整趟旅程
        </ScopeTab>
        <ScopeTab
          active={scope.kind === "day"}
          onClick={() => {
            if (scope.kind !== "day") {
              onChange({ kind: "day", dayId: days[0]?.id ?? "" });
            }
            setOpenMenu(openMenu === "day" ? null : "day");
          }}
          icon={<Calendar size={12} />}
        >
          單天
        </ScopeTab>
        <ScopeTab
          active={scope.kind === "range"}
          onClick={() => {
            if (scope.kind !== "range") {
              onChange({ kind: "range", startDayId: days[0]?.id ?? "", endDayId: days[Math.min(2, days.length - 1)]?.id ?? "" });
            }
            setOpenMenu(openMenu === "range" ? null : "range");
          }}
          icon={<CalendarDays size={12} />}
        >
          區間
        </ScopeTab>
      </div>

      {/* Sub-controls based on scope */}
      {scope.kind === "day" && (
        <DayPicker
          days={days}
          value={scope.dayId}
          onChange={(id) => onChange({ kind: "day", dayId: id })}
          open={openMenu === "day"}
          onToggle={() => setOpenMenu(openMenu === "day" ? null : "day")}
          onClose={close}
        />
      )}
      {scope.kind === "range" && (
        <div className="flex items-center gap-1">
          <DayPicker
            days={days}
            value={scope.startDayId}
            onChange={(id) => onChange({ ...scope, startDayId: id })}
            open={openMenu === "range" && false /* simpler popover handled inline */}
            onToggle={() => {}}
            onClose={close}
            label="從"
          />
          <span className="text-muted-soft">→</span>
          <DayPicker
            days={days.filter((d) => {
              const start = days.find((x) => x.id === scope.startDayId);
              return !start || d.dayIndex >= start.dayIndex;
            })}
            value={scope.endDayId}
            onChange={(id) => onChange({ ...scope, endDayId: id })}
            open={false}
            onToggle={() => {}}
            onClose={close}
            label="到"
          />
        </div>
      )}

      {/* Summary chip */}
      <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted">
        對比範圍：
        <span className="rounded-pill bg-surface-card px-2 py-0.5 text-ink">{summary}</span>
      </span>
    </div>
  );
}

function ScopeTab({
  children,
  active,
  onClick,
  icon,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-sm px-2 py-1 text-caption transition-colors ${
        active ? "bg-canvas text-ink shadow-soft-elevation" : "text-muted hover:text-ink"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function DayPicker({
  days,
  value,
  onChange,
  open,
  onToggle,
  onClose,
  label,
}: {
  days: MockDay[];
  value: string;
  onChange: (id: string) => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  label?: string;
}) {
  const day = days.find((d) => d.id === value);
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="inline-flex items-center gap-1 rounded-md border border-hairline bg-canvas px-2 py-1 text-caption text-ink hover:border-ink"
      >
        {label && <span className="text-muted-soft">{label}</span>}
        <span>
          {day ? `Day ${day.dayIndex} · ${formatDate(day.date)}` : "選擇"}
        </span>
        <ChevronDown size={11} strokeWidth={2} className="text-muted" />
      </button>
      {open && (
        <>
          <button
            tabIndex={-1}
            onClick={onClose}
            className="fixed inset-0 z-30 cursor-default bg-transparent"
          />
          <div className="absolute left-0 z-40 mt-1 max-h-72 w-48 overflow-y-auto rounded-md border border-hairline bg-canvas py-1 shadow-pop">
            {days.map((d) => {
              const itemCount = d.items.filter((i) => !i.isAllDay).length;
              const isSelected = d.id === value;
              return (
                <button
                  key={d.id}
                  onClick={() => {
                    onChange(d.id);
                    onClose();
                  }}
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-caption transition-colors ${
                    isSelected ? "bg-surface-card text-ink" : "text-body hover:bg-surface-soft"
                  }`}
                >
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-surface-card text-[11px] text-muted">
                    {d.dayIndex}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm">Day {d.dayIndex} · {formatDate(d.date)}</p>
                    <p className="text-[10px] text-muted-soft">
                      週{d.weekday} · {itemCount > 0 ? `${itemCount} 個項目` : "未排定"}
                    </p>
                  </div>
                  {itemCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function describeScope(scope: CompareScope, days: MockDay[]): string {
  if (scope.kind === "trip") return `整趟 · ${days.length} 天`;
  if (scope.kind === "day") {
    const d = days.find((x) => x.id === scope.dayId);
    return d ? `Day ${d.dayIndex} · ${formatDate(d.date)}` : "—";
  }
  const s = days.find((x) => x.id === scope.startDayId);
  const e = days.find((x) => x.id === scope.endDayId);
  if (!s || !e) return "—";
  const span = e.dayIndex - s.dayIndex + 1;
  return `Day ${s.dayIndex}–${e.dayIndex} · 共 ${span} 天`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
