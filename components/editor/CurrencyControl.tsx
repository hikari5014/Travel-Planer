"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { currencyMeta, formatRateAge, type CurrencyCode, type CurrencyRates } from "@/lib/currency";
import { refreshFxRatesAction, updateSettingsAction } from "@/app/(actions)/settings-actions";

// Compact pill in the top day strip — click to open a popover with:
//  · base / local currency dropdowns (writes Settings via Server Action)
//  · refresh button → open.er-api.com via refreshFxRatesAction
//  · last-updated relative time
//
// All currency codes from `currencyMeta` are listed; rates come from Settings
// and are also displayed inside the popover so the user sees what's loaded.

const CODES = Object.keys(currencyMeta) as CurrencyCode[];

export function CurrencyControl({
  primary,
  local,
  rates,
  fetchedAt,
}: {
  primary: CurrencyCode;
  local: CurrencyCode;
  rates: CurrencyRates;
  fetchedAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [age, setAge] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isUpdating, startUpdate] = useTransition();
  const [isRefreshing, startRefresh] = useTransition();
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Relative-age text on the client only (avoid SSR/CSR mismatch).
  useEffect(() => {
    if (!fetchedAt) return setAge(null);
    setAge(formatRateAge(fetchedAt));
    const id = setInterval(() => setAge(formatRateAge(fetchedAt)), 60_000);
    return () => clearInterval(id);
  }, [fetchedAt]);

  // Dismiss on outside click / ESC
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function changeCurrency(field: "baseCurrency" | "localCurrency", value: CurrencyCode) {
    const fd = new FormData();
    fd.append(field, value);
    startUpdate(() => updateSettingsAction(fd));
  }

  function refresh() {
    setRefreshError(null);
    startRefresh(async () => {
      try {
        await refreshFxRatesAction();
      } catch (e) {
        setRefreshError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  const localRate = rates.rates[local];

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        title={age ? `匯率更新：${age}` : "尚未抓過匯率，點擊重新整理"}
        className={`flex items-center gap-1.5 rounded-md border border-hairline bg-canvas px-2 py-1 text-[11px] text-muted hover:border-ink hover:text-ink ${
          open ? "border-ink text-ink" : ""
        }`}
      >
        <span className="font-mono">
          1 {primary} = {localRate ? localRate.toFixed(2) : "—"} {local}
        </span>
        <ChevronDown size={11} strokeWidth={2} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[320px] rounded-lg border border-hairline bg-canvas p-3 shadow-soft-elevation"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-caption-uppercase text-muted-soft">CURRENCY</p>
            <span className="text-[10px] text-muted-soft">{age ?? "尚未更新"}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <CurrencyDropdown
              label="主要（你的預算）"
              value={primary}
              onChange={(v) => changeCurrency("baseCurrency", v)}
              disabled={isUpdating}
            />
            <CurrencyDropdown
              label="當地（出行地）"
              value={local}
              onChange={(v) => changeCurrency("localCurrency", v)}
              disabled={isUpdating}
            />
          </div>

          <div className="mt-3 rounded-md bg-surface-soft p-2">
            <div className="flex items-center justify-between text-caption">
              <span className="text-muted">即時換算</span>
              <span className="font-mono text-ink">
                1 {primary} = {localRate ? localRate.toFixed(4) : "—"} {local}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-muted-soft">
              來源：{rates.source || "open.er-api.com"}
            </p>
          </div>

          {refreshError && (
            <p className="mt-2 rounded-md border border-error/30 bg-error/5 px-2 py-1 text-[11px] text-error">
              更新失敗：{refreshError}
            </p>
          )}

          <button
            onClick={refresh}
            disabled={isRefreshing}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-button text-on-primary hover:bg-primary-active disabled:opacity-60"
          >
            {isRefreshing ? (
              <>
                <Loader2 size={12} strokeWidth={2} className="animate-spin" />
                更新中…
              </>
            ) : (
              <>
                <RefreshCw size={12} strokeWidth={2} />
                立即更新匯率（open.er-api.com）
              </>
            )}
          </button>

          <p className="mt-2 text-center text-[10px] text-muted-soft">
            或前往 <a href="/settings" className="underline hover:text-ink">/settings</a> 手動編輯
          </p>
        </div>
      )}
    </div>
  );
}

function CurrencyDropdown({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: CurrencyCode;
  onChange: (v: CurrencyCode) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CurrencyCode)}
        disabled={disabled}
        className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none disabled:opacity-60"
      >
        {CODES.map((c) => {
          const m = currencyMeta[c];
          return (
            <option key={c} value={c}>
              {m.flag} {c} {m.name}
            </option>
          );
        })}
      </select>
    </label>
  );
}
